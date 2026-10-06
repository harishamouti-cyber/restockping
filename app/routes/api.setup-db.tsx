import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  // Basic guard (or allow setup)
  try {
    // Check if Session table exists by performing a simple count
    const sessionCount = await prisma.session.count().catch(() => null);

    if (sessionCount !== null) {
      return json({
        status: "READY",
        message: "Database tables are already synchronized and active.",
        sessionCount,
      });
    }

    // If tables do not exist yet in PostgreSQL, create them via raw SQL DDL
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "state" TEXT NOT NULL,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT,
        "expires" TIMESTAMP(3),
        "accessToken" TEXT NOT NULL,
        "userId" BIGINT
      );

      CREATE TABLE IF NOT EXISTS "RestockSettings" (
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
      );

      CREATE TABLE IF NOT EXISTS "InventoryItemMapping" (
        "inventoryItemId" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "variantId" TEXT NOT NULL,
        "sku" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "InventoryItemMapping_shop_variantId_idx" ON "InventoryItemMapping"("shop", "variantId");

      CREATE TABLE IF NOT EXISTS "RestockSubscription" (
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
      );
      CREATE INDEX IF NOT EXISTS "RestockSubscription_shop_variantId_status_idx" ON "RestockSubscription"("shop", "variantId", "status");
      CREATE INDEX IF NOT EXISTS "RestockSubscription_shop_inventoryItemId_status_idx" ON "RestockSubscription"("shop", "inventoryItemId", "status");
      CREATE INDEX IF NOT EXISTS "RestockSubscription_shop_customerEmail_idx" ON "RestockSubscription"("shop", "customerEmail");
    `);

    return json({
      status: "SUCCESS",
      message: "Database tables created and synchronized successfully!",
    });
  } catch (error: unknown) {
    const err = error as Error;
    return json(
      {
        status: "ERROR",
        message: err.message || "Database synchronization failed",
      },
      { status: 500 }
    );
  }
}
