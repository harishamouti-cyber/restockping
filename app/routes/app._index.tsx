import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  IndexTable,
  Button,
  Badge,
  EmptyState,
  Banner,
  Box,
} from "@shopify/polaris";
import { ExportIcon, RefreshIcon, PlayIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export interface ReorderItem {
  id: string;
  variantId: string;
  inventoryItemId: string;
  productTitle: string;
  variantTitle: string;
  currentStock: number;
  waitlistCount: number;
  unrealizedDemand: number;
  suggestedReorder: number;
  price: number;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch all pending subscriptions for gross unrealized demand and waitlist aggregation
  const pendingSubscriptions = await db.restockSubscription.findMany({
    where: { shop, status: "PENDING" },
  });

  const convertedCount = await db.restockSubscription.count({
    where: { shop, status: "CONVERTED" },
  });

  const dispatchedCount = await db.restockSubscription.count({
    where: { shop, status: "DISPATCHED" },
  });

  // Calculate gross unrealized demand: sum(pending * priceSnapshot)
  const grossUnrealizedDemand = pendingSubscriptions.reduce(
    (sum, sub) => sum + (sub.priceSnapshot || 0),
    0
  );

  const totalWaitlistSubscribers = pendingSubscriptions.length;

  // 2. Aggregate waitlist by variantId / inventoryItemId
  const variantMap = new Map<
    string,
    {
      variantId: string;
      inventoryItemId: string;
      productTitle: string;
      variantTitle: string;
      waitlistCount: number;
      price: number;
    }
  >();

  for (const sub of pendingSubscriptions) {
    const key = sub.variantId;
    const existing = variantMap.get(key);
    if (existing) {
      existing.waitlistCount += 1;
    } else {
      variantMap.set(key, {
        variantId: sub.variantId,
        inventoryItemId: sub.inventoryItemId,
        productTitle: sub.productTitle,
        variantTitle: sub.variantTitle,
        waitlistCount: 1,
        price: sub.priceSnapshot || 0,
      });
    }
  }

  // 3. For mapped items, query live Shopify GraphQL inventory level if available
  const reorderList: ReorderItem[] = [];

  for (const [variantId, item] of variantMap.entries()) {
    let currentStock = 0;

    // Fetch live inventory from Shopify Admin GraphQL API
    try {
      const gid = variantId.startsWith("gid://shopify/ProductVariant/")
        ? variantId
        : `gid://shopify/ProductVariant/${variantId}`;

      const response = await admin.graphql(
        `#graphql
        query getVariantInventory($id: ID!) {
          productVariant(id: $id) {
            inventoryQuantity
          }
        }`,
        { variables: { id: gid } }
      );
      const resJson = await response.json();
      currentStock = resJson.data?.productVariant?.inventoryQuantity ?? 0;
    } catch {
      // In local dev without live store connection, stock defaults to 0
      currentStock = 0;
    }

    const suggestedReorder = Math.max(Math.round(item.waitlistCount * 1.5), 20);
    const unrealizedDemand = item.waitlistCount * item.price;

    reorderList.push({
      id: variantId,
      variantId,
      inventoryItemId: item.inventoryItemId,
      productTitle: item.productTitle,
      variantTitle: item.variantTitle,
      currentStock,
      waitlistCount: item.waitlistCount,
      unrealizedDemand,
      suggestedReorder,
      price: item.price,
    });
  }

  // Sort descending by unrealized demand
  reorderList.sort((a, b) => b.unrealizedDemand - a.unrealizedDemand);

  return json({
    shop,
    metrics: {
      totalWaitlistSubscribers,
      grossUnrealizedDemand,
      convertedCount,
      dispatchedCount,
    },
    reorderList,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "export_csv") {
    // Generate CSV for supplier purchase order reordering
    const pendingSubs = await db.restockSubscription.findMany({
      where: { shop: session.shop, status: "PENDING" },
    });

    const grouped = new Map<string, { productTitle: string; variantTitle: string; count: number; price: number }>();
    for (const sub of pendingSubs) {
      const key = `${sub.productTitle} - ${sub.variantTitle}`;
      const curr = grouped.get(key) || {
        productTitle: sub.productTitle,
        variantTitle: sub.variantTitle,
        count: 0,
        price: sub.priceSnapshot,
      };
      curr.count += 1;
      grouped.set(key, curr);
    }

    const headers = ["Product Title", "Variant Title", "Pending Waitlist Count", "Unit Price", "Gross Unrealized Demand", "Suggested Reorder Qty"];
    const rows: string[] = [headers.join(",")];

    for (const item of grouped.values()) {
      const suggested = Math.max(Math.round(item.count * 1.5), 20);
      const row = [
        `"${item.productTitle.replace(/"/g, '""')}"`,
        `"${item.variantTitle.replace(/"/g, '""')}"`,
        item.count,
        item.price.toFixed(2),
        (item.count * item.price).toFixed(2),
        suggested,
      ];
      rows.push(row.join(","));
    }

    const csvContent = rows.join("\n");
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="restockping_supplier_reorder_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  return json({ ok: true });
}

export default function Dashboard() {
  const { metrics, reorderList } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  function handleCsvExport() {
    submit({ intent: "export_csv" }, { method: "post" });
  }

  return (
    <Page
      title="RestockPing Executive Demand Hub"
      subtitle="Real-time back-in-stock waitlist aggregation and supplier replenishment intelligence"
      compactTitle
      primaryAction={{
        content: "Export Supplier Reorder CSV",
        icon: ExportIcon,
        onAction: handleCsvExport,
        disabled: reorderList.length === 0,
      }}
      secondaryActions={[
        {
          content: "Simulate FIFO Dispatch",
          icon: PlayIcon,
          url: "/app/simulation",
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Banner with FIFO Anti-Burnout Engine Status */}
        <Banner
          title="FIFO Anti-Burnout Drip Engine Active"
          tone="info"
        >
          <p>
            When sold-out inventory levels are replenished via Shopify Webhooks, RestockPing automatically calculates safe dispatch cohorts (default 2.5x restock quantity) to prevent site-crashing flash run-outs.
          </p>
        </Banner>

        {/* Executive Metric Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Gross Unrealized Demand
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="headingXl">
                    ${metrics.grossUnrealizedDemand.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                  <Badge tone={metrics.grossUnrealizedDemand > 0 ? "success" : undefined}>
                    {metrics.grossUnrealizedDemand > 0 ? "Pending Revenue" : "Zero Backlog"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodyXs" tone="subdued">
                  Dollar volume currently waiting across all out-of-stock items
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Total Waitlist Subscribers
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="headingXl">
                    {metrics.totalWaitlistSubscribers.toLocaleString()}
                  </Text>
                  <Badge tone={metrics.totalWaitlistSubscribers > 0 ? "info" : undefined}>
                    {metrics.totalWaitlistSubscribers > 0 ? "Active Queue" : "No Waitlists"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodyXs" tone="subdued">
                  Unique customer requests awaiting variant restock alerts
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Recovered Conversions
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="headingXl">
                    {metrics.convertedCount.toLocaleString()}
                  </Text>
                  <Badge tone="success">
                    {`${metrics.dispatchedCount} Dispatched`}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodyXs" tone="subdued">
                  Completed orders originating from 1-click cart permalinks
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Supplier Reorder Intelligence Table */}
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Supplier Reorder Intelligence
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Recommended replenishment quantities based on active waitlist demand (Formula: max(Waitlist × 1.5, 20 units))
                    </Text>
                  </BlockStack>
                  <Button
                    icon={ExportIcon}
                    onClick={handleCsvExport}
                    disabled={reorderList.length === 0}
                  >
                    Download CSV
                  </Button>
                </InlineStack>
              </Box>

              {reorderList.length === 0 ? (
                <EmptyState
                  heading="No Out-of-Stock Demand Backlog"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    All items are in stock or no customers have requested restock notifications yet. Add the RestockPing App Block to your Online Store 2.0 product template to start capturing demand.
                  </p>
                  <Box paddingBlockStart="300">
                    <InlineStack gap="300" align="center">
                      <Button variant="primary" url="/app/simulation">
                        Simulate Restock In Test Lab
                      </Button>
                      <Button url="/app/settings">
                        Configure Settings
                      </Button>
                    </InlineStack>
                  </Box>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{
                    singular: "reorder recommendation",
                    plural: "reorder recommendations",
                  }}
                  itemCount={reorderList.length}
                  headings={[
                    { title: "Product / Variant Title" },
                    { title: "Current Stock", alignment: "end" },
                    { title: "Active Waitlist", alignment: "end" },
                    { title: "Unrealized Demand", alignment: "end" },
                    { title: "Suggested PO Reorder", alignment: "end" },
                  ]}
                  selectable={false}
                >
                  {reorderList.map((item, index) => (
                    <IndexTable.Row id={item.id} key={item.id} position={index}>
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {item.productTitle}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {item.variantTitle}
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <Badge tone={item.currentStock > 0 ? "info" : "critical"}>
                            {`${item.currentStock} units`}
                          </Badge>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <Text as="span" variant="bodyMd" fontWeight="bold">
                            {item.waitlistCount}
                          </Text>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <Text as="span" variant="bodyMd" tone="success" fontWeight="bold">
                            ${item.unrealizedDemand.toFixed(2)}
                          </Text>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <Badge tone="attention">
                            {`${item.suggestedReorder} units`}
                          </Badge>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
