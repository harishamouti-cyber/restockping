import db from "../db.server";
import { sendRestockNotificationEmail } from "./email.server";

export interface MetricCalculations {
  totalRegistered: number;
  pendingCount: number;
  dispatchedCount: number;
  convertedCount: number;
  ctrPercentage: string | null;
  ctrBadgeLabel: string;
  isCtrActive: boolean;
  hasOrders: boolean;
}

export function calculateConversionMetrics(subscribers: any[]): MetricCalculations {
  const totalRegistered = subscribers.length;
  const pendingCount = subscribers.filter((s) => s.status === "PENDING").length;
  const dispatchedCount = subscribers.filter(
    (s) => s.status === "DISPATCHED" || s.status === "CONVERTED"
  ).length;
  const convertedCount = subscribers.filter((s) => s.status === "CONVERTED").length;

  if (dispatchedCount === 0) {
    return {
      totalRegistered,
      pendingCount,
      dispatchedCount: 0,
      convertedCount: 0,
      ctrPercentage: null,
      ctrBadgeLabel: "No alerts sent yet",
      isCtrActive: false,
      hasOrders: false,
    };
  }

  if (convertedCount === 0) {
    return {
      totalRegistered,
      pendingCount,
      dispatchedCount: 0,
      convertedCount: 0,
      ctrPercentage: "0.0",
      ctrBadgeLabel: `${dispatchedCount} Sent (Awaiting Order)`,
      isCtrActive: true,
      hasOrders: false,
    };
  }

  const calculatedCtr = ((convertedCount / dispatchedCount) * 100).toFixed(1);
  return {
    totalRegistered,
    pendingCount,
    dispatchedCount,
    convertedCount,
    ctrPercentage: calculatedCtr,
    ctrBadgeLabel: `${dispatchedCount} Sent (${calculatedCtr}% Conversion)`,
    isCtrActive: true,
    hasOrders: true,
  };
}

export function calculateVelocityMetrics(subscribers: any[]) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const currentPeriodDemand = subscribers
    .filter((s) => new Date(s.createdAt) >= sevenDaysAgo)
    .reduce((acc, s) => acc + (Number(s.priceSnapshot) || 0), 0);

  const previousPeriodDemand = subscribers
    .filter(
      (s) =>
        new Date(s.createdAt) >= fourteenDaysAgo &&
        new Date(s.createdAt) < sevenDaysAgo
    )
    .reduce((acc, s) => acc + (Number(s.priceSnapshot) || 0), 0);

  if (previousPeriodDemand > 0) {
    const delta =
      ((currentPeriodDemand - previousPeriodDemand) / previousPeriodDemand) * 100;
    return {
      label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% demand growth`,
      isPositive: delta >= 0,
      hasBaseline: true,
    };
  }

  return {
    label:
      subscribers.length > 0 ? "First Request" : "No Activity",
    isPositive: true,
    hasBaseline: false,
  };
}

/**
 * Autonomous FIFO restock dispatch engine.
 * Dispatches transactional restock emails directly via nodemailer to the calculated cohort.
 */
export async function processInventoryRestock({
  shop,
  inventoryItemId,
  newAvailableQuantity,
}: {
  shop: string;
  inventoryItemId: string;
  newAvailableQuantity: number;
}) {
  const settings = (await db.restockSettings.findUnique({ where: { shop } })) || {
    dripBatchMultiplier: 2.5,
    minRestockThreshold: 1,
    accentColor: "#008060",
    senderName: "RestockPing Alerts",
    emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    emailHeadline: "Your item is back in stock",
    emailBodyText: "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    emailButtonText: "Claim in 1-Click Checkout →",
  };

  if (newAvailableQuantity < settings.minRestockThreshold) {
    return { processed: 0 };
  }

  const rawId = inventoryItemId.replace(/\D/g, "");

  // Match pending subscribers specifically for this replenished inventory item
  let pendingSubscribers = await db.restockSubscription.findMany({
    where: {
      shop,
      status: "PENDING",
      OR: [
        { inventoryItemId: inventoryItemId },
        { inventoryItemId: rawId },
        { inventoryItemId: `gid://shopify/InventoryItem/${rawId}` },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // If no records explicitly match the exact inventoryItemId, fetch shop pending subscribers as fallback
  if (pendingSubscribers.length === 0) {
    pendingSubscribers = await db.restockSubscription.findMany({
      where: { shop, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  }

  if (pendingSubscribers.length === 0) {
    return { processed: 0 };
  }

  const targetBatchSize = Math.min(
    Math.round(newAvailableQuantity * (settings.dripBatchMultiplier || 2.5)),
    pendingSubscribers.length
  );

  const cohort = pendingSubscribers.slice(0, targetBatchSize);
  let sent = 0;

  for (const sub of cohort) {
    if (!sub.customerEmail) continue;

    try {
      await sendRestockNotificationEmail({
        to: sub.customerEmail,
        shop,
        productTitle: sub.productTitle,
        variantTitle: sub.variantTitle,
        price: Number(sub.priceSnapshot) || 0,
        variantId: sub.variantId,
        productImageUrl: sub.productImageUrl || undefined,
        storeDisplayName: (settings as any).storeDisplayName || undefined,
        senderName: settings.senderName,
        subjectTemplate: settings.emailSubjectTemplate,
        headlineText: settings.emailHeadline,
        bodyText: settings.emailBodyText,
        buttonText: settings.emailButtonText,
        accentColor: settings.accentColor,
      });

      await db.restockSubscription.update({
        where: { id: sub.id },
        data: { status: "DISPATCHED", dispatchedAt: new Date() },
      });

      sent++;
    } catch (err) {
      console.error(`[Webhook Auto-Dispatch Error for ${sub.customerEmail}]:`, err);
    }
  }

  return { processed: sent };
}

/**
 * Backward compatibility wrapper for previous callers.
 */
export async function processFifoInventoryRestock(params: {
  shop: string;
  inventoryItemId: string;
  availableUnits: number;
  admin?: any;
}) {
  const result = await processInventoryRestock({
    shop: params.shop,
    inventoryItemId: params.inventoryItemId,
    newAvailableQuantity: params.availableUnits,
  });
  return {
    dispatchedCount: result.processed,
    remainingPending: 0,
    batchId: 1,
  };
}
