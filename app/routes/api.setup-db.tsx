import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";

function isAuthorized(request: Request): boolean {
  const configuredSecret = process.env.SETUP_DB_SECRET;
  if (!configuredSecret) {
    // If no secret configured in environment, completely disable this route
    return false;
  }

  const url = new URL(request.url);
  const providedSecret =
    url.searchParams.get("secret") ||
    request.headers.get("x-setup-secret") ||
    "";

  if (!providedSecret) return false;

  try {
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(configuredSecret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Reject unauthorized requests with 404 so endpoint existence is concealed
  if (!isAuthorized(request)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "state" TEXT NOT NULL,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT,
        "expires" TIMESTAMP(3),
        "accessToken" TEXT NOT NULL,
        "userId" BIGINT
      )`,
      `CREATE TABLE IF NOT EXISTS "RestockSettings" (
        "shop" TEXT PRIMARY KEY,
        "senderName" TEXT NOT NULL DEFAULT 'Fulfillment Center',
        "senderEmail" TEXT,
        "replyToEmail" TEXT,
        "accentColor" TEXT NOT NULL DEFAULT '#008060',
        "dripBatchMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
        "dripIntervalMinutes" INTEGER NOT NULL DEFAULT 120,
        "minRestockThreshold" INTEGER NOT NULL DEFAULT 1,
        "enableWebPush" BOOLEAN NOT NULL DEFAULT false,
        "incentiveDiscountCode" TEXT,
        "emailSubjectTemplate" TEXT NOT NULL DEFAULT 'Back in Stock: {{product_title}} is ready to ship',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "InventoryItemMapping" (
        "inventoryItemId" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "variantId" TEXT NOT NULL,
        "sku" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS "InventoryItemMapping_shop_variantId_idx" ON "InventoryItemMapping"("shop", "variantId")`,
      `CREATE TABLE IF NOT EXISTS "RestockSubscription" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "variantId" TEXT NOT NULL,
        "inventoryItemId" TEXT NOT NULL,
        "productTitle" TEXT NOT NULL,
        "variantTitle" TEXT NOT NULL,
        "priceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
        "customerEmail" TEXT,
        "pushEndpoint" TEXT,
        "pushP256dh" TEXT,
        "pushAuth" TEXT,
        "channel" TEXT NOT NULL DEFAULT 'EMAIL',
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "dispatchBatch" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "dispatchedAt" TIMESTAMP(3),
        "convertedAt" TIMESTAMP(3)
      )`,
      `CREATE INDEX IF NOT EXISTS "RestockSubscription_shop_variantId_status_idx" ON "RestockSubscription"("shop", "variantId", "status")`,
      `CREATE INDEX IF NOT EXISTS "RestockSubscription_shop_inventoryItemId_status_idx" ON "RestockSubscription"("shop", "inventoryItemId", "status")`,
      `CREATE INDEX IF NOT EXISTS "RestockSubscription_shop_customerEmail_idx" ON "RestockSubscription"("shop", "customerEmail")`,
      `CREATE TABLE IF NOT EXISTS "WebhookEvent" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "topic" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'RECEIVED',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS "WebhookEvent_shop_topic_idx" ON "WebhookEvent"("shop", "topic")`,
      `CREATE TABLE IF NOT EXISTS "RestockJob" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "inventoryItemId" TEXT NOT NULL,
        "locationId" TEXT,
        "availableQuantity" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "processedCount" INTEGER NOT NULL DEFAULT 0,
        "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lockedAt" TIMESTAMP(3),
        "completedAt" TIMESTAMP(3),
        "error" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS "RestockJob_shop_inventoryItemId_status_idx" ON "RestockJob"("shop", "inventoryItemId", "status")`,
      `CREATE INDEX IF NOT EXISTS "RestockJob_status_scheduledFor_idx" ON "RestockJob"("status", "scheduledFor")`,
      `CREATE TABLE IF NOT EXISTS "InventoryLocationState" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "inventoryItemId" TEXT NOT NULL,
        "locationId" TEXT NOT NULL DEFAULT 'ALL',
        "lastAvailable" INTEGER NOT NULL DEFAULT 0,
        "lastDispatchedAt" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InventoryLocationState_shop_inventoryItemId_locationId_key" UNIQUE ("shop", "inventoryItemId", "locationId")
      )`,
      `CREATE TABLE IF NOT EXISTS "RateLimitRecord" (
        "key" TEXT PRIMARY KEY,
        "count" INTEGER NOT NULL DEFAULT 1,
        "resetAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS "RateLimitRecord_resetAt_idx" ON "RateLimitRecord"("resetAt")`,
      `ALTER TABLE "RestockSubscription" ADD COLUMN IF NOT EXISTS "productImageUrl" TEXT`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storeDisplayName" TEXT DEFAULT ''`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "emailHeadline" TEXT NOT NULL DEFAULT 'Your item is back in stock'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "emailBodyText" TEXT NOT NULL DEFAULT 'Good news! An item you requested is available again. Complete your order now before inventory runs out.'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "emailButtonText" TEXT NOT NULL DEFAULT 'Claim In-Stock Item →'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storefrontButtonText" TEXT DEFAULT 'Notify Me When Available'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storefrontSuccessMessage" TEXT DEFAULT 'You''re on the waitlist! We''ll email you the moment stock returns.'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storefrontButtonRadius" INTEGER DEFAULT 6`,
    ];

    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }

    // Never return table counts or schema internals to the client
    return json({
      status: "SUCCESS",
      message: "Database schema synchronized successfully.",
    });
  } catch (error: unknown) {
    console.error("[Database Setup Error]:", error);
    return json(
      {
        status: "ERROR",
        message: "Failed to apply database migrations.",
      },
      { status: 500 }
    );
  }
}
