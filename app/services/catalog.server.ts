import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ResolvedProductMedia {
  productTitle: string;
  variantTitle: string;
  price: number;
  variantId: string;
  productId: string;
  imageUrl: string;
}

export interface CatalogProductOption {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  imageUrl: string;
}

export function formatShopifyImageUrl(rawUrl?: string | null, width = 300): string {
  if (!rawUrl) return "";
  const separator = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${separator}width=${width}`;
}

/**
 * Resilient multi-tiered media extraction:
 * 1. Specific variant image (variant.image.url)
 * 2. Parent product primary featured image (product.featuredImage.url)
 * 3. Broader media nodes (product.media(first: 10) -> MediaImage -> image.url)
 * Appends Shopify's native width transformation query parameter.
 */
export async function getLiveProductMedia(
  admin: AdminApiContext | any,
  variantId?: string
): Promise<ResolvedProductMedia | null> {
  // Tier 1: Query specific variant ID if provided
  if (variantId) {
    const cleanId = String(variantId).replace(/\D/g, "");
    const formattedId = String(variantId).startsWith("gid://shopify/ProductVariant/")
      ? variantId
      : `gid://shopify/ProductVariant/${cleanId}`;

    const query = `#graphql
      query getVariantMedia($id: ID!) {
        productVariant(id: $id) {
          id
          title
          price
          image {
            url
          }
          product {
            id
            title
            featuredImage {
              url
            }
            media(first: 10) {
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
      const response = await admin.graphql(query, { variables: { id: formattedId } });
      const json = await response.json();
      const variant = json.data?.productVariant;

      if (variant) {
        let rawUrl = variant.image?.url || variant.product?.featuredImage?.url;

        if (!rawUrl && variant.product?.media?.nodes) {
          for (const node of variant.product.media.nodes) {
            if (node?.image?.url) {
              rawUrl = node.image.url;
              break;
            }
          }
        }

        return {
          productId: variant.product?.id || "",
          variantId: variant.id,
          productTitle: variant.product?.title || "Restocked Item",
          variantTitle: variant.title || "Default Title",
          price: parseFloat(variant.price || "0"),
          imageUrl: formatShopifyImageUrl(rawUrl, 300),
        };
      }
    } catch (err) {
      console.error("[GraphQL Variant Media Error]:", err);
    }
  }

  // Tier 2: Query active store products with multi-tiered media resolution
  const fallbackQuery = `#graphql
    query getActiveCatalogMedia {
      products(first: 15, query: "status:active") {
        nodes {
          id
          title
          featuredImage {
            url
          }
          media(first: 10) {
            nodes {
              ... on MediaImage {
                image {
                  url
                }
              }
            }
          }
          variants(first: 5) {
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
    const response = await admin.graphql(fallbackQuery);
    const json = await response.json();
    const products = json.data?.products?.nodes || [];

    for (const prod of products) {
      const variant = prod.variants?.nodes?.[0];
      let rawUrl = variant?.image?.url || prod.featuredImage?.url;

      if (!rawUrl && prod.media?.nodes) {
        for (const node of prod.media.nodes) {
          if (node?.image?.url) {
            rawUrl = node.image.url;
            break;
          }
        }
      }

      if (rawUrl || prod.title) {
        return {
          productId: prod.id,
          variantId: variant?.id || "",
          productTitle: prod.title,
          variantTitle: variant?.title || "Default Title",
          price: parseFloat(variant?.price || "0"),
          imageUrl: formatShopifyImageUrl(rawUrl, 300),
        };
      }
    }
  } catch (err) {
    console.error("[GraphQL Fallback Catalog Media Error]:", err);
  }

  return null;
}

/**
 * Fetches all active catalog products and their variants for simulator selection.
 * Always resolves variant image -> product featuredImage -> media nodes.
 */
export async function getAllActiveCatalogProducts(
  admin: AdminApiContext | any
): Promise<CatalogProductOption[]> {
  const query = `#graphql
    query getAllCatalogProducts {
      products(first: 30, query: "status:active") {
        nodes {
          id
          title
          featuredImage {
            url
          }
          media(first: 10) {
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
    const json = await response.json();
    const products = json.data?.products?.nodes || [];

    const options: CatalogProductOption[] = [];

    for (const prod of products) {
      let prodMediaUrl = prod.featuredImage?.url;
      if (!prodMediaUrl && prod.media?.nodes) {
        for (const node of prod.media.nodes) {
          if (node?.image?.url) {
            prodMediaUrl = node.image.url;
            break;
          }
        }
      }

      const variants = prod.variants?.nodes || [];
      if (variants.length === 0) {
        options.push({
          productId: prod.id,
          variantId: `gid://shopify/ProductVariant/${prod.id.replace(/\D/g, "")}_default`,
          productTitle: prod.title,
          variantTitle: "Default Title",
          price: 0,
          imageUrl: formatShopifyImageUrl(prodMediaUrl, 300),
        });
      } else {
        for (const v of variants) {
          const rawUrl = v.image?.url || prodMediaUrl;
          options.push({
            productId: prod.id,
            variantId: v.id,
            productTitle: prod.title,
            variantTitle: v.title,
            price: parseFloat(v.price || "0"),
            imageUrl: formatShopifyImageUrl(rawUrl, 300),
          });
        }
      }
    }

    if (options.length > 0) {
      return options;
    }
  } catch (err) {
    console.error("[GraphQL GetAllCatalogProducts Error]:", err);
  }

  // Do not invent sample products: callers should show an explicit empty catalog state.
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
  return await getLiveProductMedia(admin);
}
