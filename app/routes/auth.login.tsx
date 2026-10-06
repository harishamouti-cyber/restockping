import { useState } from "react";
import { json, type ActionFunctionArgs, type HeadersFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useRouteError } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
  BlockStack,
  Box,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import { login } from "../shopify.server";
import { LoginErrorType, boundary } from "@shopify/shopify-app-remix/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const loginErrors = await login(request);
  const errors: { shop?: string } = {};

  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    errors.shop = "Please enter your shop domain to log in";
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    errors.shop = "Please enter a valid shop domain to log in";
  }

  return json({ errors });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const loginErrors = await login(request);
  const errors: { shop?: string } = {};

  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    errors.shop = "Please enter your shop domain to log in";
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    errors.shop = "Please enter a valid shop domain to log in";
  }

  return json({ errors });
};

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const errors = actionData?.errors || loaderData?.errors || {};

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Page narrowWidth>
        <Box paddingBlockStart="800">
          <Card>
            <Form method="post">
              <FormLayout>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    Log in to RestockPing
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Enter your Shopify store domain to access the executive demand dashboard.
                  </Text>
                </BlockStack>
                <TextField
                  type="text"
                  name="shop"
                  label="Shop domain"
                  helpText="e.g. your-store.myshopify.com"
                  value={shop}
                  onChange={setShop}
                  autoComplete="on"
                  error={errors.shop}
                />
                <Button submit variant="primary">
                  Log in
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Box>
      </Page>
    </PolarisAppProvider>
  );
}
