import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "preconnect", href: "https://cdn.shopify.com" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
];

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  return {
    "Cache-Control": loaderHeaders.get("Cache-Control") || "no-cache",
  };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "bb3d7694aa9a53e849de71dc2f2806fa",
    host: url.searchParams.get("host") || "",
  });
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        {/* Shopify App Bridge v4 tag */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={apiKey}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = "An unexpected error occurred.";
  let errorDetails = "";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText || ""}`.trim();
    errorDetails = typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2);
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || "";
  } else if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, any>;
    errorMessage = errObj.message || errObj.statusText || "Application Error";
    errorDetails = errObj.stack || JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  const apiKey = "bb3d7694aa9a53e849de71dc2f2806fa";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>RestockPing Error Notice</title>
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={apiKey}
        />
        <Links />
      </head>
      <body style={{ fontFamily: "Inter, -apple-system, sans-serif", padding: "2rem", backgroundColor: "#f6f6f7", color: "#202223" }}>
        <div style={{ maxWidth: "600px", margin: "2rem auto", background: "#fff", padding: "2rem", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: "1.25rem", color: "#d72c0d", margin: "0 0 1rem 0" }}>RestockPing Notification</h2>
          <p style={{ margin: "0 0 1rem 0", fontWeight: 500 }}>{errorMessage}</p>
          {errorDetails && (
            <pre style={{ background: "#f1f2f3", padding: "1rem", borderRadius: "4px", fontSize: "0.85rem", overflowX: "auto", maxHeight: "250px" }}>
              {errorDetails}
            </pre>
          )}
          <a
            href="/app"
            style={{ display: "inline-block", marginTop: "1rem", padding: "0.5rem 1rem", background: "#008060", color: "#fff", textDecoration: "none", borderRadius: "4px" }}
          >
            Reload Dashboard
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
