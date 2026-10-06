import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useRouteError } from "@remix-run/react";
import { authenticate, login } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/login") || url.pathname.includes("/auth/login")) {
    return login(request);
  }
  await authenticate.admin(request);
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

