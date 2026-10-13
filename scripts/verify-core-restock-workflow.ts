import db from "../app/db.server";
import { calculateConversionMetrics } from "../app/services/fifoEngine.server";
import { attributeOrderConversion } from "../app/services/orderAttribution.server";
import { encryptCredential, decryptCredential } from "../app/services/crypto.server";
import { isEmailSuppressed, suppressEmail, removeSuppression } from "../app/services/suppression.server";
import { enqueueInventoryRestock } from "../app/services/restockQueue.server";

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log("=== RestockPing Core Workflow Verification Suite ===\n");
  const testShop = "test-workflow-store.myshopify.com";

  try {
    // Clean up test data for this shop
    await db.restockSubscription.deleteMany({ where: { shop: testShop } });
    await db.restockJob.deleteMany({ where: { shop: testShop } });
    await db.restockSettings.deleteMany({ where: { shop: testShop } });
    await db.emailSuppression.deleteMany({ where: { shop: testShop } });

    // TEST 1: Dashboard Dispatched Count Fix (Requirement 4)
    console.log("--- 1. Dashboard Metrics Count Verification ---");
    const sampleSubsWithNoConversions = [
      { status: "DISPATCHED" },
      { status: "DISPATCHED" },
      { status: "DISPATCHED" },
      { status: "PENDING" },
      { status: "PENDING" },
    ];
    const metricsResult = calculateConversionMetrics(sampleSubsWithNoConversions);
    assert(
      metricsResult.dispatchedCount === 3,
      `dispatchedCount preserves real count (expected 3, got ${metricsResult.dispatchedCount}) when convertedCount is 0`
    );
    assert(
      metricsResult.convertedCount === 0,
      `convertedCount is 0`
    );
    assert(
      metricsResult.ctrBadgeLabel === "3 Sent (Awaiting Orders)",
      `ctrBadgeLabel explains status honestly ("${metricsResult.ctrBadgeLabel}")`
    );

    // TEST 2: Credential Encryption & Decryption (Requirement 6)
    console.log("\n--- 2. Per-Shop Credential Encryption (AES-256-GCM) ---");
    const rawSecret = "super-secret-smtp-password-12345!";
    const encrypted = encryptCredential(rawSecret);
    assert(
      encrypted !== rawSecret && encrypted.split(":").length === 3,
      "Secret is encrypted in iv:authTag:ciphertext format"
    );
    const decrypted = decryptCredential(encrypted);
    assert(
      decrypted === rawSecret,
      "Decrypted secret matches original plaintext exactly"
    );

    // TEST 3: Email Suppression & Bounce Handling (Requirement 7)
    console.log("\n--- 3. Email Suppression & Bounce Handling ---");
    const testEmail = "bounced-shopper@example.com";
    assert(
      !(await isEmailSuppressed(testShop, testEmail)),
      "Email is initially not suppressed"
    );
    await suppressEmail(testShop, testEmail, "BOUNCE", "550 Mailbox does not exist");
    assert(
      await isEmailSuppressed(testShop, testEmail),
      "Hard bounce records email in EmailSuppression table"
    );
    await removeSuppression(testShop, testEmail);
    assert(
      !(await isEmailSuppressed(testShop, testEmail)),
      "removeSuppression unblocks email when requested"
    );

    // TEST 4: Shopify Order Attribution (Requirement 3)
    console.log("\n--- 4. Shopify Order Conversion Attribution ---");
    const sub1 = await db.restockSubscription.create({
      data: {
        shop: testShop,
        productId: "gid://shopify/Product/101",
        variantId: "gid://shopify/ProductVariant/202",
        inventoryItemId: "gid://shopify/InventoryItem/303",
        productTitle: "Ultra Warm Beanie",
        variantTitle: "Charcoal",
        priceSnapshot: 28.0,
        customerEmail: "buyer1@example.com",
        status: "DISPATCHED",
        dispatchedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Dispatched 2 days ago
      },
    });

    const sub2 = await db.restockSubscription.create({
      data: {
        shop: testShop,
        productId: "gid://shopify/Product/101",
        variantId: "gid://shopify/ProductVariant/202",
        inventoryItemId: "gid://shopify/InventoryItem/303",
        productTitle: "Ultra Warm Beanie",
        variantTitle: "Charcoal",
        priceSnapshot: 28.0,
        customerEmail: "buyer2@example.com",
        status: "DISPATCHED",
        dispatchedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Dispatched 5 days ago
      },
    });

    // Order 1: Match by email and line item variant
    const orderPayload1 = {
      id: "ord_9901",
      order_number: 1001,
      email: "buyer1@example.com",
      created_at: new Date().toISOString(),
      line_items: [
        {
          variant_id: "202",
          product_id: "101",
          quantity: 1,
        },
      ],
    };

    const attrResult1 = await attributeOrderConversion(testShop, orderPayload1);
    assert(
      attrResult1.matchedCount === 1 && attrResult1.convertedSubscriptionIds.includes(sub1.id),
      `Order matched by customer email + variant ID (${sub1.id})`
    );

    const updatedSub1 = await db.restockSubscription.findUnique({ where: { id: sub1.id } });
    assert(
      updatedSub1?.status === "CONVERTED" && updatedSub1?.convertedAt !== null,
      "Subscription status transitioned to CONVERTED with convertedAt timestamp"
    );

    // Order 2: Match by explicit restock_sub_id note attribute
    const orderPayload2 = {
      id: "ord_9902",
      order_number: 1002,
      email: "different-email@example.com",
      note_attributes: [
        { name: "restock_sub_id", value: sub2.id },
      ],
      created_at: new Date().toISOString(),
    };

    const attrResult2 = await attributeOrderConversion(testShop, orderPayload2);
    assert(
      attrResult2.matchedCount === 1 && attrResult2.convertedSubscriptionIds.includes(sub2.id),
      `Order matched by explicit restock_sub_id attribute (${sub2.id})`
    );

    const updatedSub2 = await db.restockSubscription.findUnique({ where: { id: sub2.id } });
    assert(
      updatedSub2?.status === "CONVERTED",
      "Subscription 2 transitioned to CONVERTED"
    );

    // TEST 5: Durable Cooldown & Paced Queue Scheduling (Requirement 1)
    console.log("\n--- 5. Durable Inventory Pacing & Queue Enqueue ---");
    await db.restockSettings.create({
      data: {
        shop: testShop,
        dripBatchMultiplier: 2.5,
        dripIntervalMinutes: 60,
        minRestockThreshold: 2,
      },
    });

    const enqResult = await enqueueInventoryRestock({
      shop: testShop,
      inventoryItemId: "gid://shopify/InventoryItem/303",
      availableQuantity: 10,
    });

    assert(
      enqResult.enqueued === true && Boolean(enqResult.jobId),
      "Restock job successfully enqueued into PostgreSQL RestockJob table"
    );

    // Repeated inventory update with same or lower stock must be ignored
    const duplicateEnq = await enqueueInventoryRestock({
      shop: testShop,
      inventoryItemId: "gid://shopify/InventoryItem/303",
      availableQuantity: 9, // Inventory decreased (sale)
    });

    assert(
      duplicateEnq.enqueued === false && String(duplicateEnq.reason).includes("Inventory did not increase"),
      "Inventory decrement (sale) correctly rejected without alerting waitlist"
    );

    // Clean up
    await db.restockSubscription.deleteMany({ where: { shop: testShop } });
    await db.restockJob.deleteMany({ where: { shop: testShop } });
    await db.restockSettings.deleteMany({ where: { shop: testShop } });
    await db.emailSuppression.deleteMany({ where: { shop: testShop } });
  } catch (err: any) {
    console.error("Test execution threw error:", err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Total Passed: ${passed} | Total Failed: ${failed}`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests();
