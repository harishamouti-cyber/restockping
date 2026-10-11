export function sanitizeShopBrandName(shop: string, explicitName?: string): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  if (!shop) return "RestockPing";

  let clean = shop
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(".myshopify.com", "");

  // Strip trailing hash/random hex/numeric strings like -8f2a1b3c, -8f2a, -491028
  clean = clean.replace(/-[a-f0-9]{4,}$/i, "");
  // Strip trailing internal development tags like -dev-123, -test-456, -staging, -preview, -demo
  clean = clean.replace(/-(?:dev|test|staging|preview|demo)(?:-[a-z0-9]+)?$/i, "");
  // Strip trailing digits if attached via hyphen e.g. -12345
  clean = clean.replace(/-\d+$/, "");

  // Split hyphenated or underscored words, capitalize each, and join with space
  const words = clean
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));

  return words.length > 0 ? words.join(" ") : "RestockPing";
}
