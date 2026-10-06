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

  // Ensure default RestockSettings exist for this store
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
    // If billing is not configured in local mock dev or partner store without active card,
    // allow proceeding gracefully in non-production.
    if (process.env.NODE_ENV === "production" && !isTestStore) {
      throw billingErr;
    }
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
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
  return boundary.error(useRouteError());
}
