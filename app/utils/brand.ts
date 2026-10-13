/**
 * Known compound brand words / prefixes to split and format into clean title case
 */
const COMPOUND_BRAND_PARTS = [
  "rank",
  "pilot",
  "restock",
  "ping",
  "drop",
  "clock",
  "snow",
  "board",
  "devil",
  "quick",
  "start",
  "super",
  "store",
  "shop",
  "market",
  "boutique",
  "brand",
  "gear",
  "supply",
  "goods",
  "trend",
  "apparel",
  "wear",
  "house",
  "craft",
  "wave",
  "peak",
  "tech",
  "flow",
  "pulse",
  "spark",
  "vault",
  "prime",
  "swift",
  "apex",
  "nordic",
  "timber",
  "alpine",
];

function splitCompoundWord(word: string): string[] {
  const lower = word.toLowerCase();
  for (const part of COMPOUND_BRAND_PARTS) {
    if (lower.startsWith(part) && lower.length > part.length) {
      const rest = lower.slice(part.length);
      if (COMPOUND_BRAND_PARTS.includes(rest) || rest.length >= 3) {
        return [part, rest];
      }
    }
  }
  return [word];
}

/**
 * Checks if a string or token looks like a random development hash or suffix:
 * e.g., "xk8wrvgu", "8f2a1b3c", "dev-123", "test", "staging", "491028"
 */
export function isDevelopmentHashOrSuffix(token: string): boolean {
  const t = token.toLowerCase().trim();
  if (!t) return false;
  // Common dev suffixes
  if (/^(?:dev|test|staging|preview|demo|sandbox|tmp|temp)(?:[-_]?[0-9a-z]+)?$/i.test(t)) {
    return true;
  }
  // Pure digits
  if (/^\d+$/.test(t)) {
    return true;
  }
  // Hex hashes: 4+ chars of pure hex with digits
  if (/^[a-f0-9]{4,}$/i.test(t) && /\d/.test(t)) {
    return true;
  }
  // Shopify dev store random hashes: 6-12 alphanumeric characters with mix of consonants or digits (e.g. xk8wrvgu)
  if (/^[a-z0-9]{6,12}$/i.test(t) && (/\d/.test(t) || !/[aeiou]{2,}/i.test(t))) {
    return true;
  }
  return false;
}

/**
 * Detects whether a stored brand name is an un-sanitized raw dev handle
 */
export function isRawDevBrand(name?: string | null, shop?: string): boolean {
  if (!name || typeof name !== "string") return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  // Contains specific dev hashes like xk8wrvgu
  if (/xk8wrvgu/i.test(trimmed)) return true;

  // Ends with a token that looks like a dev hash, e.g. "Rankpilot Xk8wrvgu"
  const tokens = trimmed.split(/[\s-_]+/);
  if (tokens.length > 1 && isDevelopmentHashOrSuffix(tokens[tokens.length - 1])) {
    return true;
  }

  // Matches the shop domain or handle directly
  if (shop) {
    const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\.myshopify\.com.*$/, "").toLowerCase();
    if (trimmed.toLowerCase() === cleanShop || trimmed.toLowerCase() === shop.toLowerCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Strips out development hashes, development suffixes, and dashes,
 * formatting the result into clean title case (e.g., transforming "rankpilot-xk8wrvgu" into "RankPilot").
 */
export function sanitizeShopBrandName(shop: string, explicitName?: string): string {
  // If an explicit name is provided, verify it is not a raw dev handle or dev hash
  if (explicitName && explicitName.trim().length > 0) {
    if (!isRawDevBrand(explicitName, shop)) {
      return explicitName.trim();
    }
    // If explicitName was a raw handle like "Rankpilot Xk8wrvgu", treat its base as the brand to sanitize
    shop = explicitName;
  }

  if (!shop) return "RestockPing";

  let clean = shop
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.myshopify\.com/i, "");

  // Split by hyphens, underscores, or spaces
  const rawTokens = clean.split(/[-_\s]+/).filter(Boolean);

  // Filter out any tokens that are dev hashes or dev suffixes
  const validTokens = rawTokens.filter((token) => !isDevelopmentHashOrSuffix(token));

  // If all tokens were filtered out, fallback to first token or RestockPing
  const baseTokens = validTokens.length > 0 ? validTokens : rawTokens.slice(0, 1);
  if (baseTokens.length === 0) return "RestockPing";

  // For each token, check if it's a compound word (like "rankpilot" -> ["rank", "pilot"])
  const finalWords: string[] = [];
  for (const token of baseTokens) {
    const subWords = splitCompoundWord(token);
    for (const sw of subWords) {
      finalWords.push(sw.charAt(0).toUpperCase() + sw.slice(1).toLowerCase());
    }
  }

  // Join into clean title case without dashes (e.g. "RankPilot")
  return finalWords.length > 0 ? finalWords.join("") : "RestockPing";
}
