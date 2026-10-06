import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

export const BILLING_CONFIG = {
  "RestockPing Pro": {
    amount: 9.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 7,
  },
} as const;

export const MONTHLY_PLAN = "RestockPing Pro";

const resolvedAppUrl =
  process.env.SHOPIFY_APP_URL ||
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://restockping.vercel.app");

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "bb3d7694aa9a53e849de71dc2f2806fa",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October24,
  scopes: process.env.SCOPES?.split(",") || [
    "read_products",
    "write_products",
    "read_inventory",
    "write_inventory",
    "read_themes",
  ],
  appUrl: resolvedAppUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN]: {
      lineItems: [
        {
          amount: 9.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 7,
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  customShopDomains: process.env.SHOP_CUSTOM_DOMAIN
    ? [process.env.SHOP_CUSTOM_DOMAIN]
    : undefined,
});

export const requireAppSubscription = async (request: Request) => {
  const { billing, session } = await authenticate.admin(request);
  const isTest =
    process.env.NODE_ENV !== "production" ||
    session.shop.includes("myshopify.com") ||
    session.shop.includes("test");

  await billing.require({
    plans: [MONTHLY_PLAN],
    isTest,
    onFailure: async () =>
      billing.request({
        plan: MONTHLY_PLAN,
        isTest,
      }),
  });
};

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
