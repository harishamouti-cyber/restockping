import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { processInventoryRestock } from "../services/fifoEngine.server";

// In-memory deduplication cache for webhook deliveries (15 minute TTL)
const processedWebhooks = new Map<string, number>();
const WEBHOOK_TTL_MS = 15 * 60 * 1000;

function isDuplicateWebhook(webhookId: string | null): boolean {
  if (!webhookId) return false;
  const now = Date.now();
  // Prune expired entries
  for (const [id, timestamp] of processedWebhooks.entries()) {
    if (now - timestamp > WEBHOOK_TTL_MS) {
      processedWebhooks.delete(id);
    }
  }
  if (processedWebhooks.has(webhookId)) {
    return true;
  }
  processedWebhooks.set(webhookId, now);
  return false;
}

export async function action({ request }: ActionFunctionArgs) {
  const webhookId = request.headers.get("x-shopify-webhook-id");
  if (webhookId && isDuplicateWebhook(webhookId)) {
    console.log(`[Webhook Ignored: Duplicate delivery] Webhook ID: ${webhookId}`);
    return new Response("Duplicate webhook delivery ignored", { status: 200 });
  }

  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!shop) {
    return new Response("Missing shop header", { status: 400 });
  }

  console.log(`[Webhook Received] Topic: ${topic} for Shop: ${shop}`);

  switch (topic) {
    case "INVENTORY_LEVELS_UPDATE": {
      const rawId = String(payload.inventory_item_id || payload.inventoryItemId || "");
      const inventoryItemId = rawId.startsWith("gid://shopify/InventoryItem/")
        ? rawId
        : `gid://shopify/InventoryItem/${rawId}`;
      const available = Number(payload.available ?? payload.availableUnits ?? 0);

      const result = await processInventoryRestock({
        shop,
        inventoryItemId,
        newAvailableQuantity: available,
        admin,
      });

      console.log(
        `[Inventory Restock Email Processing Completed] Shop: ${shop} | Dispatched: ${result.processed}`
      );

      return new Response(null, { status: 200 });
    }

    case "APP_UNINSTALLED": {
      console.log(`[App Uninstalled] Cleaning active sessions for shop: ${shop}`);
      await db.session.deleteMany({ where: { shop } });
      return new Response(null, { status: 200 });
    }

    // MANDATORY GDPR COMPLIANCE WEBHOOKS
    case "CUSTOMERS_DATA_REQUEST": {
      const customerEmail = payload.customer?.email;
      console.log(`[GDPR Data Request] for customer: ${customerEmail}`);

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
      const customerEmail = payload.customer?.email;
      console.log(`[GDPR Customers Redact] Redacting data for: ${customerEmail}`);
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
      return new Response(null, { status: 200 });
    }

    default:
      console.warn(`[Unhandled Webhook Topic]: ${topic}`);
      return new Response("Unhandled webhook", { status: 200 });
  }
}
