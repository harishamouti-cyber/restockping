import crypto from "crypto";

/**
 * Validates Shopify App Proxy HMAC signature.
 * Prevents unauthorized requests from spoofing the Storefront App Proxy endpoint.
 */
export function verifyAppProxyHmac(url: URL, apiSecret: string): boolean {
  const signature = url.searchParams.get("signature");
  if (!signature) {
    return false;
  }

  // Collect and sort query parameters excluding the signature itself
  const params: string[] = [];
  const entries: [string, string][] = [];

  url.searchParams.forEach((value, key) => {
    if (key !== "signature") {
      entries.push([key, value]);
    }
  });

  // Sort lexicographically by key
  entries.sort(([a], [b]) => a.localeCompare(b));

  // Construct message: key=value concatenated
  const message = entries.map(([key, value]) => `${key}=${value}`).join("");

  // Calculate HMAC SHA-256
  const calculatedHmac = crypto
    .createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  // Timing safe comparison to protect against timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const calculatedBuffer = Buffer.from(calculatedHmac, "hex");

    if (signatureBuffer.length !== calculatedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);
  } catch {
    return false;
  }
}

// In-memory sliding window rate limiter: max 5 requests per IP per 10-minute window
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  clientIp: string,
  maxRequests = 5,
  windowMs = 10 * 60 * 1000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(clientIp) || { timestamps: [] };

  // Filter out timestamps outside the window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= maxRequests) {
    rateLimitMap.set(clientIp, { timestamps: validTimestamps });
    return { allowed: false, remaining: 0 };
  }

  validTimestamps.push(now);
  rateLimitMap.set(clientIp, { timestamps: validTimestamps });

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
  };
}
