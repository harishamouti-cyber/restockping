import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ResolvedProductMedia {
  productTitle: string;
  variantTitle: string;
  price: number;
  variantId: string;
  productId: string;
  imageUrl: string;
  hasImage: boolean;
  rawImageUrl?: string;
  imageLookupError?: string | null;
}

export interface CatalogProductOption {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  imageUrl: string;
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
 * - If image lookup fails or GraphQL errors occur, report the lookup error.
 * - If the exact item has no image, report hasImage = false with an empty URL.
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
            productTitle: "Restocked Item",
            variantTitle: "Default Title",
            price: 0,
            imageUrl: "",
            hasImage: false,
            imageLookupError: statusText,
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
            productTitle: "Restocked Item",
            variantTitle: "Default Title",
            price: 0,
            imageUrl: "",
            hasImage: false,
            imageLookupError: `Shopify GraphQL Error: ${errMsg}`,
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
            productTitle: variant.product?.title || "Restocked Item",
            variantTitle: variant.title || "Default Title",
            price: parseFloat(variant.price || "0"),
            imageUrl: normalized.isValid ? normalized.url : "",
            hasImage: normalized.isValid,
            rawImageUrl: rawUrl || undefined,
            imageLookupError: null,
          };
        }
      } catch (err: any) {
        console.error("[GraphQL Variant Media Exception]:", err);
        return {
          productId: productId || "",
          variantId: formattedVariantId,
          productTitle: "Restocked Item",
          variantTitle: "Default Title",
          price: 0,
          imageUrl: "",
          hasImage: false,
          imageLookupError: `Lookup Exception: ${err.message}`,
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
            productTitle: "Restocked Item",
            variantTitle: "Default Title",
            price: 0,
            imageUrl: "",
            hasImage: false,
            imageLookupError: statusText,
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
            productTitle: "Restocked Item",
            variantTitle: "Default Title",
            price: 0,
            imageUrl: "",
            hasImage: false,
            imageLookupError: `Shopify GraphQL Error: ${errMsg}`,
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
            productTitle: prod.title || "Restocked Item",
            variantTitle: matchedVariant?.title || "Default Title",
            price: parseFloat(matchedVariant?.price || "0"),
            imageUrl: normalized.isValid ? normalized.url : "",
            hasImage: normalized.isValid,
            rawImageUrl: rawUrl || undefined,
            imageLookupError: null,
          };
        }
      } catch (err: any) {
        console.error("[GraphQL Product Media Exception]:", err);
        return {
          productId: formattedProductId,
          variantId: variantId || "",
          productTitle: "Restocked Item",
          variantTitle: "Default Title",
          price: 0,
          imageUrl: "",
          hasImage: false,
          imageLookupError: `Lookup Exception: ${err.message}`,
        };
      }
    }
  }

  // When no IDs provided or product genuinely not found in catalog, return null
  return null;
}

/**
 * Fetches the first twenty catalog products directly to capture all store inventory.
 * Removes rigid search filters (e.g. status:active) to avoid indexing lag or draft omissions.
 * Resolves media hierarchically: variant image -> featured image -> media nodes -> fallback.
 * Formats all media URLs with Shopify CDN width=300 transform parameter.
 */
export async function getAllActiveCatalogProducts(
  admin: AdminApiContext | any
): Promise<CatalogProductOption[]> {
  if (!admin) {
    console.warn("[GraphQL GetAllCatalogProducts]: Admin API context is undefined.");
    return [];
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
      const errorText = await response.text().catch(() => "");
      console.error(
        `[GraphQL GetAllCatalogProducts HTTP Error]: status=${response.status} ${response.statusText}`,
        errorText
      );
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
        });
      } else {
        for (const v of variants) {
          // Priority: Variant image -> Featured image -> First media image -> Product fallback
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
          });
        }
      }
    }

    if (options.length > 0) {
      return options;
    }
  } catch (err: any) {
    console.error("[GraphQL GetAllCatalogProducts Exception]:", err?.message || err);
  }

  // Explicit empty array when store has no products; callers render empty state
  return [];
}

// Backward-compatible adapter for existing callers
export async function getVariantProductMedia(
  admin: AdminApiContext | any,
  variantId: string
): Promise<{ title: string; variantTitle: string; price: number; imageUrl: string }> {
  const media = await getLiveProductMedia(admin, variantId);
  if (media) {
    return {
      title: media.productTitle,
      variantTitle: media.variantTitle,
      price: media.price,
      imageUrl: media.imageUrl,
    };
  }
  return {
    title: "Restocked Item",
    variantTitle: "Default Title",
    price: 0,
    imageUrl: "",
  };
}

// Backward-compatible adapter for sample product fetching
export async function getFirstOutOfStockProduct(admin: AdminApiContext | any) {
  const products = await getAllActiveCatalogProducts(admin);
  return products[0] || null;
}
