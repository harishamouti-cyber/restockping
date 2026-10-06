import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const ErrorBoundary = boundary.error;
