import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  return json({ status: "RestockPing Subscription API Active" }, { headers: corsHeaders() });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = corsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  const formData = await request.formData();
  const shop = String(formData.get("shop") || "").trim();
  const customerEmail = String(formData.get("email") || "").trim().toLowerCase();
  const productId = String(formData.get("productId") || "");
  const variantId = String(formData.get("variantId") || "");
  const productTitle = String(formData.get("productTitle") || "Product");
  const variantTitle = String(formData.get("variantTitle") || "Default Title");
  const priceSnapshot = parseFloat(String(formData.get("price") || "0.00"));
  const productImageUrl = String(formData.get("productImageUrl") || "").trim();

  if (!shop || !customerEmail || !variantId) {
    return json({ error: "Missing required fields" }, { status: 400, headers });
  }

  // Prevent duplicate pending subscriptions for the same customer + variant
  const existing = await db.restockSubscription.findFirst({
    where: { shop, customerEmail, variantId, status: "PENDING" },
  });

  if (existing) {
    return json({ success: true, message: "You are already on the waitlist for this item." }, { headers });
  }

  // Ensure inventoryItemId is mapped
  const existingMapping = await db.inventoryItemMapping.findFirst({
    where: { shop, variantId },
  });
  const inventoryItemId = existingMapping?.inventoryItemId || `mapped_${variantId}`;

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

  await db.restockSubscription.create({
    data: {
      shop,
      customerEmail,
      productId,
      variantId,
      inventoryItemId,
      productTitle,
      variantTitle,
      priceSnapshot,
      productImageUrl: productImageUrl || null,
      status: "PENDING",
    },
  });

  return json({ success: true, message: "Added to restock waitlist!" }, { headers });
};
