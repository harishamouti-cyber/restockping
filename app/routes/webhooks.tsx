import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  recordWebhookEvent,
  enqueueInventoryRestock,
  processPendingRestockJobs,
} from "../services/restockQueue.server";
import { attributeOrderConversion } from "../services/orderAttribution.server";

export async function action({ request }: ActionFunctionArgs) {
  // Authenticate webhook HMAC signature using official Shopify Remix authenticate
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!shop) {
    return new Response("Missing shop header", { status: 400 });
  }

  // Durable idempotency check using database table WebhookEvent
  const webhookId = request.headers.get("x-shopify-webhook-id") || "";
  if (webhookId) {
    const { isDuplicate } = await recordWebhookEvent(webhookId, shop, topic);
    if (isDuplicate) {
      console.log(`[Durable Webhook Dedup] Duplicate delivery ignored: ID ${webhookId} for shop ${shop}`);
      return new Response("Duplicate webhook delivery ignored", { status: 200 });
    }
  }

  console.log(`[Webhook Received] Topic: ${topic} for Shop: ${shop}`);

  switch (topic) {
    case "INVENTORY_LEVELS_UPDATE": {
      const rawId = String(payload.inventory_item_id || payload.inventoryItemId || "");
      const inventoryItemId = rawId.startsWith("gid://shopify/InventoryItem/")
        ? rawId
        : `gid://shopify/InventoryItem/${rawId}`;
      const locationId = payload.location_id ? String(payload.location_id) : null;
      const available = Number(payload.available ?? payload.availableUnits ?? 0);

      // Enqueue work into durable queue and return promptly to Shopify
      const enqueueResult = await enqueueInventoryRestock({
        shop,
        inventoryItemId,
        locationId,
        availableQuantity: available,
      });

      console.log(
        `[Inventory Webhook Enqueued] Shop: ${shop} | Item: ${inventoryItemId} | Result:`,
        enqueueResult
      );

      // If scheduled for immediate execution, trigger background processing without blocking webhook response
      if (enqueueResult.enqueued && enqueueResult.jobId) {
        // Fire-and-forget worker execution
        processPendingRestockJobs({ jobId: enqueueResult.jobId, admin }).catch((err) => {
          console.error("[Background Restock Worker Error]:", err);
        });
      }

      // Return promptly (<200ms) to prevent Shopify webhook timeouts
      return new Response(null, { status: 200 });
    }

    case "APP_UNINSTALLED": {
      console.log(`[App Uninstalled] Cleaning active sessions and pending jobs for shop: ${shop}`);
      await db.session.deleteMany({ where: { shop } });
      await db.restockJob.deleteMany({ where: { shop, status: "PENDING" } });
      return new Response(null, { status: 200 });
    }

    // MANDATORY GDPR & PRIVACY COMPLIANCE WEBHOOKS
    case "CUSTOMERS_DATA_REQUEST": {
      const customerEmail = payload.customer?.email?.toLowerCase().trim();
      const customerPhone = payload.customer?.phone;
      console.log(`[GDPR Data Request] for customer: ${customerEmail || customerPhone} in shop: ${shop}`);

      const userSubscriptions = customerEmail
        ? await db.restockSubscription.findMany({
            where: { shop, customerEmail },
          })
        : [];

      return new Response(JSON.stringify({ subscriptions: userSubscriptions }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    case "CUSTOMERS_REDACT": {
      const customerEmail = payload.customer?.email?.toLowerCase().trim();
      console.log(`[GDPR Customers Redact] Redacting data for: ${customerEmail} in shop: ${shop}`);
      if (customerEmail) {
        await db.restockSubscription.deleteMany({
          where: { shop, customerEmail },
        });
      }
      return new Response(null, { status: 200 });
    }

    case "SHOP_REDACT": {
      console.log(`[GDPR Shop Redact] Purging all records for shop: ${shop}`);
      await db.restockSubscription.deleteMany({ where: { shop } });
      await db.inventoryItemMapping.deleteMany({ where: { shop } });
      await db.restockSettings.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      await db.restockJob.deleteMany({ where: { shop } });
      await db.webhookEvent.deleteMany({ where: { shop } });
      await db.inventoryLocationState.deleteMany({ where: { shop } });
      return new Response(null, { status: 200 });
    }

    // ORDER CONVERSION ATTRIBUTION WEBHOOKS
    case "ORDERS_CREATE":
    case "ORDERS_PAID": {
      console.log(`[Order Webhook Received] Topic: ${topic} for shop: ${shop}`);
      try {
        const attribution = await attributeOrderConversion(shop, payload);
        console.log(
          `[Order Attribution Processed] Shop: ${shop} | Matched: ${attribution.matchedCount} restock conversions`
        );
      } catch (err: any) {
        console.error("[Order Attribution Error]:", err?.message || err);
      }
      return new Response(null, { status: 200 });
    }

    default:
      console.warn(`[Unhandled Webhook Topic]: ${topic}`);
      return new Response("Unhandled webhook", { status: 200 });
  }
}
