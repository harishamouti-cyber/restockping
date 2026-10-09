export function sanitizeShopBrandName(shop: string, explicitName?: string): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  const clean = (shop || "").replace(".myshopify.com", "").replace(/-[a-z0-9]{8,}$/i, "");
  if (!clean) return "RestockPing";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
