import db from "../db.server";
import { generateCartPermalink, extractVariantIdNumber } from "../utils/permalink";
import { sendRestockNotificationEmail } from "./email.server";

export { generateCartPermalink, extractVariantIdNumber };

export interface FifoDispatchParams {
  shop: string;
  inventoryItemId: string;
  availableUnits: number;
}

export interface DispatchResult {
  success: boolean;
  inventoryItemId: string;
  availableUnits: number;
  multiplier: number;
  targetAlerts: number;
  dispatchedCount: number;
  remainingPending: number;
  batchId: number;
  permalinksGenerated: string[];
}

/**
 * Triggers the FIFO Anti-Burnout Drip Dispatcher for newly reported restock levels.
 * Uses the single, shared sendRestockNotificationEmail implementation.
 */
export async function triggerFifoRestockDispatch({
  shop,
  inventoryItemId,
  availableUnits,
}: FifoDispatchParams): Promise<DispatchResult> {
  // 1. Fetch store settings
  const settings = await db.restockSettings.findUnique({
    where: { shop },
  });

  const multiplier = settings?.dripBatchMultiplier ?? 2.5;
  const discountCode = settings?.incentiveDiscountCode;
  const senderName = settings?.senderName || "Fulfillment Center";
  const subjectTemplate =
    settings?.emailSubjectTemplate || "Back in Stock: {{product_title}} is ready to ship";

  // 2. Count current pending subscribers
  const pendingCount = await db.restockSubscription.count({
    where: {
      shop,
      inventoryItemId,
      status: "PENDING",
    },
  });

  if (pendingCount === 0) {
    return {
      success: true,
      inventoryItemId,
      availableUnits,
      multiplier,
      targetAlerts: 0,
      dispatchedCount: 0,
      remainingPending: 0,
      batchId: 0,
      permalinksGenerated: [],
    };
  }

  // 3. FIFO Formula: Target Alerts = min(round(availableUnits * multiplier), pendingCount)
  const calculatedCapacity = Math.round(availableUnits * multiplier);
  const targetAlerts = Math.max(1, Math.min(calculatedCapacity, pendingCount));

  // Determine current highest batch number for this restock item
  const latestBatch = await db.restockSubscription.findFirst({
    where: { shop, inventoryItemId },
    orderBy: { dispatchBatch: "desc" },
    select: { dispatchBatch: true },
  });
  const currentBatchId = (latestBatch?.dispatchBatch ?? 0) + 1;

  // 4. Fetch the earliest matching PENDING subscribers in strict FIFO order
  const subscribersToDispatch = await db.restockSubscription.findMany({
    where: {
      shop,
      inventoryItemId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "asc",
    },
    take: targetAlerts,
  });

  const permalinksGenerated: string[] = [];
  const dispatchedIds: string[] = [];

  for (const subscriber of subscribersToDispatch) {
    if (!subscriber.customerEmail) continue;

    const cartPermalink = generateCartPermalink({
      shop,
      variantId: subscriber.variantId,
      customerEmail: subscriber.customerEmail,
      discountCode,
    });
    permalinksGenerated.push(cartPermalink);

    // Send transactional email via shared sender
    await sendRestockNotificationEmail({
      to: subscriber.customerEmail,
      shop,
      storeDisplayName: settings?.storeDisplayName || undefined,
      productTitle: subscriber.productTitle,
      variantTitle: subscriber.variantTitle,
      price: Number(subscriber.priceSnapshot) || 0,
      variantId: subscriber.variantId,
      productImageUrl: subscriber.productImageUrl || undefined,
      senderName,
      headlineText: settings?.emailHeadline,
      bodyText: settings?.emailBodyText,
      buttonText: settings?.emailButtonText || "Claim In-Stock Item →",
      accentColor: settings?.accentColor,
      subjectTemplate,
      discountCode: discountCode || undefined,
      subscriptionId: subscriber.id,
    });

    dispatchedIds.push(subscriber.id);
  }

  // 5. Update subscription statuses to DISPATCHED
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

  const remainingPending = pendingCount - dispatchedIds.length;

  return {
    success: true,
    inventoryItemId,
    availableUnits,
    multiplier,
    targetAlerts,
    dispatchedCount: dispatchedIds.length,
    remainingPending,
    batchId: currentBatchId,
    permalinksGenerated,
  };
}
