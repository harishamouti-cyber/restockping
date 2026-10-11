import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ResolvedProductMedia {
  productTitle: string;
  variantTitle: string;
  price: number;
  variantId: string;
  productId: string;
  imageUrl: string;
}

export function formatShopifyImageUrl(rawUrl?: string | null, width = 300): string {
  if (!rawUrl) return "";
  const separator = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${separator}width=${width}`;
}

export async function getLiveProductMedia(
  admin: AdminApiContext | any,
  variantId?: string
): Promise<ResolvedProductMedia | null> {
  // If specific variant ID provided, query variant + parent product
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
            media(first: 1) {
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
        const rawUrl =
          variant.image?.url ||
          variant.product?.featuredImage?.url ||
          variant.product?.media?.nodes?.[0]?.image?.url ||
          "";

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

  // Fallback: Query active store products with media
  const fallbackQuery = `#graphql
    query getFirstStoreProduct {
      products(first: 10, query: "status:active") {
        nodes {
          id
          title
          featuredImage {
            url
          }
          media(first: 1) {
            nodes {
              ... on MediaImage {
                image {
                  url
                }
              }
            }
          }
          variants(first: 1) {
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
      const rawUrl =
        variant?.image?.url ||
        prod.featuredImage?.url ||
        prod.media?.nodes?.[0]?.image?.url;

      if (rawUrl) {
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
    console.error("[GraphQL Fallback Media Error]:", err);
  }

  return null;
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
