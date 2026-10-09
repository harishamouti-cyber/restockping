import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export async function getVariantProductMedia(
  admin: AdminApiContext | any,
  variantId: string
): Promise<{ title: string; variantTitle: string; price: number; imageUrl: string }> {
  const query = `#graphql
    query getVariantDetails($id: ID!) {
      productVariant(id: $id) {
        title
        price
        image {
          url
        }
        product {
          title
          featuredImage {
            url
          }
        }
      }
    }
  `;

  const cleanId = String(variantId || "").replace(/\D/g, "");
  const formattedVariantId = String(variantId || "").startsWith("gid://shopify/ProductVariant/")
    ? variantId
    : `gid://shopify/ProductVariant/${cleanId}`;

  try {
    const response = await admin.graphql(query, { variables: { id: formattedVariantId } });
    const json = await response.json();
    const variant = json.data?.productVariant;

    const rawUrl = variant?.image?.url || variant?.product?.featuredImage?.url || "";
    // Optimize using Shopify CDN resize parameter
    const optimizedUrl = rawUrl
      ? rawUrl.includes("?")
        ? `${rawUrl}&width=240`
        : `${rawUrl}?width=240`
      : "";

    return {
      title: variant?.product?.title || "Restocked Item",
      variantTitle: variant?.title || "Default Title",
      price: parseFloat(variant?.price || "0"),
      imageUrl: optimizedUrl,
    };
  } catch (err) {
    console.error("[getVariantProductMedia Error]:", err);
    return {
      title: "Restocked Item",
      variantTitle: "Default Title",
      price: 0,
      imageUrl: "",
    };
  }
}

export async function getFirstOutOfStockProduct(admin: AdminApiContext | any) {
  const query = `#graphql
    query getOutOfStockSample {
      products(first: 10, query: "status:active") {
        edges {
          node {
            id
            title
            featuredImage {
              url
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  availableForSale
                  image {
                    url
                  }
                }
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
    const edges = json.data?.products?.edges || [];

    if (edges.length === 0) return null;

    // Prioritize variant that is currently out of stock (availableForSale === false)
    for (const edge of edges) {
      const node = edge.node;
      const variants = node.variants?.edges || [];
      const oosVariant = variants.find((v: any) => v.node?.availableForSale === false);
      if (oosVariant) {
        const variant = oosVariant.node;
        const rawUrl = variant?.image?.url || node.featuredImage?.url || "";
        const optimizedUrl = rawUrl
          ? rawUrl.includes("?")
            ? `${rawUrl}&width=240`
            : `${rawUrl}?width=240`
          : "";
        return {
          productId: node.id,
          variantId: variant.id,
          productTitle: node.title,
          variantTitle: variant.title || "Default Title",
          price: parseFloat(variant.price || "0"),
          imageUrl: optimizedUrl,
        };
      }
    }

    // Fallback: first active product and variant
    const node = edges[0].node;
    const variant = node.variants?.edges?.[0]?.node;
    const rawUrl = variant?.image?.url || node.featuredImage?.url || "";
    const optimizedUrl = rawUrl
      ? rawUrl.includes("?")
        ? `${rawUrl}&width=240`
        : `${rawUrl}?width=240`
      : "";

    return {
      productId: node.id,
      variantId: variant?.id,
      productTitle: node.title,
      variantTitle: variant?.title || "Default Title",
      price: parseFloat(variant?.price || "0"),
      imageUrl: optimizedUrl,
    };
  } catch (err) {
    console.error("[getFirstOutOfStockProduct Error]:", err);
    return null;
  }
}
