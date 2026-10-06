import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Page, Card, Text, BlockStack, AppProvider, Button, Box } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { boundary } from "@shopify/shopify-app-remix/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // When loaded inside Shopify Admin or with a shop parameter, redirect directly to embedded /app
  if (shop) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
}

export default function Index() {
  return (
    <AppProvider i18n={enTranslations}>
      <Page title="RestockPing for Shopify" narrowWidth>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              RestockPing Back-in-Stock & Unrealized Revenue Engine
            </Text>
            <Text as="p" variant="bodyMd">
              RestockPing is an embedded Shopify Online Store 2.0 application. To access your executive dashboard, please launch the app directly from your Shopify Admin.
            </Text>
            <Box paddingBlockStart="200">
              <Button variant="primary" url="/privacy">
                View Privacy Policy
              </Button>
            </Box>
          </BlockStack>
        </Card>
      </Page>
    </AppProvider>
  );
}
