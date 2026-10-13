import db from "../db.server";
import { processInventoryRestock } from "./fifoEngine.server";

/**
 * Durable webhook idempotency.
 * Checks whether this Shopify webhook delivery ID was already recorded.
 * If new, records the event atomically.
 */
export async function recordWebhookEvent(
  webhookId: string,
  shop: string,
  topic: string
): Promise<{ isDuplicate: boolean }> {
  if (!webhookId) return { isDuplicate: false };

  try {
    await db.webhookEvent.create({
      data: {
        id: webhookId,
        shop,
        topic,
        status: "RECEIVED",
      },
    });
    return { isDuplicate: false };
  } catch (err: any) {
    // Unique constraint violation P2002 indicates duplicate delivery
    if (err?.code === "P2002" || String(err?.message || "").includes("Unique constraint")) {
      return { isDuplicate: true };
    }
    // If table write fails unexpectedly, allow processing rather than losing webhooks
    console.error("[Webhook Deduplication Error]:", err?.message || err);
    return { isDuplicate: false };
  }
}

export interface EnqueueInventoryParams {
  shop: string;
  inventoryItemId: string;
  locationId?: string | null;
  availableQuantity: number;
}

export interface EnqueueResult {
  enqueued: boolean;
  jobId?: string;
  scheduledFor?: Date;
  reason?: string;
}

/**
 * Enqueues an inventory restock event into the durable RestockJob queue.
 * Defines safe behavior for repeated updates, sales decreases, and multiple locations:
 * - If available quantity decreased or remained the same, it is NOT a restock.
 * - If available quantity is below merchant's minRestockThreshold, alerts do not fire.
 * - If a cohort was recently alerted within dripIntervalMinutes, schedules with a durable cooldown delay.
 */
export async function enqueueInventoryRestock(params: EnqueueInventoryParams): Promise<EnqueueResult> {
  const { shop, availableQuantity } = params;
  const rawId = params.inventoryItemId.replace(/\D/g, "");
  const inventoryItemId = rawId ? `gid://shopify/InventoryItem/${rawId}` : params.inventoryItemId;
  const locationId = params.locationId ? String(params.locationId).trim() : "ALL";

  // 1. Fetch store settings
  const settings = (await db.restockSettings.findUnique({ where: { shop } })) || {
    minRestockThreshold: 1,
    dripIntervalMinutes: 120,
    dripBatchMultiplier: 2.5,
  };

  const minThreshold = settings.minRestockThreshold || 1;
  const dripIntervalMs = (settings.dripIntervalMinutes || 120) * 60 * 1000;

  // 2. Query location state to inspect previous available quantity and last alert timestamp
  const locationState = await db.inventoryLocationState.findUnique({
    where: {
      shop_inventoryItemId_locationId: {
        shop,
        inventoryItemId,
        locationId,
      },
    },
  });

  const previousAvailable = locationState?.lastAvailable ?? 0;

  // Update location state with latest quantity
  await db.inventoryLocationState.upsert({
    where: {
      shop_inventoryItemId_locationId: {
        shop,
        inventoryItemId,
        locationId,
      },
    },
    update: {
      lastAvailable: availableQuantity,
    },
    create: {
      shop,
      inventoryItemId,
      locationId,
      lastAvailable: availableQuantity,
    },
  });

  // POLICY 1: Inventory did not increase (e.g. order placed, reduction, or repeated webhook)
  if (locationState && availableQuantity <= previousAvailable) {
    return {
      enqueued: false,
      reason: `Inventory did not increase (previous: ${previousAvailable}, current: ${availableQuantity})`,
    };
  }

  // POLICY 2: Inventory is below the merchant's minimum restock threshold
  if (availableQuantity < minThreshold) {
    return {
      enqueued: false,
      reason: `Available quantity (${availableQuantity}) below threshold (${minThreshold})`,
    };
  }

  // POLICY 3: Durable cooldown scheduling
  let scheduledFor = new Date();
  if (locationState?.lastDispatchedAt) {
    const elapsedMs = Date.now() - locationState.lastDispatchedAt.getTime();
    if (elapsedMs < dripIntervalMs) {
      const remainingCooldownMs = dripIntervalMs - elapsedMs;
      scheduledFor = new Date(Date.now() + remainingCooldownMs);
      console.log(
        `[Restock Cooldown Active] Scheduling restock job for shop ${shop} after ${Math.ceil(remainingCooldownMs / 60000)}m cooldown.`
      );
    }
  }

  // 3. Enqueue durable job
  const job = await db.restockJob.create({
    data: {
      shop,
      inventoryItemId,
      locationId,
      availableQuantity,
      status: "PENDING",
      scheduledFor,
    },
  });

  return {
    enqueued: true,
    jobId: job.id,
    scheduledFor,
  };
}

/**
 * Background worker: processes pending restock jobs that are due.
 * Atomically locks each job to ensure concurrent workers cannot process the same job.
 */
export async function processPendingRestockJobs(options?: {
  jobId?: string;
  admin?: any;
}): Promise<{ processedJobs: number; dispatchedSubscribers: number }> {
  const now = new Date();

  // Find due jobs
  const jobs = options?.jobId
    ? await db.restockJob.findMany({ where: { id: options.jobId, status: "PENDING" } })
    : await db.restockJob.findMany({
        where: {
          status: "PENDING",
          scheduledFor: { lte: now },
        },
        orderBy: { scheduledFor: "asc" },
        take: 5,
      });

  let processedJobs = 0;
  let totalDispatched = 0;

  for (const job of jobs) {
    // Atomically claim and lock the job
    const lockResult = await db.restockJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", lockedAt: new Date() },
    });

    if (lockResult.count === 0) {
      // Already claimed by another worker instance
      continue;
    }

    try {
      const result = await processInventoryRestock({
        shop: job.shop,
        inventoryItemId: job.inventoryItemId,
        newAvailableQuantity: job.availableQuantity,
        admin: options?.admin,
      });

      // Update location state with last dispatch timestamp if alerts were sent
      if (result.processed > 0) {
        await db.inventoryLocationState.upsert({
          where: {
            shop_inventoryItemId_locationId: {
              shop: job.shop,
              inventoryItemId: job.inventoryItemId,
              locationId: job.locationId || "ALL",
            },
          },
          update: {
            lastDispatchedAt: new Date(),
          },
          create: {
            shop: job.shop,
            inventoryItemId: job.inventoryItemId,
            locationId: job.locationId || "ALL",
            lastAvailable: job.availableQuantity,
            lastDispatchedAt: new Date(),
          },
        });
      }

      await db.restockJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          processedCount: result.processed,
          completedAt: new Date(),
        },
      });

      processedJobs++;
      totalDispatched += result.processed;
    } catch (err: any) {
      console.error(`[Restock Job Processing Error for ${job.id}]:`, err?.message || err);
      await db.restockJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: String(err?.message || err).slice(0, 500),
        },
      });
    }
  }

  return { processedJobs, dispatchedSubscribers: totalDispatched };
}
