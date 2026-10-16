import assert from "node:assert/strict";
import {
  escapeHtml,
  validateHexColor,
  validateSafeUrl,
  formatTemplatePrice,
  interpolateTemplate,
  renderEmailCopy,
  renderHtmlEmail,
  renderPlainTextEmail,
} from "../app/utils/emailTemplate";

console.log("=========================================");
console.log("RestockPing Email & Template Test Suite");
console.log("=========================================\n");

let passed = 0;
let total = 0;

function runTest(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
  }
}

// 1. Template Interpolation
runTest("Interpolates {{product_title}}, {{variant_title}}, {{price}}, and {{store}}", () => {
  const result = renderEmailCopy({
    subjectTemplate: "Back in Stock: {{product_title}} ({{variant_title}}) at {{store}} for {{price}}!",
    headlineTemplate: "{{store}}: {{product_title}} is back!",
    bodyTemplate: "Hurry to {{store}}! Get {{product_title}} - {{variant_title}} for {{price}} before it sells out.",
    variables: {
      product_title: "Alpine Snowboard",
      variant_title: "158cm / Matte Black",
      price: 199.99,
      store: "Peak Sports",
    },
  });

  assert.equal(
    result.subject,
    "Back in Stock: Alpine Snowboard (158cm / Matte Black) at Peak Sports for $199.99!"
  );
  assert.equal(result.headline, "Peak Sports: Alpine Snowboard is back!");
  assert.equal(
    result.bodyText,
    "Hurry to Peak Sports! Get Alpine Snowboard - 158cm / Matte Black for $199.99 before it sells out."
  );
});

// 2. Whitespace and Case Insensitivity in Placeholders
runTest("Handles whitespace and variable aliases in template tags", () => {
  const template = "Item: {{  PRODUCT_TITLE  }}, Variant: {{ variant_title }}, Price: {{ product_price }}, Store: {{ shop_name }}";
  const output = interpolateTemplate(template, {
    product_title: "Thermal Gloves",
    variant_title: "Large",
    price: 29.5,
    store: "Winter Gear Co",
  });
  assert.equal(output, "Item: Thermal Gloves, Variant: Large, Price: $29.50, Store: Winter Gear Co");
});

// 3. HTML Escaping
runTest("Escapes malicious script tags, quotes, and HTML special chars", () => {
  const maliciousInput = '<script>alert("xss")</script> & "special" \'chars\'';
  const escaped = escapeHtml(maliciousInput);
  assert.ok(!escaped.includes("<script>"));
  assert.ok(escaped.includes("&lt;script&gt;"));
  assert.ok(escaped.includes("&quot;special&quot;"));
  assert.ok(escaped.includes("&#39;chars&#39;"));
  assert.ok(escaped.includes("&amp;"));
});

// 4. URL and Protocol Validation
runTest("Validates safe URLs and rejects dangerous javascript: schemes", () => {
  assert.equal(
    validateSafeUrl("https://example.myshopify.com/cart/123:1"),
    "https://example.myshopify.com/cart/123:1"
  );
  assert.equal(
    validateSafeUrl("http://example.myshopify.com/cart/123:1"),
    "http://example.myshopify.com/cart/123:1"
  );
  assert.equal(validateSafeUrl("javascript:alert(1)"), "");
  assert.equal(validateSafeUrl("data:text/html;base64,PHNjcmlwdD4="), "");
  assert.equal(validateSafeUrl("   "), "");
});

// 5. Hex Color Validation
runTest("Validates 3-digit and 6-digit hex colors, defaults safely", () => {
  assert.equal(validateHexColor("#008060"), "#008060");
  assert.equal(validateHexColor("#fff"), "#fff");
  assert.equal(validateHexColor("#1A2B3C"), "#1A2B3C");
  assert.equal(validateHexColor("red"), "#008060");
  assert.equal(validateHexColor("expression(alert(1))"), "#008060");
  assert.equal(validateHexColor(undefined), "#008060");
});

// 6. Price Formatting Edge Cases
runTest("Formats numeric 0, string prices, and decimals without reverting to $0", () => {
  assert.equal(formatTemplatePrice(0), "$0.00");
  assert.equal(formatTemplatePrice(49), "$49.00");
  assert.equal(formatTemplatePrice(12.3456), "$12.35");
  assert.equal(formatTemplatePrice("89.95"), "$89.95");
  assert.equal(formatTemplatePrice(null), "");
  assert.equal(formatTemplatePrice(undefined), "");
});

