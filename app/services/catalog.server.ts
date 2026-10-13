import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ResolvedProductMedia {
  productTitle: string;
  variantTitle: string;
  price?: number;
  variantId: string;
  productId: string;
  imageUrl: string;
  hasImage: boolean;
  rawImageUrl?: string;
  imageLookupError?: string | null;
  isLookupFailed?: boolean;
}

export interface CatalogProductOption {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  imageUrl: string;
  imageLookupError?: string | null;
  isWaitlistFallback?: boolean;
}

export interface CatalogProductsResult {
  products: CatalogProductOption[];
  error?: string | null;
  errorType?: "SCOPE_ERROR" | "AUTH_ERROR" | "API_ERROR" | "NETWORK_ERROR" | null;
}

/**
 * Normalizes and validates Shopify CDN image URLs:
 * - Upgrades protocol-relative (//...) and relative (/cdn/shop/...) URLs to absolute HTTPS.
 * - Enforces HTTPS scheme.
 * - Verifies host is a legitimate Shopify CDN or store domain (cdn.shopify.com, shopifycloud, myshopify.com).
 * - Appends or updates image width parameter for lightweight delivery.
 */
export function normalizeShopifyImageUrl(
  rawUrl?: string | null,
  shop?: string,
  width = 300
): { url: string; isValid: boolean; reason?: string } {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { url: "", isValid: false, reason: "No image URL provided" };
  }

  let cleaned = rawUrl.replace(/^\[.*?\]\((.*?)\)$/, "$1").trim();
  if (!cleaned) {
    return { url: "", isValid: false, reason: "Empty image URL" };
  }

  // Upgrade protocol-relative URLs
  if (cleaned.startsWith("//")) {
    cleaned = `https:${cleaned}`;
  } else if (cleaned.startsWith("/")) {
    const baseHost = shop ? (shop.includes(".") ? shop : `${shop}.myshopify.com`) : "cdn.shopify.com";
    cleaned = `https://${baseHost}${cleaned}`;
  } else if (cleaned.startsWith("http://")) {
    cleaned = cleaned.replace(/^http:\/\//i, "https://");
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:") {
      return { url: "", isValid: false, reason: "Image URL must use HTTPS" };
    }

    const host = parsed.hostname.toLowerCase();
    const isShopifyHost =
      host === "cdn.shopify.com" ||
      host.endsWith(".cdn.shopify.com") ||
      host === "cdn.shopifycloud.com" ||
      host.endsWith(".shopifycloud.com") ||
      host.endsWith(".myshopify.com") ||
      host === "shopify.com" ||
      host.endsWith(".shopify.com");

    if (!isShopifyHost) {
      return { url: "", isValid: false, reason: `Host ${host} is not a recognized Shopify CDN host` };
    }

    if (width > 0) {
      parsed.searchParams.set("width", String(width));
    }

    return { url: parsed.toString(), isValid: true };
  } catch (err: any) {
    return { url: "", isValid: false, reason: `Malformed URL: ${err.message}` };
  }
}

export function formatShopifyImageUrl(rawUrl?: string | null, width = 300, shop?: string): string {
  const norm = normalizeShopifyImageUrl(rawUrl, shop, width);
  return norm.isValid ? norm.url : "";
}

/**
 * Resilient, stable ID-based media extraction for an exact Shopify product variant:
 * 1. Specific variant image (variant.image.url)
 * 2. Parent product primary featured image (product.featuredImage.url)
 * 3. Broader media nodes (product.media -> MediaImage -> image.url)
 * 
 * Strict invariants:
 * - NEVER match by title alone.
 * - NEVER substitute an unrelated product's image when an item has no image.
 * - If image lookup fails or GraphQL errors occur, report isLookupFailed: true without
 *   substituting fake "Restocked Item" placeholders or $0 prices over valid caller data.
 */
