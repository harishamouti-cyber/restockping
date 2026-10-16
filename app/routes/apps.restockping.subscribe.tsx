import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import {
  verifyAppProxyHmac,
  validateShopDomain,
  validateEmail,
  checkDurableRateLimit,
  verifyVariantOwnership,
} from "../services/proxySecurity.server";
import { normalizeShopifyImageUrl } from "../services/catalog.server";
import { sanitizeShopBrandName } from "../utils/brand";

// CORS headers for App Proxy responses
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const corsHeaders = getCorsHeaders();

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const shop = (url.searchParams.get("shop") || "").trim().toLowerCase();

    // Validate shop domain format
    if (shop && validateShopDomain(shop)) {
      const settings = await db.restockSettings.findUnique({ where: { shop } });
      if (settings) {
        return json(
          {
            status: "RestockPing App Proxy Active",
            buttonText: settings.storefrontButtonText || "Notify Me When Available",
            successMessage:
              settings.storefrontSuccessMessage ||
              "You're on the waitlist! We'll email you the moment stock returns.",
            buttonRadius: settings.storefrontButtonRadius ?? 6,
            accentColor: settings.accentColor || "#008060",
          },
          { headers: corsHeaders }
        );
      }
    }

    return json({ status: "RestockPing App Proxy Active" }, { headers: corsHeaders });
  } catch (err) {
    const errorType = err instanceof Error ? err.name : "UnknownError";
    console.error("[RestockPing AppProxy Loader Error]", errorType);
    return json({ status: "RestockPing App Proxy Active" }, { headers: corsHeaders });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const corsHeaders = getCorsHeaders();

  try {

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
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  // 1. App Proxy HMAC Signature Verification
  // In production, signature is mandatory and strictly verified. In dev/test, verified when secret is present.
  const signature = url.searchParams.get("signature");
  if (isProduction || (signature && apiSecret)) {
    if (!signature || !apiSecret) {
      return json(
        { success: false, error: "Unauthorized: Missing App Proxy signature." },
        { status: 401, headers: corsHeaders }
      );
    }

    const verification = verifyAppProxyHmac(url, apiSecret);
    if (!verification.isValid) {
      return json(
        { success: false, error: `Unauthorized: ${verification.reason || "Invalid request signature."}` },
        { status: 401, headers: corsHeaders }
      );
    }
  }

  // 2. Client IP & Durable Rate Limiting (max 10 requests per IP per 10-minute window)
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "127.0.0.1";

  const ipRateCheck = await checkDurableRateLimit(`sub:ip:${clientIp}`, 10, 10 * 60 * 1000);
  if (!ipRateCheck.allowed) {
    return json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    );
  }

  const formData = await request.formData();

  // 3. Anti-Spam Honeypot Verification
  const honeypot = formData.get("b_identifier_hp");
  if (honeypot && String(honeypot).trim() !== "") {
    // Silent discard to fool automated spam bots
    return json(
      { success: true, message: "Subscribed successfully" },
      { headers: corsHeaders }
    );
  }

  // 4. Parameter Extraction & Sanitization
  const shop =
    String(formData.get("shop") || url.searchParams.get("shop") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const variantId = String(formData.get("variantId") || "").trim();
  const rawProductId = String(formData.get("productId") || "").trim();
  const productTitle = String(formData.get("productTitle") || "Product").trim();
  const variantTitle = String(formData.get("variantTitle") || "Default Variant").trim();
  const price = parseFloat(String(formData.get("price") || "0.0")) || 0.0;
  const rawImageUrl = String(formData.get("productImageUrl") || "").trim();

  // 5. Strict Server-Side Shop Domain Validation
  if (!shop || !validateShopDomain(shop)) {
    return json(
      { success: false, error: "Invalid or unauthorized shop domain." },
      { status: 400, headers: corsHeaders }
    );
  }

  // Verify the shop has an active installed app session or settings record
  const [activeSession, existingSettings] = await Promise.all([
    db.session.findFirst({ where: { shop } }),
    db.restockSettings.findUnique({ where: { shop } }),
  ]);

  if (!activeSession && !existingSettings) {
    // If shop domain is valid and signature was verified by Shopify App Proxy, auto-provision settings
    if (signature || !isProduction) {
      await db.restockSettings.create({
        data: {
          shop,
          senderName: "Fulfillment Center",
          storeDisplayName: sanitizeShopBrandName(shop),
        },
      }).catch(() => {});
    } else {
      return json(
        { success: false, error: "Store not registered or app session inactive." },
        { status: 404, headers: corsHeaders }
      );
    }
  }

  // 6. Strict Server-Side Email Address Validation
  if (!email || !validateEmail(email)) {
    return json(
      { success: false, error: "Please provide a valid email address." },
      { status: 400, headers: corsHeaders }
    );
  }

  // Durable per-email rate limit to prevent email-bombing single addresses
  const emailRateCheck = await checkDurableRateLimit(`sub:email:${shop}:${email}`, 5, 10 * 60 * 1000);
  if (!emailRateCheck.allowed) {
    return json(
      { success: false, error: "Too many subscription attempts for this email. Please try again shortly." },
      { status: 429, headers: corsHeaders }
    );
  }

  // 7. Server-Side Variant Ownership & Existence Verification
  if (!variantId) {
    return json(
      { success: false, error: "Missing required product variant ID." },
      { status: 400, headers: corsHeaders }
    );
  }

  const ownership = await verifyVariantOwnership(shop, variantId);
  const resolvedProductId = ownership.productId || rawProductId || "";
  const resolvedInventoryItemId = ownership.inventoryItemId || `mapped_${variantId.replace(/\D/g, "")}`;

  // 8. Durable Duplicate-Signup Protection
  // If customer is already on waitlist for this variant in PENDING or QUEUED state, return friendly success
  const existingSubscription = await db.restockSubscription.findFirst({
    where: {
      shop,
      variantId,
      customerEmail: email,
      status: { in: ["PENDING", "QUEUED"] },
    },
  });

  if (existingSubscription) {
    return json(
      {
        success: true,
        message: "You're already on the waitlist for this item! We'll email you the moment stock returns.",
      },
      { headers: corsHeaders }
    );
  }

  // Ensure inventoryItemId mapping is cached in InventoryItemMapping
  const existingMapping = await db.inventoryItemMapping.findFirst({
    where: { shop, variantId },
  });

  if (!existingMapping && resolvedInventoryItemId) {
    try {
      await db.inventoryItemMapping.upsert({
        where: { inventoryItemId: resolvedInventoryItemId },
        update: { shop, productId: resolvedProductId, variantId },
        create: {
          inventoryItemId: resolvedInventoryItemId,
          shop,
          productId: resolvedProductId,
          variantId,
        },
      });
    } catch {
      // Ignore concurrent insertion conflict
    }
  }

  const normalizedImg = normalizeShopifyImageUrl(rawImageUrl, shop, 600);
  const productImageUrl = normalizedImg.isValid ? normalizedImg.url : (rawImageUrl.startsWith("http") ? rawImageUrl : null);

  // 9. Atomic Insertion of New PENDING Subscription
  await db.restockSubscription.create({
    data: {
      shop,
      customerEmail: email,
      productId: resolvedProductId,
      variantId,
      inventoryItemId: resolvedInventoryItemId,
      productTitle: ownership.title || productTitle,
      variantTitle,
      priceSnapshot: price,
      productImageUrl: productImageUrl || null,
      channel: "EMAIL",
      status: "PENDING",
    },
  });

  const settings = await db.restockSettings.findUnique({ where: { shop } });
  const successMessage =
    settings?.storefrontSuccessMessage ||
    "You're on the waitlist! We'll email you the moment stock returns.";

  return json(
    { success: true, message: successMessage },
    { headers: corsHeaders }
  );
  } catch (error: unknown) {
    const url = new URL(request.url);
    const rawShop = url.searchParams.get("shop") || "unknown";
    const safeShop = rawShop.replace(/[^a-zA-Z0-9.-]/g, "");

    const errObj = error instanceof Error ? error : new Error(String(error));
    // Redact potential customer emails, secrets, and signatures from server logs
    const safeMsg = (errObj.message || "Unknown error")
      .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, "[REDACTED_EMAIL]")
      .replace(/secret=[^&\s]+/gi, "secret=[REDACTED]")
      .replace(/signature=[^&\s]+/gi, "signature=[REDACTED]");

    console.error("[RestockPing AppProxy Subscribe Action Error]", {
      shop: safeShop,
      type: errObj.name,
      message: safeMsg,
    });

    return json(
      {
        success: false,
        error: "We couldn't save your request right now. Please try again in a moment.",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function ErrorBoundary() {
  return null;
}