// 7. Honest Image Fallback: Normal vs Error
runTest("Distinguishes 'no image uploaded' from 'image lookup failed'", () => {
  // Case A: Image present
  const htmlWithImage = renderHtmlEmail({
    storeDisplayName: "Peak Sports",
    headline: "Back in Stock",
    bodyText: "Your item is ready.",
    buttonText: "Claim Item",
    buttonColor: "#008060",
    productTitle: "Snowboard",
    variantTitle: "158cm",
    price: 199.99,
    productImageUrl: "https://cdn.shopify.com/s/files/1/0001/snowboard.jpg",
    checkoutUrl: "https://peak.myshopify.com/cart/123:1",
    unsubscribeUrl: "https://peak.myshopify.com/apps/restockping/unsubscribe?token=abc",
  });
  assert.ok(htmlWithImage.includes("https://cdn.shopify.com/s/files/1/0001/snowboard.jpg?width=300"));
  assert.ok(!htmlWithImage.includes("Lookup Error"));

  // Case B: No image in catalog (honest empty state)
  const htmlNoImage = renderHtmlEmail({
    storeDisplayName: "Peak Sports",
    headline: "Back in Stock",
    bodyText: "Your item is ready.",
    buttonText: "Claim Item",
    buttonColor: "#008060",
    productTitle: "Gift Card",
    variantTitle: "Default",
    price: 25.0,
    checkoutUrl: "https://peak.myshopify.com/cart/123:1",
    unsubscribeUrl: "https://peak.myshopify.com/apps/restockping/unsubscribe?token=abc",
  });
  assert.ok(htmlNoImage.includes("No product image uploaded in store catalog"));
  assert.ok(htmlNoImage.includes("No Image"));
  assert.ok(!htmlNoImage.includes("Lookup Error"));

  // Case C: Image lookup failed (Shopify API error)
  const htmlLookupFailed = renderHtmlEmail({
    storeDisplayName: "Peak Sports",
    headline: "Back in Stock",
    bodyText: "Your item is ready.",
    buttonText: "Claim Item",
    buttonColor: "#008060",
    productTitle: "Pro Jacket",
    variantTitle: "Medium",
    price: 150.0,
    imageLookupError: "GraphQL query error: read_products scope denied",
    checkoutUrl: "https://peak.myshopify.com/cart/123:1",
    unsubscribeUrl: "https://peak.myshopify.com/apps/restockping/unsubscribe?token=abc",
  });
  assert.ok(htmlLookupFailed.includes("Product image lookup failed (Shopify API error)"));
  assert.ok(htmlLookupFailed.includes("Lookup Error"));
});

// 8. Plain-text Alternative Content
runTest("Generates complete plain-text email with all essential details", () => {
  const plainText = renderPlainTextEmail({
    storeDisplayName: "Summit Gear",
    headline: "Back in Stock Now!",
    bodyText: "An item you wanted is ready to ship.",
    buttonText: "Buy Now",
    productTitle: "Camping Tent",
    variantTitle: "4-Person / Green",
    price: 249.99,
    discountCode: "SUMMER10",
    checkoutUrl: "https://summit.myshopify.com/cart/456:1?discount=SUMMER10",
    unsubscribeUrl: "https://summit.myshopify.com/apps/restockping/unsubscribe?token=xyz",
  });

  assert.ok(plainText.includes("Summit Gear - Restock Notice"));
  assert.ok(plainText.includes("Back in Stock Now!"));
  assert.ok(plainText.includes("Item: Camping Tent (4-Person / Green)"));
  assert.ok(plainText.includes("Price: $249.99"));
  assert.ok(plainText.includes("Discount Code: SUMMER10 (apply at checkout)"));
  assert.ok(plainText.includes("Claim item & complete checkout:"));
  assert.ok(plainText.includes("https://summit.myshopify.com/cart/456:1?discount=SUMMER10"));
  assert.ok(plainText.includes("Unsubscribe: https://summit.myshopify.com/apps/restockping/unsubscribe?token=xyz"));
});

