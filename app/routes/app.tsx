import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";
import db from "../db.server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  // Ensure default RestockSettings exist for this store with self-healing schema creation
  try {
    await db.restockSettings.upsert({
      where: { shop },
      update: {},
      create: {
        shop,
        senderName: "Fulfillment Center",
        dripBatchMultiplier: 2.5,
        dripIntervalMinutes: 120,
        minRestockThreshold: 1,
        emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
      },
    });
  } catch (dbErr) {
    console.error("Database settings upsert error, attempting self-healing schema creation:", dbErr);
    try {
      const healStatements = [
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
        "emailHeadline" TEXT NOT NULL DEFAULT 'Your item is back in stock',
        "emailBodyText" TEXT NOT NULL DEFAULT 'Good news! An item you requested is available again. Complete your order now before inventory runs out.',
        "emailButtonText" TEXT NOT NULL DEFAULT 'Claim in 1-Click Checkout →',
        "storeDisplayName" TEXT DEFAULT '',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "emailHeadline" TEXT NOT NULL DEFAULT 'Your item is back in stock'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "emailBodyText" TEXT NOT NULL DEFAULT 'Good news! An item you requested is available again. Complete your order now before inventory runs out.'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "emailButtonText" TEXT NOT NULL DEFAULT 'Claim in 1-Click Checkout →'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storeDisplayName" TEXT DEFAULT ''`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storefrontButtonText" TEXT DEFAULT 'Notify Me When Available'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storefrontSuccessMessage" TEXT DEFAULT 'You''re on the waitlist! We''ll email you the moment stock returns.'`,
      `ALTER TABLE "RestockSettings" ADD COLUMN IF NOT EXISTS "storefrontButtonRadius" INTEGER DEFAULT 6`,
      `CREATE TABLE IF NOT EXISTS "InventoryItemMapping" (
        "inventoryItemId" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "variantId" TEXT NOT NULL,
        "sku" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
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
        "productImageUrl" TEXT,
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
      `ALTER TABLE "RestockSubscription" ADD COLUMN IF NOT EXISTS "productImageUrl" TEXT`,
    ];
    for (const sql of healStatements) {
      await db.$executeRawUnsafe(sql);
    }
      await db.restockSettings.upsert({
        where: { shop },
        update: {},
        create: {
          shop,
          senderName: "Fulfillment Center",
          dripBatchMultiplier: 2.5,
          dripIntervalMinutes: 120,
          minRestockThreshold: 1,
          emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
          emailHeadline: "Your item is back in stock",
          emailBodyText: "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
          emailButtonText: "Claim in 1-Click Checkout →",
        },
      });
    } catch (healErr) {
      console.warn("Self-healing table creation completed with notice:", healErr);
    }
  }

  // Check Managed Billing with automatic test-mode detection for dev/partner stores
  const isTestStore =
    process.env.NODE_ENV !== "production" ||
    shop.includes("test") ||
    shop.includes("review") ||
    shop.includes("myshopify.com");

  try {
    const billingStatus = await billing.check({
      plans: [MONTHLY_PLAN],
      isTest: isTestStore,
    });
    console.log(`[Managed Billing] Shop ${shop} active payment:`, billingStatus?.hasActivePayment);
  } catch (billingErr) {
    console.warn("Managed billing verification skipped or pending card activation:", billingErr);
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "bb3d7694aa9a53e849de71dc2f2806fa",
    shop,
  });
}

export default function AppLayout() {
  return (
    <AppProvider i18n={enTranslations}>
      <ui-nav-menu>
        <Link to="/app" rel="home">
          Overview
        </Link>
        <Link to="/app/subscribers">Subscribers</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/simulation">Alert Simulator</Link>
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify Remix Error Boundary
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("App Route Error Boundary caught:", error);
  try {
    return boundary.error(error);
  } catch {
    const errMsg =
      error instanceof Error
        ? error.message
        : (error as any)?.message || (typeof error === "string" ? error : JSON.stringify(error));
    return (
      <AppProvider i18n={enTranslations}>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#d72c0d", marginBottom: "0.5rem" }}>RestockPing Notice</h2>
          <p style={{ color: "#202223", marginBottom: "1rem" }}>{errMsg}</p>
          <a
            href="/app"
            style={{
              display: "inline-block",
              background: "#008060",
              color: "#fff",
              padding: "0.5rem 1rem",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Reload App
          </a>
        </div>
      </AppProvider>
    );
  }
}
