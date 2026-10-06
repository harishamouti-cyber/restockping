/**
 * Normalizes numeric variant ID from either numeric string or Shopify Global ID (gid://shopify/ProductVariant/...)
 */
export function extractVariantIdNumber(variantId: string): string {
  if (variantId.startsWith("gid://shopify/ProductVariant/")) {
    return variantId.replace("gid://shopify/ProductVariant/", "");
  }
  return variantId;
}

/**
 * Generates direct 1-Click checkout cart permalink with pre-filled customer email
 * and optional discount incentive.
 */
export function generateCartPermalink({
  shop,
  variantId,
  customerEmail,
  discountCode,
  quantity = 1,
}: {
  shop: string;
  variantId: string;
  customerEmail?: string | null;
  discountCode?: string | null;
  quantity?: number;
}): string {
  const numericVariant = extractVariantIdNumber(variantId);
  let permalink = `https://${shop}/cart/${numericVariant}:${quantity}`;

  const queryParams = new URLSearchParams();
  if (customerEmail) {
    queryParams.set("checkout[email]", customerEmail);
  }
  if (discountCode && discountCode.trim().length > 0) {
    queryParams.set("discount", discountCode.trim());
  }

  const queryString = queryParams.toString();
  if (queryString) {
    permalink += `?${queryString}`;
  }

  return permalink;
}
