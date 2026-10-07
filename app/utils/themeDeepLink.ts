/**
 * Generates the official deep-link URL for opening the Shopify Theme Editor
 * with the RestockPing app block pre-selected on the product template.
 */
export function getThemeEditorUrl(shop: string): string {
  const cleanShop = (shop || "")
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .trim();

  const storeHandle = cleanShop.replace(".myshopify.com", "");
  const apiKey = "bb3d7694aa9a53e849de71dc2f2806fa";

  if (storeHandle) {
    return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=product&addAppBlockId=${apiKey}/restock_trigger`;
  }
  return `https://${cleanShop}/admin/themes/current/editor?template=product&addAppBlockId=${apiKey}/restock_trigger`;
}

/**
 * Robustly opens the Shopify Theme Editor from inside an embedded Shopify app.
 * Handles iframe breakout, cross-origin security, and browser popup blockers.
 */
export function openThemeEditor(shop: string): void {
  if (typeof window === "undefined") return;

  const url = getThemeEditorUrl(shop);

  let opened = false;
  try {
    // Attempt standard new-tab popup
    const newTab = window.open(url, "_blank", "noopener,noreferrer");
    if (newTab && !newTab.closed && typeof newTab.closed !== "undefined") {
      opened = true;
      try {
        newTab.focus();
      } catch {}
    }
  } catch (err) {
    console.warn("[RestockPing] window.open was intercepted or blocked:", err);
  }

  // If window.open was blocked by the browser popup blocker in iframe context,
  // break out of the iframe and navigate the top Shopify Admin window directly.
  if (!opened) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (topErr) {
      console.warn("[RestockPing] Top window navigation failed:", topErr);
      window.location.href = url;
    }
  }
}
