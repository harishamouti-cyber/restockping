import db from "../db.server";
import { emitRestockFlowTrigger, type AdminClient } from "./flowEmitter.server";

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
      dispatchedCount,
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

export interface ProcessRestockParams {
  shop: string;
  inventoryItemId: string;
  availableUnits: number;
  admin?: AdminClient;
}

/**
 * Processes FIFO inventory restock events for a replenished item.
 * Calculates the paced cohort size: min(Replenished Units * Multiplier, Waitlist Count),
 * sequentially emits native Shopify Flow triggers, and marks only confirmed deliveries as DISPATCHED.
 */
export async function processFifoInventoryRestock({
  shop,
  inventoryItemId,
  availableUnits,
  admin,
}: ProcessRestockParams) {
  // 1. Fetch store settings
  const settings = await db.restockSettings.findUnique({
    where: { shop },
  });

  const multiplier = Number(settings?.dripBatchMultiplier) || 2.5;

  // 2. Query pending subscribers chronologically
  const pendingSubscribers = await db.restockSubscription.findMany({
    where: {
      shop,
      inventoryItemId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (pendingSubscribers.length === 0) {
    return {
      dispatchedCount: 0,
      remainingPending: 0,
      batchId: 0,
    };
  }

  // 3. Calculate paced cohort limit
  const theoreticalCapacity = Math.round(availableUnits * multiplier);
  const cohortSize = Math.max(
    1,
    Math.min(theoreticalCapacity, pendingSubscribers.length)
  );

  const cohort = pendingSubscribers.slice(0, cohortSize);
  const dispatchedIds: string[] = [];

  // Determine current highest batch number
  const latestBatch = await db.restockSubscription.findFirst({
    where: { shop, inventoryItemId },
    orderBy: { dispatchBatch: "desc" },
    select: { dispatchBatch: true },
  });
  const currentBatchId = (latestBatch?.dispatchBatch ?? 0) + 1;

  for (const subscriber of cohort) {
    if (!subscriber.customerEmail) continue;

    try {
      await emitRestockFlowTrigger(admin || shop, {
        customerEmail: subscriber.customerEmail,
        productTitle: subscriber.productTitle,
        variantTitle: subscriber.variantTitle,
        price: Number(subscriber.priceSnapshot) || 0,
        variantId: subscriber.variantId,
        productId: subscriber.productId,
        shop,
        discountCode: settings?.incentiveDiscountCode || undefined,
      });

      dispatchedIds.push(subscriber.id);
    } catch (err) {
      console.error(
        `[FIFO Flow Dispatch Error for ${subscriber.customerEmail}]:`,
        err
      );
      // Retain unnotified or failed entries as PENDING to preserve customer queue integrity
    }
  }

  // 4. Update only successfully emitted subscribers to DISPATCHED
  if (dispatchedIds.length > 0) {
    await db.restockSubscription.updateMany({
      where: {
        id: { in: dispatchedIds },
      },
      data: {
        status: "DISPATCHED",
        dispatchBatch: currentBatchId,
        dispatchedAt: new Date(),
      },
    });
  }

  const remainingPending = pendingSubscribers.length - dispatchedIds.length;

  return {
    dispatchedCount: dispatchedIds.length,
    remainingPending,
    batchId: currentBatchId,
  };
}
