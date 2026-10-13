import assert from "node:assert/strict";
import crypto from "crypto";
import {
  verifyAppProxyHmac,
  validateShopDomain,
  validateEmail,
  checkDurableRateLimit,
} from "../app/services/proxySecurity.server";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../app/services/unsubscribeToken.server";
import {
  recordWebhookEvent,
  enqueueInventoryRestock,
} from "../app/services/restockQueue.server";
import db from "../app/db.server";

console.log("================================================");
console.log("RestockPing Security & Webhook Hardening Tests");
console.log("================================================\n");

let passed = 0;
let total = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  total++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`✅ PASS: ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
    });
}

const secretKey = "test-secret-key-12345";
process.env.SHOPIFY_API_SECRET = secretKey;

// Helper to compute a valid Shopify App Proxy signature
function signAppProxyUrl(baseUrl: string, secret: string, params: Record<string, string>): URL {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const entries: [string, string][] = [];
  url.searchParams.forEach((v, k) => {
    if (k !== "signature") entries.push([k, v]);
  });
  entries.sort(([a], [b]) => a.localeCompare(b));
  const message = entries.map(([k, v]) => `${k}=${v}`).join("");
  const sig = crypto.createHmac("sha256", secret).update(message).digest("hex");
  url.searchParams.set("signature", sig);
  return url;
}

// 1. App Proxy HMAC Verification
await runTest("App Proxy HMAC verifies authentic signatures and rejects forged ones", () => {
  const now = Math.floor(Date.now() / 1000).toString();
  const validUrl = signAppProxyUrl("https://example.com/apps/restockping/subscribe", secretKey, {
    shop: "demo-store.myshopify.com",
    path_prefix: "/apps/restockping",
    timestamp: now,
  });

  const validResult = verifyAppProxyHmac(validUrl, secretKey);
  assert.equal(validResult.isValid, true);

  // Forged signature
  const forgedUrl = new URL(validUrl.toString());
  forgedUrl.searchParams.set("signature", "deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb");
  const forgedResult = verifyAppProxyHmac(forgedUrl, secretKey);
  assert.equal(forgedResult.isValid, false);

  // Missing signature
  const noSigUrl = new URL(validUrl.toString());
  noSigUrl.searchParams.delete("signature");
  const noSigResult = verifyAppProxyHmac(noSigUrl, secretKey);
  assert.equal(noSigResult.isValid, false);
});

// 2. App Proxy Replay Attack Protection (Timestamp Expiry)
await runTest("Rejects expired timestamps (>300 seconds) to prevent replay attacks", () => {
  const expiredTimestamp = Math.floor(Date.now() / 1000 - 400).toString();
  const expiredUrl = signAppProxyUrl("https://example.com/apps/restockping/subscribe", secretKey, {
    shop: "demo-store.myshopify.com",
    timestamp: expiredTimestamp,
  });

  const expiredResult = verifyAppProxyHmac(expiredUrl, secretKey);
  assert.equal(expiredResult.isValid, false);
  assert.ok(expiredResult.reason?.includes("expired"));
});

// 3. Shop Domain Strict Validation
await runTest("Strictly validates myshopify.com domain format", () => {
  assert.equal(validateShopDomain("snowboards.myshopify.com"), true);
  assert.equal(validateShopDomain("my-brand-123.myshopify.com"), true);
  assert.equal(validateShopDomain("snowboards.myshopify.com.evil.com"), false);
  assert.equal(validateShopDomain("evil.com"), false);
  assert.equal(validateShopDomain("javascript:alert(1)"), false);
  assert.equal(validateShopDomain("../../../etc/passwd"), false);
  assert.equal(validateShopDomain(""), false);
});

// 4. Email Validation
await runTest("Strictly validates email format and prevents invalid inputs", () => {
  assert.equal(validateEmail("shopper@example.com"), true);
  assert.equal(validateEmail("user.name+tag@domain.co.uk"), true);
  assert.equal(validateEmail("plainaddress"), false);
  assert.equal(validateEmail("@missinguser.com"), false);
  assert.equal(validateEmail("user@.com"), false);
  assert.equal(validateEmail("user@domain..com"), false);
  assert.equal(validateEmail("a".repeat(260) + "@domain.com"), false);
});

// 5. Signed Unsubscribe Tokens
await runTest("Generates tamper-proof unsubscribe tokens scoped to shop and subscription", () => {
  const token = generateUnsubscribeToken({
    subscriptionId: "sub-123",
    shop: "alpinesports.myshopify.com",
    email: "rider@example.com",
  });

  const verified = verifyUnsubscribeToken(token);
  assert.ok(verified, "Token should verify successfully");
  assert.equal(verified?.subId, "sub-123");
  assert.equal(verified?.shop, "alpinesports.myshopify.com");
  assert.equal(verified?.email, "rider@example.com");

  // Tampered payload
  const [payloadEnc, sig] = token.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ subId: "sub-999", shop: "hacked.myshopify.com", email: "victim@example.com" })
  ).toString("base64url");
  const tamperedToken = `${tamperedPayload}.${sig}`;

  assert.equal(verifyUnsubscribeToken(tamperedToken), null, "Tampered token must be rejected");
  assert.equal(verifyUnsubscribeToken("invalid-garbage"), null);
});

// 6. Tenant-Isolated Single Dispatch Check
await runTest("Ensures single dispatch is strictly isolated to the authenticated shop", async () => {
  const shopA = "shop-a.myshopify.com";
  const shopB = "shop-b.myshopify.com";

  // Create test subscriptions in both shops
  const subA = await db.restockSubscription.create({
    data: {
      shop: shopA,
      customerEmail: "user-a@example.com",
      productId: "prod-a",
      variantId: "var-a-1",
      inventoryItemId: "inv-a-1",
      productTitle: "Shop A Product",
      variantTitle: "Default",
      status: "PENDING",
    },
  });

  // An admin for Shop B attempts to query or dispatch subA
  const shopBAttempt = await db.restockSubscription.findFirst({
    where: { id: subA.id, shop: shopB },
  });
  assert.equal(shopBAttempt, null, "Shop B MUST NOT be able to view or claim Shop A subscription");

  // An update scoped to Shop B does not mutate Shop A
  const updateResult = await db.restockSubscription.updateMany({
    where: { id: subA.id, shop: shopB },
    data: { status: "DISPATCHED" },
  });
  assert.equal(updateResult.count, 0, "Shop B update MUST NOT affect Shop A record");

  // Sub A remains untouched
  const recheckSubA = await db.restockSubscription.findUnique({ where: { id: subA.id } });
  assert.equal(recheckSubA?.status, "PENDING");

  // Cleanup test row
  await db.restockSubscription.delete({ where: { id: subA.id } });
});

// 7. Atomic Subscription Claiming
await runTest("Atomic claim transitions PENDING to QUEUED and blocks concurrent workers", async () => {
  const testShop = "claim-test.myshopify.com";
  const sub = await db.restockSubscription.create({
    data: {
      shop: testShop,
      customerEmail: "racer@example.com",
      productId: "prod-race",
      variantId: "var-race-1",
      inventoryItemId: "inv-race-1",
      productTitle: "Racing Goggles",
      variantTitle: "Clear",
      status: "PENDING",
    },
  });

  // Worker 1 claims subscription
  const worker1Claim = await db.restockSubscription.updateMany({
    where: { id: sub.id, shop: testShop, status: "PENDING" },
    data: { status: "QUEUED" },
  });
  assert.equal(worker1Claim.count, 1, "Worker 1 should claim successfully");

  // Worker 2 attempts to claim simultaneously
  const worker2Claim = await db.restockSubscription.updateMany({
    where: { id: sub.id, shop: testShop, status: "PENDING" },
    data: { status: "QUEUED" },
  });
  assert.equal(worker2Claim.count, 0, "Worker 2 MUST NOT be able to claim already QUEUED subscription");

  // Cleanup test row
  await db.restockSubscription.delete({ where: { id: sub.id } });
});

// 8. Durable Webhook Idempotency
await runTest("Durable WebhookEvent rejects duplicate deliveries with identical webhook ID", async () => {
  const webhookId = `wh-test-${Date.now()}`;
  const testShop = "idempotent-test.myshopify.com";

  const firstDelivery = await recordWebhookEvent(webhookId, testShop, "INVENTORY_LEVELS_UPDATE");
  assert.equal(firstDelivery.isDuplicate, false, "First delivery should be recorded");

  const duplicateDelivery = await recordWebhookEvent(webhookId, testShop, "INVENTORY_LEVELS_UPDATE");
  assert.equal(duplicateDelivery.isDuplicate, true, "Duplicate delivery should be identified and blocked");

  // Cleanup test row
  await db.webhookEvent.delete({ where: { id: webhookId } });
});

// 9. Inventory Restock Enqueueing & Quantity Drop Protection
await runTest("Ignores inventory decreases (sales/adjustments) and enqueues real restocks", async () => {
  const testShop = "queue-test.myshopify.com";
  const rawId = `${Date.now()}`;
  const invItemId = `gid://shopify/InventoryItem/${rawId}`;

  // Initial state: 10 units
  await db.inventoryLocationState.upsert({
    where: { shop_inventoryItemId_locationId: { shop: testShop, inventoryItemId: invItemId, locationId: "ALL" } },
    update: { lastAvailable: 10 },
    create: { shop: testShop, inventoryItemId: invItemId, locationId: "ALL", lastAvailable: 10 },
  });

  // Case A: Inventory decreases from 10 to 8 (item purchased) -> SHOULD NOT ENQUEUE
  const dropResult = await enqueueInventoryRestock({
    shop: testShop,
    inventoryItemId: invItemId,
    availableQuantity: 8,
  });
  assert.equal(dropResult.enqueued, false);
  assert.ok(dropResult.reason?.includes("did not increase"));

  // Case B: Inventory increases from 8 to 25 (genuine restock) -> SHOULD ENQUEUE
  const restockResult = await enqueueInventoryRestock({
    shop: testShop,
    inventoryItemId: invItemId,
    availableQuantity: 25,
  });
  assert.equal(restockResult.enqueued, true);
  assert.ok(restockResult.jobId);

  // Cleanup test state
  if (restockResult.jobId) {
    await db.restockJob.delete({ where: { id: restockResult.jobId } });
  }
  await db.inventoryLocationState.deleteMany({ where: { shop: testShop } });
});

// 10. Durable Rate Limiter Test
await runTest("Durable rate limiter blocks excessive requests within sliding window", async () => {
  const testKey = `ratelimit-test-${Date.now()}`;

  // Make 3 requests (max 3)
  const req1 = await checkDurableRateLimit(testKey, 3, 60000);
  assert.equal(req1.allowed, true);
  assert.equal(req1.remaining, 2);

  const req2 = await checkDurableRateLimit(testKey, 3, 60000);
  assert.equal(req2.allowed, true);
  assert.equal(req2.remaining, 1);

  const req3 = await checkDurableRateLimit(testKey, 3, 60000);
  assert.equal(req3.allowed, true);
  assert.equal(req3.remaining, 0);

  // 4th request exceeds limit
  const req4 = await checkDurableRateLimit(testKey, 3, 60000);
  assert.equal(req4.allowed, false);
  assert.equal(req4.remaining, 0);

  // Cleanup test rate limit record
  await db.rateLimitRecord.delete({ where: { key: testKey } });
});

console.log(`\n================================================`);
console.log(`Tests Completed: ${passed}/${total} passed`);
console.log(`================================================`);

if (passed !== total) {
  process.exit(1);
}
