import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { triggerFifoRestockDispatch } from "../services/restockDispatcher.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!shop) {
    return new Response("Missing shop header", { status: 400 });
  }

  console.log(`[Webhook Received] Topic: ${topic} for Shop: ${shop}`);

  switch (topic) {
    case "INVENTORY_LEVELS_UPDATE": {
      const inventoryItemId = String(
        payload.inventory_item_id || payload.inventoryItemId || ""
      );
      const availableUnits = Number(
        payload.available ?? payload.availableUnits ?? 0
      );

      if (!inventoryItemId) {
        return new Response("Missing inventory_item_id", { status: 400 });
      }

      // Check merchant threshold
      const settings = await db.restockSettings.findUnique({
        where: { shop },
      });
      const threshold = settings?.minRestockThreshold ?? 1;

      if (availableUnits >= threshold) {
        const dispatchResult = await triggerFifoRestockDispatch({
          shop,
          inventoryItemId,
          availableUnits,
        });
        console.log(
          `[FIFO Dispatch Completed] Shop: ${shop} | Dispatched: ${dispatchResult.dispatchedCount} | Remaining: ${dispatchResult.remainingPending}`
        );
      } else {
        console.log(
          `[Inventory Update Skipped] Available ${availableUnits} below threshold ${threshold}`
        );
      }
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
      return new Response("Unhandled webhook topic", { status: 404 });
  }
}
