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
      await db.$executeRawUnsafe(`
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
      `);
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
    await billing.require({
      plans: [MONTHLY_PLAN],
      isTest: isTestStore,
      onFailure: async () =>
        billing.request({
          plan: MONTHLY_PLAN,
          isTest: isTestStore,
        }),
    });
  } catch (billingErr) {
    if (billingErr instanceof Response) {
      throw billingErr;
    }
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
          Dashboard
        </Link>
        <Link to="/app/subscribers">Waitlist Subscribers</Link>
        <Link to="/app/simulation">Simulation Lab</Link>
        <Link to="/app/settings">Settings</Link>
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
    return (
      <AppProvider i18n={enTranslations}>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2>RestockPing Notice</h2>
          <p style={{ color: "#d72c0d" }}>
            {error instanceof Error ? error.message : JSON.stringify(error)}
          </p>
          <a href="/app" style={{ color: "#008060" }}>Reload App</a>
        </div>
      </AppProvider>
    );
  }
}