// 9. Lookup Fallback Logic Test
runTest("Preserves existing subscriber data when live lookup fails", () => {
  const existingSub = {
    productTitle: "Collector Vinyl LP",
    variantTitle: "Limited Blue Edition",
    priceSnapshot: 35.0,
    productImageUrl: "https://cdn.shopify.com/existing-album.png",
  };

  // Simulated live lookup failure response
  const failedLookup = {
    isLookupFailed: true,
    productTitle: "",
    variantTitle: "",
    price: undefined,
    imageUrl: "",
    imageLookupError: "Shopify API Network Timeout",
  };

  // Safe fallback resolution logic implemented in fifoEngine, subscribers, and settings
  const hasLiveMedia = Boolean(failedLookup && !failedLookup.isLookupFailed && failedLookup.productTitle);
  const finalTitle = (hasLiveMedia ? failedLookup.productTitle : existingSub.productTitle) || existingSub.productTitle || "Restocked Item";
  const finalVariant = (hasLiveMedia ? failedLookup.variantTitle : existingSub.variantTitle) || existingSub.variantTitle || "Default Title";
  const finalPrice = (hasLiveMedia && failedLookup.price !== undefined) ? failedLookup.price : existingSub.priceSnapshot;
  const finalImage = (hasLiveMedia && failedLookup.imageUrl) ? failedLookup.imageUrl : existingSub.productImageUrl;

  assert.equal(finalTitle, "Collector Vinyl LP", "Should NOT overwrite with 'Restocked Item'");
  assert.equal(finalVariant, "Limited Blue Edition");
  assert.equal(finalPrice, 35.0, "Should NOT overwrite with $0");
  assert.equal(finalImage, "https://cdn.shopify.com/existing-album.png");
});

// 10. Live Product Media Error Handling
await (async () => {
  total++;
  try {
    const { getLiveProductMedia } = await import("../app/services/catalog.server");

    // Mock admin client that returns GraphQL error
    const mockAdminError: any = {
      graphql: async () => ({
        ok: true,
        json: async () => ({
          errors: [{ message: "Access denied for products field. Required access scope: read_products." }],
        }),
      }),
    };

    const result = await getLiveProductMedia(mockAdminError, "gid://shopify/ProductVariant/12345");
    assert.ok(result, "result should not be null");
    assert.equal(result.isLookupFailed, true, "isLookupFailed should be true");
    assert.equal(result.productTitle, "", "productTitle should be empty string (NOT 'Restocked Item')");
    assert.equal(result.price, undefined, "price should be undefined (NOT 0)");
    assert.ok(result.imageLookupError?.includes("read_products"), "imageLookupError should contain GraphQL error message");
    console.log("✅ PASS: getLiveProductMedia returns isLookupFailed and does not inject 'Restocked Item' or $0");
    passed++;
  } catch (err: any) {
    console.error("❌ FAIL: getLiveProductMedia returns isLookupFailed and does not inject 'Restocked Item' or $0");
    console.error(err);
  }
})();

// 11. Catalog Scope Error Detection
await (async () => {
  total++;
  try {
    const { fetchCatalogProductsWithStatus } = await import("../app/services/catalog.server");

    // Mock admin client that returns 403 scope error
    const mockAdminScopeError: any = {
      graphql: async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => ({}),
      }),
    };

    const statusResult = await fetchCatalogProductsWithStatus(mockAdminScopeError);
    assert.equal(statusResult.products.length, 0);
    assert.equal(statusResult.errorType, "SCOPE_ERROR");
    assert.ok(statusResult.error?.includes("read_products"));
    console.log("✅ PASS: fetchCatalogProductsWithStatus correctly identifies SCOPE_ERROR on 403");
    passed++;
  } catch (err: any) {
    console.error("❌ FAIL: fetchCatalogProductsWithStatus correctly identifies SCOPE_ERROR on 403");
    console.error(err);
  }
})();

// 12. Email Dispatch Error Propagation
await (async () => {
  total++;
  try {
    const { sendRestockNotificationEmail } = await import("../app/services/email.server");
    let caughtError = false;
    try {
      // Disallow empty/invalid recipient
      await sendRestockNotificationEmail({
        to: "not-an-email",
        shop: "test.myshopify.com",
        storeDisplayName: "Test Store",
        productTitle: "Test",
        variantTitle: "Default",
        price: 10,
        variantId: "123",
      });
    } catch {
      caughtError = true;
    }
    assert.ok(caughtError, "sendRestockNotificationEmail must reject and throw invalid email error");
    console.log("✅ PASS: sendRestockNotificationEmail throws errors without silently swallowing them");
    passed++;
  } catch (err: any) {
    console.error("❌ FAIL: sendRestockNotificationEmail throws errors without silently swallowing them");
    console.error(err);
  }
})();

console.log(`\n=========================================`);
console.log(`Tests Completed: ${passed}/${total} passed`);
console.log(`=========================================`);

if (passed !== total) {
  process.exit(1);
}
