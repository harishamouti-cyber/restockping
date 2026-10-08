import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { checkRateLimit, verifyAppProxyHmac } from "../services/proxySecurity.server";

// CORS headers for App Proxy responses
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders() });
  }
  return json({ status: "RestockPing App Proxy Active" }, { headers: getCorsHeaders() });
}

export async function action({ request }: ActionFunctionArgs) {
  const corsHeaders = getCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const url = new URL(request.url);

  // 1. App Proxy HMAC Signature Verification
  // In production, verify proxy signature if present
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const signature = url.searchParams.get("signature");
  if (signature && apiSecret) {
    const isValidSignature = verifyAppProxyHmac(url, apiSecret);
    if (!isValidSignature) {
      return json(
        { success: false, error: "Invalid request signature" },
        { status: 401, headers: corsHeaders }
      );
    }
  }

  // 2. Sliding Window Rate Limiting (max 5 requests per IP per 10-minute window)
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "127.0.0.1";

  const rateCheck = checkRateLimit(clientIp, 5, 10 * 60 * 1000);
  if (!rateCheck.allowed) {
    return json(
      { success: false, error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: corsHeaders }
    );
  }

  const formData = await request.formData();

  // 3. Spam Honeypot Check
  const honeypot = formData.get("b_identifier_hp");
  if (honeypot && String(honeypot).trim() !== "") {
    // Silent discard to fool bots
    return json(
      { success: true, message: "Subscribed successfully" },
      { headers: corsHeaders }
    );
  }

  // 4. Parameter Extraction & Validation
  const shop =
    String(formData.get("shop") || url.searchParams.get("shop") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const variantId = String(formData.get("variantId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  const productTitle = String(formData.get("productTitle") || "Product").trim();
  const variantTitle = String(formData.get("variantTitle") || "Default Variant").trim();
  const price = parseFloat(String(formData.get("price") || "0.0")) || 0.0;
  const productImageUrl = String(formData.get("productImageUrl") || "").trim();

  if (!shop || !email || !variantId) {
    return json(
      { success: false, error: "Missing required parameters (shop, email, variantId)" },
      { status: 400, headers: corsHeaders }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return json(
      { success: false, error: "Invalid email format" },
      { status: 400, headers: corsHeaders }
    );
  }

  // 5. Check or create mapping
  const existingMapping = await db.inventoryItemMapping.findFirst({
    where: { shop, variantId },
  });

  const inventoryItemId = existingMapping?.inventoryItemId || `mapped_${variantId}`;

  // If mapping didn't exist yet, seed a placeholder mapping for the variant
  if (!existingMapping) {
    try {
      await db.inventoryItemMapping.upsert({
        where: { inventoryItemId },
        update: { shop, productId, variantId },
        create: {
          inventoryItemId,
          shop,
          productId,
          variantId,
        },
      });
    } catch {
      // Ignore conflict
    }
  }

  // 6. Check for duplicate pending subscription for same email + variant
  const existingSubscription = await db.restockSubscription.findFirst({
    where: {
      shop,
      variantId,
      customerEmail: email,
      status: "PENDING",
    },
  });

  if (existingSubscription) {
    return json(
      { success: true, message: "You are already registered for restock updates on this item!" },
      { headers: corsHeaders }
    );
  }

  // 7. Insert new PENDING subscription record
  await db.restockSubscription.create({
    data: {
      shop,
      customerEmail: email,
      productId,
      variantId,
      inventoryItemId,
      productTitle,
      variantTitle,
      priceSnapshot: price,
      productImageUrl: productImageUrl || null,
      channel: "EMAIL",
      status: "PENDING",
    },
  });

  return json(
    { success: true, message: "Notification request saved successfully!" },
    { headers: corsHeaders }
  );
}
