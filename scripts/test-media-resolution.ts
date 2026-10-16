import { getLiveProductMedia, normalizeShopifyImageUrl } from "../app/services/catalog.server";

// Mock GraphQL response helpers
function createMockAdmin(responses: Record<string, any>) {
  return {
    session: { shop: "my-test-store.myshopify.com" },
    graphql: async (query: string, options?: { variables?: any }) => {
      const vars = options?.variables || {};
      const key = vars.id || "default";

      if (responses[key]) {
        const resp = responses[key];
        if (resp instanceof Error) {
          throw resp;
        }
        if (resp.ok === false) {
          return {
            ok: false,
            status: resp.status || 500,
            statusText: resp.statusText || "Internal Server Error",
            json: async () => ({}),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => resp,
        };
      }

      // Default empty
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: { productVariant: null, product: null } }),
      };
    },
  };
}

async function runTestSuite() {
  console.log("===============================================================");
  console.log("   RESTOCKPING MEDIA RESOLUTION & EMAIL PIPELINE TEST SUITE    ");
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      if (detail) console.log(`         ${detail}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      if (detail) console.error(`         Failure: ${detail}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Scenario 1: Product with featured image (Variant has no specific image)
  // -------------------------------------------------------------
  {
    const admin = createMockAdmin({
      "gid://shopify/ProductVariant/101": {
        data: {
          productVariant: {
            id: "gid://shopify/ProductVariant/101",
            title: "Standard",
            price: "49.99",
            image: null, // No variant-specific image
            product: {
              id: "gid://shopify/Product/201",
              title: "Winter Parka",
              featuredImage: {
                url: "//cdn.shopify.com/s/files/1/0001/parka_featured.jpg?v=123",
              },
              media: { nodes: [] },
            },
          },
        },
      },
    });

    const res = await getLiveProductMedia(admin, "101");
    assert(
      res !== null &&
      res.hasImage === true &&
      res.imageUrl.startsWith("https://cdn.shopify.com/") &&
      res.imageUrl.includes("parka_featured.jpg") &&
      res.productTitle === "Winter Parka",
      "Scenario 1: Fallback from variant to product featured image with HTTPS protocol normalization",
      `Resolved URL: ${res?.imageUrl}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 2: Variant with specific image
  // -------------------------------------------------------------
  {
    const admin = createMockAdmin({
      "gid://shopify/ProductVariant/102": {
        data: {
          productVariant: {
            id: "gid://shopify/ProductVariant/102",
            title: "Midnight Navy / Large",
            price: "59.99",
            image: {
              url: "https://cdn.shopify.com/s/files/1/0001/parka_navy.jpg",
            },
            product: {
              id: "gid://shopify/Product/201",
              title: "Winter Parka",
              featuredImage: {
                url: "https://cdn.shopify.com/s/files/1/0001/parka_featured.jpg",
              },
              media: { nodes: [] },
            },
          },
        },
      },
    });

    const res = await getLiveProductMedia(admin, "102");
    assert(
      res !== null &&
      res.hasImage === true &&
      res.imageUrl.includes("parka_navy.jpg"),
      "Scenario 2: Resolves variant-specific image before product featured image",
      `Resolved variant image URL: ${res?.imageUrl}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 3: Product genuinely has no image
  // -------------------------------------------------------------
  {
    const admin = createMockAdmin({
      "gid://shopify/ProductVariant/103": {
        data: {
          productVariant: {
            id: "gid://shopify/ProductVariant/103",
            title: "Digital Gift Card $50",
            price: "50.00",
            image: null,
            product: {
              id: "gid://shopify/Product/203",
              title: "Gift Card",
              featuredImage: null,
              media: { nodes: [] },
            },
          },
        },
      },
    });

    const res = await getLiveProductMedia(admin, "103");
    assert(
      res !== null &&
      res.hasImage === false &&
      res.imageUrl === "" &&
      res.productTitle === "Gift Card",
      "Scenario 3: Product genuinely lacking image reports hasImage=false and empty imageUrl (no dummy substitution)",
      `hasImage: ${res?.hasImage}, imageUrl: "${res?.imageUrl}"`
    );
  }

  // -------------------------------------------------------------
  // Scenario 4: Deleted or unavailable image / GraphQL error
  // -------------------------------------------------------------
  {
    const admin = createMockAdmin({
      "gid://shopify/ProductVariant/104": {
        errors: [{ message: "Field 'image' cannot be fetched: Media deleted by merchant" }],
      },
    });

    const res = await getLiveProductMedia(admin, "104");
    assert(
      res !== null &&
      res.hasImage === false &&
      typeof res.imageLookupError === "string" &&
      res.imageLookupError.includes("Media deleted by merchant"),
      "Scenario 4: GraphQL error is captured and reported in imageLookupError rather than silently suppressed",
      `imageLookupError: ${res?.imageLookupError}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 5: Similar titles, different IDs (No title-based fuzzing or cross-product pollution)
  // -------------------------------------------------------------
  {
    const admin = createMockAdmin({
      "gid://shopify/ProductVariant/201": {
        data: {
          productVariant: {
            id: "gid://shopify/ProductVariant/201",
            title: "Original Edition",
            price: "100.00",
            image: { url: "https://cdn.shopify.com/s/files/1/0001/prod_a.jpg" },
            product: {
              id: "gid://shopify/Product/901",
              title: "Minimalist Leather Backpack",
              featuredImage: null,
              media: { nodes: [] },
            },
          },
        },
      },
      "gid://shopify/ProductVariant/202": {
        data: {
          productVariant: {
            id: "gid://shopify/ProductVariant/202",
            title: "V2 Edition",
            price: "120.00",
            image: { url: "https://cdn.shopify.com/s/files/1/0001/prod_b.jpg" },
            product: {
              id: "gid://shopify/Product/902",
              title: "Minimalist Leather Backpack V2",
              featuredImage: null,
              media: { nodes: [] },
            },
          },
        },
      },
    });

    const resA = await getLiveProductMedia(admin, "201");
    const resB = await getLiveProductMedia(admin, "202");

    assert(
      Boolean(
        resA?.imageUrl?.includes("prod_a.jpg") &&
        resB?.imageUrl?.includes("prod_b.jpg") &&
        resA?.productTitle !== resB?.productTitle
      ),
      "Scenario 5: Exact ID isolation prevents cross-pollination between products with similar titles",
      `ID 201 -> ${resA?.imageUrl} vs ID 202 -> ${resB?.imageUrl}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 6: URL Normalization & Preview / Email Consistency
  // -------------------------------------------------------------
  {
    // Test various URL formats: protocol-relative, relative store path, query parameters
    const protoRelative = normalizeShopifyImageUrl("//cdn.shopify.com/s/files/item.jpg", "test.myshopify.com", 400);
    const storeRelative = normalizeShopifyImageUrl("/cdn/shop/files/item.jpg", "test.myshopify.com", 400);
    const untrustedHost = normalizeShopifyImageUrl("https://random-image-site.com/image.jpg", "test.myshopify.com", 400);

    const normalizerPass =
      protoRelative.isValid &&
      protoRelative.url === "https://cdn.shopify.com/s/files/item.jpg?width=400" &&
      storeRelative.isValid &&
      storeRelative.url === "https://test.myshopify.com/cdn/shop/files/item.jpg?width=400" &&
      !untrustedHost.isValid;

    assert(
      normalizerPass,
      "Scenario 6: Robust Shopify URL normalization handles //, /cdn/shop/..., and blocks non-Shopify domains",
      `Proto: ${protoRelative.url}, Relative: ${storeRelative.url}, Untrusted Valid: ${untrustedHost.isValid}`
    );
  }

  console.log("\n---------------------------------------------------------------");
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("---------------------------------------------------------------");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test suite runner failed:", err);
  process.exit(1);
});
