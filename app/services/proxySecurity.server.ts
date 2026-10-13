import crypto from "crypto";
import db from "../db.server";

/**
 * Validates Shopify myshopify.com domain format strictly.
 * Examples: 'store.myshopify.com' -> true, 'evil.com', 'store.myshopify.com.evil.com' -> false.
 */
export function validateShopDomain(shop?: string | null): boolean {
  if (!shop || typeof shop !== "string") return false;
  const trimmed = shop.trim().toLowerCase();
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(trimmed);
}

/**
 * Validates email address format with RFC 5322 regex and length constraints.
 */
export function validateEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(trimmed);
}

/**
 * Validates Shopify App Proxy HMAC signature.
 * Prevents unauthorized requests from spoofing the Storefront App Proxy endpoint.
 * Enforces a 5-minute replay attack window if timestamp is provided.
 */
export function verifyAppProxyHmac(
  url: URL,
  apiSecret: string,
  options: { maxAgeSeconds?: number; allowDevFallback?: boolean } = {}
): { isValid: boolean; reason?: string } {
  const signature = url.searchParams.get("signature");
  if (!signature) {
    return { isValid: false, reason: "Missing App Proxy signature" };
  }

  // Verify timestamp to prevent replay attacks (defaults to 300 seconds / 5 mins)
  const timestampStr = url.searchParams.get("timestamp");
  if (timestampStr) {
    const timestamp = parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = options.maxAgeSeconds ?? 300;
    if (isNaN(timestamp) || Math.abs(now - timestamp) > maxAge) {
      return { isValid: false, reason: "Request signature expired or timestamp invalid" };
    }
  }

  // Collect and sort query parameters excluding the signature itself
  const entries: [string, string][] = [];
  url.searchParams.forEach((value, key) => {
    if (key !== "signature") {
      entries.push([key, value]);
    }
  });

  // Sort lexicographically by key
  entries.sort(([a], [b]) => a.localeCompare(b));

  // Construct message: key=value concatenated with no delimiter
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
      return { isValid: false, reason: "Signature length mismatch" };
    }

    const matches = crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);
    if (!matches) {
      return { isValid: false, reason: "Signature verification failed" };
    }

    return { isValid: true };
  } catch {
    return { isValid: false, reason: "Signature decoding error" };
  }
}

/**
 * Durable database-backed rate limiter.
 * Resilient against serverless reboots and distributed worker clusters.
 */
export async function checkDurableRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 10 * 60 * 1000
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    const existing = await db.rateLimitRecord.findUnique({
      where: { key },
    });

    if (!existing || existing.resetAt <= now) {
      // First request or window expired: reset counter
      await db.rateLimitRecord.upsert({
        where: { key },
        update: {
          count: 1,
          resetAt,
        },
        create: {
          key,
          count: 1,
          resetAt,
        },
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    if (existing.count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    // Increment count atomically
    const updated = await db.rateLimitRecord.update({
      where: { key },
      data: {
        count: { increment: 1 },
      },
    });

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - updated.count),
    };
  } catch (err) {
    // If rate limit database call fails, fail open gracefully with fallback
    console.error("[Rate Limit DB Error]:", err);
    return { allowed: true, remaining: 1 };
  }
}

/**
 * Validates product/variant ownership server-side.
 * Ensures the variant requested belongs to the authentic shop before recording a subscription.
 */
export async function verifyVariantOwnership(
  shop: string,
  variantId: string,
  admin?: any
): Promise<{ isValid: boolean; productId?: string; inventoryItemId?: string; title?: string }> {
  const rawVariantId = variantId.replace(/\D/g, "");
  const formattedVariantId = `gid://shopify/ProductVariant/${rawVariantId}`;

  // 1. Check existing verified mapping in store database
  const mapping = await db.inventoryItemMapping.findFirst({
    where: {
      shop,
      OR: [
        { variantId: formattedVariantId },
        { variantId: rawVariantId },
      ],
    },
  });

  if (mapping) {
    return {
      isValid: true,
      productId: mapping.productId,
      inventoryItemId: mapping.inventoryItemId,
    };
  }

  // 2. If mapping not cached and admin GraphQL client is available, verify variant with Shopify Admin API
  if (admin) {
    try {
      const query = `#graphql
        query verifyVariantOwnership($id: ID!) {
          productVariant(id: $id) {
            id
            title
            inventoryItem {
              id
            }
            product {
              id
              title
            }
          }
        }
      `;
      const response = await admin.graphql(query, { variables: { id: formattedVariantId } });
      const json = await response.json();
      const variant = json.data?.productVariant;

      if (variant && variant.id) {
        const prodId = variant.product?.id || "";
        const invId = variant.inventoryItem?.id || `mapped_${rawVariantId}`;

        // Cache mapping in database for rapid future verifications
        await db.inventoryItemMapping.upsert({
          where: { inventoryItemId: invId },
          update: { shop, productId: prodId, variantId: formattedVariantId },
          create: { inventoryItemId: invId, shop, productId: prodId, variantId: formattedVariantId },
        }).catch(() => {});

        return {
          isValid: true,
          productId: prodId,
          inventoryItemId: invId,
          title: variant.product?.title,
        };
      }
    } catch (err) {
      console.error("[Variant Ownership GraphQL Verification Error]:", err);
    }
  }

  // 3. Check if any existing subscription exists for this shop & variant
  const existingSub = await db.restockSubscription.findFirst({
    where: {
      shop,
      OR: [
        { variantId: formattedVariantId },
        { variantId: rawVariantId },
      ],
    },
  });

  if (existingSub) {
    return {
      isValid: true,
      productId: existingSub.productId,
      inventoryItemId: existingSub.inventoryItemId,
      title: existingSub.productTitle,
    };
  }

  // If unmapped, unverified, and cannot be found in shop catalog, reject
  return { isValid: false };
}
