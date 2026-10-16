import db from "../db.server";
import {
  sendRestockNotificationEmail,
  SuppressedEmailError,
  HardBounceError,
  QuotaExceededError,
} from "./email.server";
import { getLiveProductMedia, normalizeShopifyImageUrl, type ResolvedProductMedia } from "./catalog.server";
import { emitRestockFlowTrigger } from "./flowEmitter.server";

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
      dispatchedCount, // Retain real dispatched count even when convertedCount is 0
      convertedCount: 0,
      ctrPercentage: "0.0",
      ctrBadgeLabel: `${dispatchedCount} Sent (Awaiting Orders)`,
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
 * Checks the live inventory level in Shopify for an inventory item.
 * Returns the summed available quantity across active inventory levels.
 */
async function fetchLiveInventoryQuantity(
  admin: any,
  inventoryItemIdGid: string
): Promise<number | null> {
  if (!admin || typeof admin.graphql !== "function") return null;

  try {
    const query = `#graphql
      query getLiveInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          inventoryLevels(first: 20) {
            nodes {
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, { variables: { id: inventoryItemIdGid } });
    const json = await response.json();
    const nodes = json.data?.inventoryItem?.inventoryLevels?.nodes;

    if (!Array.isArray(nodes)) return null;

    let totalAvailable = 0;
    for (const level of nodes) {
      const avail = level.quantities?.find((q: any) => q.name === "available");
      if (avail && typeof avail.quantity === "number") {
        totalAvailable += avail.quantity;
      }
    }
    return totalAvailable;
  } catch (err) {
    console.warn("[Live Inventory Check Error]:", err);
    return null;
  }
}

/**
 * Autonomous FIFO restock dispatch engine.
 * Dispatches transactional restock emails to the calculated cohort.
 * - Verifies real-time inventory before dispatch.
 * - Enforces pacing multiplier & cooldown.
 * - Emits Shopify Flow trigger.
 * - Tracks provider response & delivery state.
 */
export async function processInventoryRestock({
  shop,
  inventoryItemId,
  newAvailableQuantity,
  admin,
  batchNumber = 1,
}: {
  shop: string;
  inventoryItemId: string;
  newAvailableQuantity: number;
  admin?: any;
  batchNumber?: number;
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
    incentiveDiscountCode: null,
    storeDisplayName: null,
  };

  const minThreshold = settings.minRestockThreshold || 1;
  const rawId = inventoryItemId.replace(/\D/g, "");
  const gid = `gid://shopify/InventoryItem/${rawId}`;

  // 1. VERIFY REAL-TIME INVENTORY WITH SHOPIFY BEFORE DISPATCH (Requirement 2)
  let effectiveAvailable = newAvailableQuantity;
  if (admin) {
    const liveAvailable = await fetchLiveInventoryQuantity(admin, gid);
    if (liveAvailable !== null) {
      effectiveAvailable = liveAvailable;
      console.log(
        `[Inventory Pre-Dispatch Check] Verified live available inventory for ${gid}: ${liveAvailable} (webhook payload was ${newAvailableQuantity})`
      );
    }
  }

  if (effectiveAvailable < minThreshold) {
    return {
      processed: 0,
      reason: `Available units (${effectiveAvailable}) below minimum threshold (${minThreshold}). Dispatch aborted.`,
      skippedDueToInventory: true,
      remainingPending: 0,
    };
  }

  // 2. Resolve inventory item to variant via mapping table or Shopify Admin GraphQL API
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

      if (item?.variant?.id) {
        const variantIdStr: string = item.variant.id;
        resolvedVariantId = variantIdStr;
        const resolvedProductId = item.variant.product?.id || "";
        const resolvedSku = item.sku || null;

        await db.inventoryItemMapping.upsert({
          where: { inventoryItemId: gid },
          update: {
            shop,
            productId: resolvedProductId,
            variantId: variantIdStr,
            sku: resolvedSku,
          },
          create: {
            inventoryItemId: gid,
            shop,
            productId: resolvedProductId,
            variantId: variantIdStr,
            sku: resolvedSku,
          },
        });

        await db.restockSubscription.updateMany({
          where: {
            shop,
            variantId: variantIdStr,
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

  // 3. Query pending waitlist subscribers for this item
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

  if (pendingSubscribers.length === 0) {
    return { processed: 0, reason: "No pending waitlist requests for this item", remainingPending: 0 };
  }

  // 4. Pacing Cohort Calculation
  const multiplier = Math.max(1.0, Number(settings.dripBatchMultiplier) || 2.5);
  const targetBatchSize = Math.min(
    Math.round(effectiveAvailable * multiplier),
    pendingSubscribers.length
  );

  const cohort = pendingSubscribers.slice(0, targetBatchSize);
  const liveMediaByVariant = new Map<string, ResolvedProductMedia | null>();

  let sent = 0;
  let bouncedCount = 0;
  let suppressedCount = 0;
  let quotaErrorOccurred = false;

  for (const sub of cohort) {
    if (!sub.customerEmail) continue;

    let liveMedia: ResolvedProductMedia | null = null;
    if (admin) {
      try {
        if (!liveMediaByVariant.has(sub.variantId)) {
          liveMediaByVariant.set(sub.variantId, await getLiveProductMedia(admin, sub.variantId, sub.productId));
        }
        liveMedia = liveMediaByVariant.get(sub.variantId) || null;
      } catch (mediaError) {
        console.error("[Restock email product media lookup failed]", mediaError);
      }
    }

    const hasLiveMedia = Boolean(liveMedia && !liveMedia.isLookupFailed && liveMedia.productTitle);
    const resolvedTitle = hasLiveMedia ? liveMedia!.productTitle : sub.productTitle;
    const resolvedVariant = (hasLiveMedia && liveMedia!.variantTitle && liveMedia!.variantTitle !== "Default Title")
      ? liveMedia!.variantTitle
      : sub.variantTitle;
    const resolvedPrice = (hasLiveMedia && typeof liveMedia!.price === "number" && liveMedia!.price > 0)
      ? liveMedia!.price
      : (Number(sub.priceSnapshot) || 0);

    // Resolve image from saved subscription first, then live Shopify product media if needed
    let finalImageUrl: string | undefined = undefined;
    const savedNorm = normalizeShopifyImageUrl(sub.productImageUrl, shop, 300);
    if (savedNorm.isValid) {
      finalImageUrl = savedNorm.url;
    } else if (hasLiveMedia && liveMedia?.imageUrl) {
      const liveNorm = normalizeShopifyImageUrl(liveMedia.imageUrl, shop, 300);
      if (liveNorm.isValid) {
        finalImageUrl = liveNorm.url;
      }
    }
    const imageLookupError = !finalImageUrl ? (liveMedia?.imageLookupError || null) : null;

    // Atomically claim the subscription to prevent concurrent double-dispatch
    const claimResult = await db.restockSubscription.updateMany({
      where: {
        id: sub.id,
        shop,
        status: "PENDING",
      },
      data: {
        status: "QUEUED",
        lastAttemptedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    if (claimResult.count === 0) {
      continue;
    }

    try {
      const emailResult = await sendRestockNotificationEmail({
        to: sub.customerEmail,
        shop,
        productTitle: resolvedTitle,
        variantTitle: resolvedVariant,
        price: resolvedPrice,
        variantId: (hasLiveMedia && liveMedia?.variantId) || sub.variantId,
        productImageUrl: finalImageUrl,
        imageLookupError,
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

      // Update delivery state with provider message ID
      await db.restockSubscription.updateMany({
        where: { id: sub.id, shop },
        data: {
          status: "DISPATCHED",
          dispatchedAt: new Date(),
          dispatchBatch: batchNumber,
          providerMessageId: emailResult.messageId || null,
          deliveryError: null,
        },
      });

      // Emit native Shopify Flow trigger (Requirement 5)
      if (admin) {
        try {
          await emitRestockFlowTrigger(admin, {
            customerEmail: sub.customerEmail,
            productTitle: resolvedTitle,
            variantTitle: resolvedVariant,
            price: resolvedPrice,
            variantId: sub.variantId,
            productId: sub.productId,
            shop,
            discountCode: settings.incentiveDiscountCode || undefined,
          });
        } catch (flowErr: any) {
          console.warn(`[Shopify Flow Trigger Notice for ${sub.customerEmail}]:`, flowErr?.message || flowErr);
        }
      }

      sent++;
    } catch (err: any) {
      if (err instanceof SuppressedEmailError) {
        suppressedCount++;
        await db.restockSubscription.updateMany({
          where: { id: sub.id, shop },
          data: {
            status: "CANCELLED",
            deliveryError: "Suppressed: recipient opted out or previously bounced",
          },
        });
      } else if (err instanceof HardBounceError) {
        bouncedCount++;
        await db.restockSubscription.updateMany({
          where: { id: sub.id, shop },
          data: {
            status: "BOUNCED",
            deliveryError: err.message,
          },
        });
      } else if (err instanceof QuotaExceededError) {
        quotaErrorOccurred = true;
        // Revert to PENDING so queue worker can retry
        await db.restockSubscription.updateMany({
          where: { id: sub.id, shop, status: "QUEUED" },
          data: {
            status: "PENDING",
            deliveryError: "Rate/Quota limit reached; queued for delayed retry",
          },
        });
        break; // Stop cohort processing on quota limit
      } else {
        console.error(`[Restock Dispatch Error for ${sub.customerEmail}]:`, err?.message || err);
        await db.restockSubscription.updateMany({
          where: { id: sub.id, shop, status: "QUEUED" },
          data: {
            status: "PENDING",
            deliveryError: String(err?.message || err).slice(0, 255),
          },
        });
      }
    }
  }

  const remainingPendingCount = pendingSubscribers.length - cohort.length;

  return {
    processed: sent,
    bouncedCount,
    suppressedCount,
    quotaErrorOccurred,
    remainingPending: Math.max(0, remainingPendingCount),
    batchNumber,
  };
}

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
    remainingPending: result.remainingPending,
    batchId: 1,
  };
}
