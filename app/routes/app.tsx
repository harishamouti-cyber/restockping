import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider, Banner, Box, Button, Card, Page, Text } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate, MONTHLY_PLAN, isTestShop } from "../shopify.server";
import db from "../db.server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export async function loader({ request }: LoaderFunctionArgs) {
  let session: any;
  let billing: any;

  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
    billing = auth.billing;
  } catch (authErr: any) {
    if (authErr instanceof Response) {
      throw authErr;
    }
    console.error("[RestockPing Auth Exception]:", authErr?.message || authErr);
    throw new Response(
      `Failed to initialize Shopify admin session: ${authErr?.message || "Storage or connection error"}. Please ensure your database is active.`,
      { status: 500, statusText: "Session Error" }
    );
  }

  const shop = session.shop;

  // Enforce Managed Billing: test mode strictly for development/test stores
  const isTest = isTestShop(shop);
  try {
    await billing.require({
      plans: [MONTHLY_PLAN],
      isTest,
      onFailure: async () =>
        billing.request({
          plan: MONTHLY_PLAN,
          isTest,
        }),
    });
  } catch (billingErr: any) {
    // If billing.require threw a redirect Response, let Remix handle it
    if (billingErr instanceof Response) {
      throw billingErr;
    }
    console.error(`[Billing Error for ${shop}]:`, billingErr?.message || billingErr);
  }

  // Ensure default RestockSettings exist for this store
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
  } catch (dbErr: any) {
    console.error("[Database Settings Upsert Warning]:", dbErr?.message || dbErr);
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
    let title = "Application Notice";
    let message = "RestockPing encountered a temporary issue while communicating with store services.";

    if (isRouteErrorResponse(error)) {
      title = `${error.status} ${error.statusText || "Notice"}`;
      message = typeof error.data === "string" ? error.data : JSON.stringify(error.data);
    } else if (error instanceof Error) {
      message = error.message;
    }

    return (
      <AppProvider i18n={enTranslations}>
        <div style={{ padding: "2rem", maxWidth: "600px", margin: "2rem auto", fontFamily: "sans-serif" }}>
          <div style={{ background: "#fff", padding: "2rem", borderRadius: "8px", border: "1px solid #e1e3e5", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h2 style={{ color: "#d72c0d", fontSize: "1.25rem", margin: "0 0 0.75rem 0", fontWeight: 600 }}>
              {title}
            </h2>
            <p style={{ color: "#202223", fontSize: "0.95rem", lineHeight: "1.5", margin: "0 0 1.25rem 0" }}>
              {message}
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <a
                href="/app"
                style={{
                  display: "inline-block",
                  background: "#008060",
                  color: "#fff",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: "0.9rem",
                }}
              >
                Reload App
              </a>
              <a
                href="/auth/login"
                style={{
                  display: "inline-block",
                  background: "#f1f2f3",
                  color: "#202223",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: "0.9rem",
                  border: "1px solid #c9cccf",
                }}
              >
                Re-authenticate
              </a>
            </div>
          </div>
        </div>
      </AppProvider>
    );
  }
}
