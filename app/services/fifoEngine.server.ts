import db from "../db.server";
import { sendRestockNotificationEmail } from "./email.server";
import { getLiveProductMedia, type ResolvedProductMedia } from "./catalog.server";

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
  admin,
}: {
  shop: string;
  inventoryItemId: string;
  newAvailableQuantity: number;
  admin?: any;
}) {
  const settings = (await db.restockSettings.findUnique({ where: { shop } })) || {
    dripBatchMultiplier: 2.5,
    minRestockThreshold: 1,
    accentColor: "#008060",
    senderName: "RestockPing Alerts",
    emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    emailHeadline: "Your item is back in stock",
    emailBodyText: "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    emailButtonText: "Claim In-Stock Item →",
  };

  if (newAvailableQuantity < (settings.minRestockThreshold || 1)) {
    return { processed: 0, reason: "Restocked units below minimum threshold" };
  }

  const rawId = inventoryItemId.replace(/\D/g, "");
  const gid = `gid://shopify/InventoryItem/${rawId}`;

  // 1. Resolve inventory item to variant via mapping table or Shopify Admin GraphQL API
  let resolvedVariantId: string | null = null;

  const existingMapping = await db.inventoryItemMapping.findFirst({
    where: {
      shop,
      OR: [
        { inventoryItemId: gid },
        { inventoryItemId: rawId },
        { inventoryItemId: inventoryItemId },
      ],
    },
  });

  if (existingMapping) {
    resolvedVariantId = existingMapping.variantId;
  } else if (admin) {
    try {
      const query = `#graphql
        query getVariantByInventoryItem($id: ID!) {
          inventoryItem(id: $id) {
            id
            sku
            variant {
              id
              title
              price
              product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `;
      const response = await admin.graphql(query, { variables: { id: gid } });
      const json = await response.json();
      const item = json.data?.inventoryItem;

      if (item?.variant) {
        resolvedVariantId = item.variant.id;
        const resolvedProductId = item.variant.product?.id || "";
        const resolvedSku = item.sku || null;

        // Persist mapping for rapid subsequent lookups
        await db.inventoryItemMapping.upsert({
          where: { inventoryItemId: gid },
          update: {
            shop,
            productId: resolvedProductId,
            variantId: resolvedVariantId,
            sku: resolvedSku,
          },
          create: {
            inventoryItemId: gid,
            shop,
            productId: resolvedProductId,
            variantId: resolvedVariantId,
            sku: resolvedSku,
          },
        });

        // Backfill placeholder mapped_ variant records to real Shopify InventoryItem GID
        await db.restockSubscription.updateMany({
          where: {
            shop,
            variantId: resolvedVariantId,
            inventoryItemId: { startsWith: "mapped_" },
          },
          data: {
            inventoryItemId: gid,
          },
        });
      }
    } catch (err) {
      console.error("[GraphQL InventoryItem Resolution Error]:", err);
    }
  }

  // 2. Query ONLY pending waitlist subscribers for this specific replenished variant/item
  const pendingSubscribers = await db.restockSubscription.findMany({
    where: {
      shop,
      status: "PENDING",
      OR: [
        ...(resolvedVariantId ? [{ variantId: resolvedVariantId }] : []),
        { inventoryItemId: gid },
        { inventoryItemId: rawId },
        { inventoryItemId: inventoryItemId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // CRITICAL SAFETY POLICY: If no subscribers are waiting for THIS product, exit cleanly.
  // Never fall back to querying or emailing unrelated subscribers across the store!
  if (pendingSubscribers.length === 0) {
    return { processed: 0, reason: "No pending waitlist requests for this item" };
  }

  // 3. Pacing Cohort Calculation:
  // Multiplier >= 1.0 (1.0 = strict 1:1, > 1.0 = paced over-notification cohort)
  const multiplier = Math.max(1.0, Number(settings.dripBatchMultiplier) || 2.5);
  const targetBatchSize = Math.min(
    Math.round(newAvailableQuantity * multiplier),
    pendingSubscribers.length
  );

  const cohort = pendingSubscribers.slice(0, targetBatchSize);
  const liveMediaByVariant = new Map<string, ResolvedProductMedia | null>();
  let sent = 0;

  for (const sub of cohort) {
    if (!sub.customerEmail) continue;

    let liveMedia: ResolvedProductMedia | null = null;
    if (admin) {
      try {
        if (!liveMediaByVariant.has(sub.variantId)) {
          liveMediaByVariant.set(sub.variantId, await getLiveProductMedia(admin, sub.variantId));
        }
        liveMedia = liveMediaByVariant.get(sub.variantId) || null;
      } catch (mediaError) {
        console.error("[Restock email product media lookup failed]", mediaError);
      }
    }

    try {
      await sendRestockNotificationEmail({
        to: sub.customerEmail,
        shop,
        productTitle: liveMedia?.productTitle || sub.productTitle,
        variantTitle: liveMedia?.variantTitle || sub.variantTitle,
        price: liveMedia?.price ?? (Number(sub.priceSnapshot) || 0),
        variantId: liveMedia?.variantId || sub.variantId,
        productImageUrl: liveMedia ? liveMedia.imageUrl || undefined : sub.productImageUrl || undefined,
        storeDisplayName: (settings as any).storeDisplayName || undefined,
        senderName: settings.senderName,
        subjectTemplate: settings.emailSubjectTemplate,
        headlineText: settings.emailHeadline,
        bodyText: settings.emailBodyText,
        buttonText: settings.emailButtonText || "Claim In-Stock Item →",
        accentColor: settings.accentColor,
        discountCode: settings.incentiveDiscountCode || undefined,
        subscriptionId: sub.id,
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
    admin: params.admin,
  });
  return {
    dispatchedCount: result.processed,
    remainingPending: 0,
    batchId: 1,
  };
}
