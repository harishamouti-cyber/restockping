import crypto from "crypto";

export interface UnsubscribeTokenPayload {
  subId: string;
  shop: string;
  email: string;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SESSION_SECRET || "restockping-default-signing-key";
  return secret;
}

/**
 * Generates a signed, scoped token for a specific subscription and shop.
 */
export function generateUnsubscribeToken(params: {
  subscriptionId: string;
  shop: string;
  email: string;
}): string {
  const payload: UnsubscribeTokenPayload = {
    subId: params.subscriptionId,
    shop: params.shop.toLowerCase().trim(),
    email: params.email.toLowerCase().trim(),
    iat: Math.floor(Date.now() / 1000),
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64url");

  return `${payloadEncoded}.${signature}`;
}

/**
 * Verifies and decodes an unsubscribe token in constant time.
 * Returns the decoded payload if valid, or null if invalid or tampered.
 */
export function verifyUnsubscribeToken(token?: string | null): UnsubscribeTokenPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;

  const [payloadEncoded, signature] = parts;
  if (!payloadEncoded || !signature) return null;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", getSecret())
      .update(payloadEncoded)
      .digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payloadEncoded, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr) as UnsubscribeTokenPayload;

    if (!payload.subId || !payload.shop || !payload.email) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