export async function getLiveProductMedia(
  admin: AdminApiContext | any,
  variantId?: string,
  productId?: string
): Promise<ResolvedProductMedia | null> {
  if (!admin) {
    return null;
  }

  const shopDomain = admin?.session?.shop || undefined;

  // 1. Try querying specific variant ID if provided
  if (variantId) {
    const isAlreadyVariantGid = String(variantId).startsWith("gid://shopify/ProductVariant/");
    const isProductGid = String(variantId).startsWith("gid://shopify/Product/");
    const digitsOnly = String(variantId).replace(/\D/g, "");

    const formattedVariantId = isAlreadyVariantGid
      ? variantId
      : !isProductGid && digitsOnly
      ? `gid://shopify/ProductVariant/${digitsOnly}`
      : "";

    if (formattedVariantId) {
      const variantQuery = `#graphql
        query getVariantMedia($id: ID!) {
          productVariant(id: $id) {
            id
            title
            price
            image {
              url
              altText
            }
            product {
              id
              title
              featuredImage {
                url
                altText
              }
              media(first: 5) {
                nodes {
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      `;

      try {
        const response = await admin.graphql(variantQuery, { variables: { id: formattedVariantId } });
        if (!response.ok) {
          const statusText = `Shopify API HTTP ${response.status} ${response.statusText}`;
          console.error(`[GraphQL Variant Media HTTP Error]:`, statusText);
          return {
            productId: productId || "",
            variantId: formattedVariantId,
            productTitle: "",
            variantTitle: "",
            price: undefined,
            imageUrl: "",
            hasImage: false,
            imageLookupError: statusText,
            isLookupFailed: true,
          };
        }

        const json = await response.json();
        if (json.errors && json.errors.length > 0) {
          for (const err of json.errors) {
            console.error(
              `[GraphQL Variant Media Error for ${formattedVariantId}]: message="${err.message}", path=${JSON.stringify(
                err.path || []
              )}`
            );
          }
          const errMsg = json.errors.map((e: any) => e.message).join("; ");
          return {
            productId: productId || "",
            variantId: formattedVariantId,
            productTitle: "",
            variantTitle: "",
            price: undefined,
            imageUrl: "",
            hasImage: false,
            imageLookupError: `Shopify GraphQL Error: ${errMsg}`,
            isLookupFailed: true,
          };
        }

        const variant = json.data?.productVariant;
        if (variant) {
          let rawUrl: string | null = null;

          // Priority 1: Variant image
          if (variant.image?.url) {
            rawUrl = variant.image.url;
          }

          // Priority 2: Product featured image
          if (!rawUrl && variant.product?.featuredImage?.url) {
            rawUrl = variant.product.featuredImage.url;
          }

          // Priority 3: First MediaImage node
          if (!rawUrl && variant.product?.media?.nodes) {
            for (const node of variant.product.media.nodes) {
              if (node?.image?.url) {
                rawUrl = node.image.url;
                break;
              }
            }
          }

          const normalized = normalizeShopifyImageUrl(rawUrl, shopDomain, 300);

          return {
            productId: variant.product?.id || productId || "",
            variantId: variant.id,
            productTitle: variant.product?.title || "",
            variantTitle: variant.title || "",
            price: parseFloat(variant.price || "0"),
            imageUrl: normalized.isValid ? normalized.url : "",
            hasImage: normalized.isValid,
            rawImageUrl: rawUrl || undefined,
            imageLookupError: null,
            isLookupFailed: false,
          };
        }
      } catch (err: any) {
        console.error("[GraphQL Variant Media Exception]:", err);
        return {
          productId: productId || "",
          variantId: formattedVariantId,
          productTitle: "",
          variantTitle: "",
          price: undefined,
          imageUrl: "",
          hasImage: false,
          imageLookupError: `Lookup Exception: ${err.message}`,
          isLookupFailed: true,
        };
      }
    }
  }

  // 2. Fallback to product ID lookup if variant ID failed or only product ID provided
  const targetProductId = productId || (String(variantId).startsWith("gid://shopify/Product/") ? variantId : "");
  if (targetProductId) {
    const isAlreadyProductGid = String(targetProductId).startsWith("gid://shopify/Product/");
    const digitsOnly = String(targetProductId).replace(/\D/g, "");
    const formattedProductId = isAlreadyProductGid
      ? targetProductId
      : digitsOnly
      ? `gid://shopify/Product/${digitsOnly}`
      : "";

    if (formattedProductId) {
      const productQuery = `#graphql
        query getProductMedia($id: ID!) {
          product(id: $id) {
            id
            title
            featuredImage {
              url
              altText
            }
            media(first: 5) {
              nodes {
                ... on MediaImage {
                  image {
                    url
                  }
                }
              }
            }
            variants(first: 10) {
              nodes {
                id
                title
                price
                image {
                  url
                }
              }
            }
          }
        }
      `;

      try {
        const response = await admin.graphql(productQuery, { variables: { id: formattedProductId } });
        if (!response.ok) {
          const statusText = `Shopify API HTTP ${response.status} ${response.statusText}`;
          console.error(`[GraphQL Product Media HTTP Error]:`, statusText);
          return {
            productId: formattedProductId,
            variantId: variantId || "",
            productTitle: "",
            variantTitle: "",
            price: undefined,
            imageUrl: "",
            hasImage: false,
            imageLookupError: statusText,
            isLookupFailed: true,
          };
        }

        const json = await response.json();
        if (json.errors && json.errors.length > 0) {
          for (const err of json.errors) {
            console.error(
              `[GraphQL Product Media Error for ${formattedProductId}]: message="${err.message}", path=${JSON.stringify(
                err.path || []
              )}`
            );
          }
          const errMsg = json.errors.map((e: any) => e.message).join("; ");
          return {
            productId: formattedProductId,
            variantId: variantId || "",
            productTitle: "",
            variantTitle: "",
            price: undefined,
            imageUrl: "",
            hasImage: false,
            imageLookupError: `Shopify GraphQL Error: ${errMsg}`,
            isLookupFailed: true,
          };
        }

        const prod = json.data?.product;
        if (prod) {
          const cleanVarId = variantId ? String(variantId).replace(/\D/g, "") : "";
          const matchedVariant = cleanVarId
            ? prod.variants?.nodes?.find((v: any) => v.id.replace(/\D/g, "") === cleanVarId)
            : prod.variants?.nodes?.[0];

          let rawUrl = matchedVariant?.image?.url || prod.featuredImage?.url;
          if (!rawUrl && prod.media?.nodes) {
            for (const node of prod.media.nodes) {
              if (node?.image?.url) {
                rawUrl = node.image.url;
                break;
              }
            }
          }

          const normalized = normalizeShopifyImageUrl(rawUrl, shopDomain, 300);

          return {
            productId: prod.id,
            variantId: matchedVariant?.id || variantId || "",
            productTitle: prod.title || "",
            variantTitle: matchedVariant?.title || "",
            price: parseFloat(matchedVariant?.price || "0"),
            imageUrl: normalized.isValid ? normalized.url : "",
            hasImage: normalized.isValid,
            rawImageUrl: rawUrl || undefined,
            imageLookupError: null,
            isLookupFailed: false,
          };
        }
      } catch (err: any) {
        console.error("[GraphQL Product Media Exception]:", err);
        return {
          productId: formattedProductId,
          variantId: variantId || "",
          productTitle: "",
          variantTitle: "",
          price: undefined,
          imageUrl: "",
          hasImage: false,
          imageLookupError: `Lookup Exception: ${err.message}`,
          isLookupFailed: true,
        };
      }
    }
  }

  return null;
}

/**
 * Fetches the first twenty catalog products directly to capture all store inventory.
 * Captures explicit error state (scope, authentication, API, network) so callers
 * can inform the merchant accurately rather than reporting 0 products.
 */
export async function fetchCatalogProductsWithStatus(
  admin: AdminApiContext | any
): Promise<CatalogProductsResult> {
  if (!admin) {
    return {
      products: [],
      error: "Admin API context is not authenticated.",
      errorType: "AUTH_ERROR",
    };
  }

  const query = `#graphql
    query getAllCatalogProducts {
      products(first: 20) {
        nodes {
          id
          title
          featuredImage {
            url
          }
          media(first: 5) {
            nodes {
              ... on MediaImage {
                image {
                  url
                }
              }
            }
          }
          variants(first: 10) {
            nodes {
              id
              title
              price
              image {
                url
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    if (!response.ok) {
      const errorText = typeof response.text === "function" ? await response.text().catch(() => "") : "";
      console.error(
        `[GraphQL GetAllCatalogProducts HTTP Error]: status=${response.status} ${response.statusText}`,
        errorText
      );
      if (response.status === 401) {
        return {
          products: [],
          error: "Shopify session is unauthenticated or expired. Please re-open the app from Shopify Admin.",
          errorType: "AUTH_ERROR",
        };
      }
      if (
        response.status === 403 ||
        errorText.toLowerCase().includes("scope") ||
        errorText.toLowerCase().includes("access denied")
      ) {
        return {
          products: [],
          error: "Shopify API access denied. The app may be missing the read_products access scope.",
          errorType: "SCOPE_ERROR",
        };
      }
      return {
        products: [],
        error: `Shopify HTTP ${response.status} ${response.statusText}${errorText ? `: ${errorText.slice(0, 150)}` : ""}`,
        errorType: "API_ERROR",
      };
    }

    const json = await response.json();
    if (json.errors && json.errors.length > 0) {
      for (const err of json.errors) {
        console.error(
          `[GraphQL GetAllCatalogProducts Error]: message="${err.message}", path=${JSON.stringify(
            err.path || []
          )}, extensions=${JSON.stringify(err.extensions || {})}`
        );
      }
      const isScope = json.errors.some(
        (e: any) =>
          e.message?.toLowerCase().includes("scope") ||
          e.message?.toLowerCase().includes("access denied") ||
          e.extensions?.code === "ACCESS_DENIED"
      );
      return {
        products: [],
        error: json.errors.map((e: any) => e.message).join("; "),
        errorType: isScope ? "SCOPE_ERROR" : "API_ERROR",
      };
    }

    const products = json.data?.products?.nodes || [];
    const options: CatalogProductOption[] = [];

    for (const prod of products) {
      // 1. Check primary product featured image
      let productFallbackUrl = prod.featuredImage?.url || null;

      // 2. Check first 5 items under media connection (MediaImage)
      if (!productFallbackUrl && prod.media?.nodes) {
        for (const node of prod.media.nodes) {
          if (node?.image?.url) {
            productFallbackUrl = node.image.url;
            break;
          }
        }
      }

      // 3. Check variant images on product
      const variants = prod.variants?.nodes || [];
      if (!productFallbackUrl && variants.length > 0) {
        for (const v of variants) {
          if (v.image?.url) {
            productFallbackUrl = v.image.url;
            break;
          }
        }
      }

      if (variants.length === 0) {
        const norm = normalizeShopifyImageUrl(productFallbackUrl, undefined, 300);
        options.push({
          productId: prod.id,
          variantId: `gid://shopify/ProductVariant/${prod.id.replace(/\D/g, "")}_default`,
          productTitle: prod.title,
          variantTitle: "Default Title",
          price: 0,
          imageUrl: norm.isValid ? norm.url : "",
          imageLookupError: !norm.isValid && productFallbackUrl ? norm.reason : null,
        });
      } else {
        for (const v of variants) {
          let rawUrl = v.image?.url || prod.featuredImage?.url || null;
          if (!rawUrl && prod.media?.nodes) {
            for (const node of prod.media.nodes) {
              if (node?.image?.url) {
                rawUrl = node.image.url;
                break;
              }
            }
          }
          if (!rawUrl) {
            rawUrl = productFallbackUrl;
          }

          const norm = normalizeShopifyImageUrl(rawUrl, undefined, 300);
          options.push({
            productId: prod.id,
            variantId: v.id,
            productTitle: prod.title,
            variantTitle: v.title,
            price: parseFloat(v.price || "0"),
            imageUrl: norm.isValid ? norm.url : "",
            imageLookupError: !norm.isValid && rawUrl ? norm.reason : null,
          });
        }
      }
    }

    return {
      products: options,
      error: null,
      errorType: null,
    };
  } catch (err: any) {
    console.error("[GraphQL GetAllCatalogProducts Exception]:", err?.message || err);
    return {
      products: [],
      error: `Network or fetch exception: ${err?.message || String(err)}`,
      errorType: "NETWORK_ERROR",
    };
  }
}

/**
 * Backward-compatible helper returning the list of active catalog products.
 */
export async function getAllActiveCatalogProducts(
  admin: AdminApiContext | any
): Promise<CatalogProductOption[]> {
  const result = await fetchCatalogProductsWithStatus(admin);
  return result.products;
}

// Backward-compatible adapter for existing callers
export async function getVariantProductMedia(
  admin: AdminApiContext | any,
  variantId: string
): Promise<{ title: string; variantTitle: string; price: number; imageUrl: string; isLookupFailed?: boolean }> {
  const media = await getLiveProductMedia(admin, variantId);
  if (media && !media.isLookupFailed && media.productTitle) {
    return {
      title: media.productTitle,
      variantTitle: media.variantTitle,
      price: media.price ?? 0,
      imageUrl: media.imageUrl,
      isLookupFailed: false,
    };
  }
  return {
    title: "",
    variantTitle: "",
    price: 0,
    imageUrl: "",
    isLookupFailed: true,
  };
}

// Backward-compatible adapter for sample product fetching
export async function getFirstOutOfStockProduct(admin: AdminApiContext | any) {
  const products = await getAllActiveCatalogProducts(admin);
  return products[0] || null;
}
