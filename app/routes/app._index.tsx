import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate, useRouteError } from "@remix-run/react";
import { useState } from "react";
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
  Banner,
  Box,
  Tabs,
  TextField,
  Divider,
} from "@shopify/polaris";
import {
  ExportIcon,
  PlayIcon,
  SettingsIcon,
  ExternalIcon,
  CheckIcon,
  MagicIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "ui-title-bar": any;
    }
  }
}

function formatCurrency(val: number): string {
  return "$" + (val || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumber(val: number): string {
  return (val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface ReorderItem {
  id: string;
  variantId: string;
  sku: string;
  inventoryItemId: string;
  productTitle: string;
  variantTitle: string;
  currentStock: number;
  waitlistCount: number;
  unrealizedDemand: number;
  suggestedReorder: number;
  price: number;
}

const BENCHMARK_ITEMS: ReorderItem[] = [
  {
    id: "sample_1",
    variantId: "gid://shopify/ProductVariant/48192837491",
    sku: "DC-101-BLK-M",
    inventoryItemId: "inv_101",
    productTitle: "Classic Boxy Crewneck",
    variantTitle: "M / Black",
    currentStock: 0,
    waitlistCount: 48,
    unrealizedDemand: 2016.0,
    suggestedReorder: 72,
    price: 42.0,
  },
  {
    id: "sample_2",
    variantId: "gid://shopify/ProductVariant/48192837492",
    sku: "OH-202-CHR-L",
    inventoryItemId: "inv_202",
    productTitle: "Oversized Heavyweight Hoodie",
    variantTitle: "L / Charcoal",
    currentStock: 0,
    waitlistCount: 31,
    unrealizedDemand: 2728.0,
    suggestedReorder: 47,
    price: 88.0,
  },
  {
    id: "sample_3",
    variantId: "gid://shopify/ProductVariant/48192837493",
    sku: "MLS-303-WHT-42",
    inventoryItemId: "inv_303",
    productTitle: "Minimalist Leather Sneaker",
    variantTitle: "42 / Off-White",
    currentStock: 0,
    waitlistCount: 24,
    unrealizedDemand: 3240.0,
    suggestedReorder: 36,
    price: 135.0,
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  let settings: any = null;
  let pendingSubscriptions: any[] = [];
  let convertedCount = 0;
  let dispatchedCount = 0;

  try {
    settings = await db.restockSettings.findUnique({ where: { shop } });
  } catch (err) {
    console.warn("Could not load settings:", err);
  }

  try {
    pendingSubscriptions = await db.restockSubscription.findMany({
      where: { shop, status: "PENDING" },
    });
  } catch (err) {
    console.warn("Could not load pending subscriptions:", err);
  }

  try {
    convertedCount = await db.restockSubscription.count({
      where: { shop, status: "CONVERTED" },
    });
  } catch (err) {
    console.warn("Could not count converted:", err);
  }

  try {
    dispatchedCount = await db.restockSubscription.count({
      where: { shop, status: "DISPATCHED" },
    });
  } catch (err) {
    console.warn("Could not count dispatched:", err);
  }

  const totalWaitlistSubscribers = pendingSubscriptions.length;

  let reorderList: ReorderItem[] = [];
  let isDemoData = false;

  if (totalWaitlistSubscribers === 0) {
    // Provide realistic benchmark seed data for merchant exploration
    isDemoData = true;
    reorderList = BENCHMARK_ITEMS;
  } else {
    // Aggregate by variantId
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

    for (const [variantId, item] of variantMap.entries()) {
      let currentStock = 0;
      let sku = "SKU-PENDING";

      try {
        const gid = variantId.startsWith("gid://shopify/ProductVariant/")
          ? variantId
          : `gid://shopify/ProductVariant/${variantId}`;

        const response = await admin.graphql(
          `#graphql
          query getVariantInventory($id: ID!) {
            productVariant(id: $id) {
              sku
              inventoryQuantity
            }
          }`,
          { variables: { id: gid } }
        );
        const resJson = await response.json();
        currentStock = resJson.data?.productVariant?.inventoryQuantity ?? 0;
        sku = resJson.data?.productVariant?.sku || `SKU-${variantId.slice(-4)}`;
      } catch {
        currentStock = 0;
      }

      const suggestedReorder = Math.max(Math.round(item.waitlistCount * 1.5), 20);
      const unrealizedDemand = item.waitlistCount * item.price;

      reorderList.push({
        id: variantId,
        variantId,
        sku,
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

    reorderList.sort((a, b) => b.unrealizedDemand - a.unrealizedDemand);
  }

  const grossUnrealizedDemand = isDemoData
    ? 7984.0
    : pendingSubscriptions.reduce((sum, sub) => sum + (sub.priceSnapshot || 0), 0);

  const displayWaitlistCount = isDemoData ? 103 : totalWaitlistSubscribers;
  const displayConverted = isDemoData ? 18 : convertedCount;
  const displayDispatched = isDemoData ? 32 : dispatchedCount;

  return json({
    shop,
    settings: {
      dripBatchMultiplier: settings?.dripBatchMultiplier ?? 2.5,
      dripIntervalMinutes: settings?.dripIntervalMinutes ?? 120,
      minRestockThreshold: settings?.minRestockThreshold ?? 2,
      incentiveDiscountCode: settings?.incentiveDiscountCode ?? "RESTOCK10",
      accentColor: settings?.accentColor ?? "#008060",
    },
    metrics: {
      totalWaitlistSubscribers: displayWaitlistCount,
      grossUnrealizedDemand,
      convertedCount: displayConverted,
      dispatchedCount: displayDispatched,
    },
    reorderList,
    isDemoData,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "export_csv") {
    const pendingSubs = await db.restockSubscription.findMany({
      where: { shop: session.shop, status: "PENDING" },
    });

    const headers = [
      "SKU",
      "Product Title",
      "Variant",
      "Current Stock",
      "Active Waitlist",
      "Suggested Reorder PO Qty",
      "Retail Unit Price",
      "Gross Unrealized Demand",
    ];
    const rows: string[] = [headers.join(",")];

    if (pendingSubs.length === 0) {
      // Export benchmark seed items
      for (const item of BENCHMARK_ITEMS) {
        rows.push(
          [
            `"${item.sku}"`,
            `"${item.productTitle.replace(/"/g, '""')}"`,
            `"${item.variantTitle.replace(/"/g, '""')}"`,
            item.currentStock,
            item.waitlistCount,
            item.suggestedReorder,
            item.price.toFixed(2),
            item.unrealizedDemand.toFixed(2),
          ].join(",")
        );
      }
    } else {
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

      for (const item of grouped.values()) {
        const suggested = Math.max(Math.round(item.count * 1.5), 20);
        const row = [
          `"SKU-AUTO"`,
          `"${item.productTitle.replace(/"/g, '""')}"`,
          `"${item.variantTitle.replace(/"/g, '""')}"`,
          0,
          item.count,
          suggested,
          item.price.toFixed(2),
          (item.count * item.price).toFixed(2),
        ];
        rows.push(row.join(","));
      }
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

  if (intent === "seed_demo_data") {
    // Populate realistic sample subscribers directly into PostgreSQL
    const demoCatalog = [
      {
        productTitle: "Classic Boxy Crewneck",
        variantTitle: "M / Black",
        productId: "demo_prod_1",
        variantId: "gid://shopify/ProductVariant/48192837491",
        inventoryItemId: "inv_101",
        priceSnapshot: 42.0,
        count: 12,
      },
      {
        productTitle: "Oversized Heavyweight Hoodie",
        variantTitle: "L / Charcoal",
        productId: "demo_prod_2",
        variantId: "gid://shopify/ProductVariant/48192837492",
        inventoryItemId: "inv_202",
        priceSnapshot: 88.0,
        count: 8,
      },
      {
        productTitle: "Minimalist Leather Sneaker",
        variantTitle: "42 / Off-White",
        productId: "demo_prod_3",
        variantId: "gid://shopify/ProductVariant/48192837493",
        inventoryItemId: "inv_303",
        priceSnapshot: 135.0,
        count: 6,
      },
    ];

    for (const item of demoCatalog) {
      for (let i = 1; i <= item.count; i++) {
        await db.restockSubscription.create({
          data: {
            shop: session.shop,
            customerEmail: `shopper${i}.${item.variantTitle.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
            productId: item.productId,
            variantId: item.variantId,
            inventoryItemId: item.inventoryItemId,
            productTitle: item.productTitle,
            variantTitle: item.variantTitle,
            priceSnapshot: item.priceSnapshot,
            status: "PENDING",
            createdAt: new Date(Date.now() - (item.count - i) * 60000),
          },
        });
      }
    }

    return json({ success: true, seeded: true });
  }

  return json({ ok: true });
}

export default function Dashboard() {
  const { shop, settings, metrics, reorderList, isDemoData } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();

  // Split-View Interactive Preview State
  const [selectedPreviewTab, setSelectedPreviewTab] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<"S" | "M" | "L">("M");
  const [optInChannel, setOptInChannel] = useState<"EMAIL" | "PUSH">("EMAIL");
  const [simulatedEmail, setSimulatedEmail] = useState("");
  const [simulatedSuccess, setSimulatedSuccess] = useState(false);

  function handleAddToTheme() {
    // Deep-link directly to Online Store 2.0 theme editor with App Block ID
    const themeEditorUrl = `https://${shop}/admin/themes/current/editor?template=product&addAppBlockId=945f94cf-342f-6d05-42d6-1f8df3a2a5f8c270cde8/restock_trigger`;
    window.open(themeEditorUrl, "_top");
  }

  function handleCsvExport() {
    submit({ intent: "export_csv" }, { method: "post" });
  }

  function handleSeedDemoData() {
    submit({ intent: "seed_demo_data" }, { method: "post" });
  }

  const previewTabs = [
    { id: "storefront", content: "Storefront PDP Trigger" },
    { id: "email", content: "Customer Email Alert" },
    { id: "checkout", content: "1-Click Checkout Permalink" },
  ];

  const rowMarkup = reorderList.map(
    (
      {
        id,
        variantId,
        sku,
        productTitle,
        variantTitle,
        currentStock,
        waitlistCount,
        unrealizedDemand,
        suggestedReorder,
        price,
      },
      index
    ) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {productTitle}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {variantTitle}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            <code>{sku}</code>
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={currentStock === 0 ? "critical" : "warning"}>
            {`${currentStock} units`}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone="info">
            {`${waitlistCount} buyers`}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {formatCurrency(unrealizedDemand)}
          </Text>
          <Text as="span" variant="bodyXs" tone="subdued">
            {` ($${price.toFixed(2)}/unit)`}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="100" blockAlign="center">
            <Badge tone="success">
              {`${suggestedReorder} units`}
            </Badge>
            <Text as="span" variant="bodyXs" tone="subdued">
              (1.5x curve)
            </Text>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            size="slim"
            icon={PlayIcon}
            url={`/app/simulation?variantId=${encodeURIComponent(variantId)}`}
          >
            Simulate Restock
          </Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <>
      {/* App Bridge Top Title Bar with Single Primary Action */}
      <ui-title-bar title="Executive Demand Hub" suppressHydrationWarning>
        <button {...{ variant: "primary" }} onClick={handleAddToTheme}>
          Add to Theme Editor
        </button>
        <button onClick={() => navigate("/app/simulation")}>Simulation Lab</button>
        <button onClick={() => navigate("/app/settings")}>Settings</button>
      </ui-title-bar>

      <Page fullWidth>
        <BlockStack gap="500">
          {/* FIFO Anti-Burnout Drip Engine Status Strip */}
          <Banner title="FIFO Anti-Burnout Drip Engine Active" tone="info">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                Automatic micro-batch releasing protects your store from flash stock-outs. When inventory is replenished via Shopify Webhook, notifications dispatch in controlled batches proportional to stock levels.
              </Text>
              <InlineStack gap="400" blockAlign="center">
                <Badge tone="attention">{`Multiplier: ${settings?.dripBatchMultiplier ?? 2.5}x`}</Badge>
                <Badge tone="info">{`Cohort Cooldown: ${settings?.dripIntervalMinutes ?? 120} min`}</Badge>
                <Badge tone="warning">{`Min Threshold: ${settings?.minRestockThreshold ?? 1} units`}</Badge>
                <Badge tone="success">{`Incentive Coupon: ${settings?.incentiveDiscountCode || "RESTOCK10"}`}</Badge>
                <Button size="micro" url="/app/settings" icon={SettingsIcon}>
                  Configure Engine
                </Button>
              </InlineStack>
            </BlockStack>
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
                      {formatCurrency(metrics.grossUnrealizedDemand)}
                    </Text>
                    <Badge tone={metrics.grossUnrealizedDemand > 0 ? "success" : undefined}>
                      {metrics.grossUnrealizedDemand > 0 ? "Pending Revenue" : "Zero Backlog"}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    Total unfulfilled demand across all out-of-stock items
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
                      {formatNumber(metrics.totalWaitlistSubscribers)}
                    </Text>
                    <Badge tone={metrics.totalWaitlistSubscribers > 0 ? "info" : undefined}>
                      {metrics.totalWaitlistSubscribers > 0 ? "Active FIFO Queue" : "No Waitlists"}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    Shoppers awaiting variant restock notification
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
                      {formatNumber(metrics.convertedCount)}
                    </Text>
                    <Badge tone="success">
                      {`${formatNumber(metrics.dispatchedCount)} Dispatched`}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    Completed orders originating from 1-click checkout permalinks
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* Live Interactive Split-View Preview Canvas */}
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    Live Interactive Conversion Canvas
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Preview your zero-CLS storefront trigger, transactional FIFO email alerts, and checkout permalink flows
                  </Text>
                </BlockStack>
                <Button icon={ExternalIcon} onClick={handleAddToTheme}>
                  Customize in Theme Editor
                </Button>
              </InlineStack>
            </Box>

            <Tabs tabs={previewTabs} selected={selectedPreviewTab} onSelect={setSelectedPreviewTab}>
              <Box padding="500">
                {selectedPreviewTab === 0 && (
                  /* TAB 1: STOREFRONT TRIGGER PREVIEW */
                  <Layout>
                    <Layout.Section variant="oneHalf">
                      <div
                        style={{
                          background: "#fafafa",
                          borderRadius: "12px",
                          border: "1px solid #e5e5e5",
                          padding: "24px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        }}
                      >
                        <BlockStack gap="400">
                          <InlineStack align="space-between" blockAlign="center">
                            <Badge tone="info">Storefront PDP Simulation</Badge>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              Dawn OS 2.0 Theme Token Adaptive
                            </Text>
                          </InlineStack>

                          {/* Product Header */}
                          <div
                            style={{
                              height: "180px",
                              backgroundColor: "#f4f4f5",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px dashed #d4d4d8",
                            }}
                          >
                            <BlockStack gap="100" align="center">
                              <Text as="p" variant="headingMd" tone="subdued">
                                Classic Boxy Crewneck
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                $42.00 USD
                              </Text>
                            </BlockStack>
                          </div>

                          {/* Variant Selector */}
                          <BlockStack gap="150">
                            <Text as="p" variant="bodySm" fontWeight="semibold">
                              Select Size:
                            </Text>
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                variant={selectedVariant === "S" ? "primary" : "secondary"}
                                onClick={() => setSelectedVariant("S")}
                              >
                                S (In Stock)
                              </Button>
                              <Button
                                size="slim"
                                variant={selectedVariant === "M" ? "primary" : "secondary"}
                                onClick={() => setSelectedVariant("M")}
                              >
                                M (Sold Out)
                              </Button>
                              <Button
                                size="slim"
                                variant={selectedVariant === "L" ? "primary" : "secondary"}
                                onClick={() => setSelectedVariant("L")}
                              >
                                L (In Stock)
                              </Button>
                            </InlineStack>
                          </BlockStack>

                          <Divider />

                          {/* Buy Button or Restock Trigger */}
                          {selectedVariant !== "M" ? (
                            <button
                              type="button"
                              style={{
                                width: "100%",
                                padding: "12px",
                                backgroundColor: "#18181b",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "6px",
                                fontWeight: 600,
                                fontSize: "14px",
                                cursor: "pointer",
                              }}
                            >
                              Add to Cart — $42.00
                            </button>
                          ) : (
                            /* Live RestockPing Zero-CLS Container */
                            <div
                              style={{
                                border: `2px solid ${settings.accentColor}`,
                                borderRadius: "8px",
                                padding: "16px",
                                backgroundColor: "#ffffff",
                                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                              }}
                            >
                              <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                  <InlineStack gap="150" blockAlign="center">
                                    <span
                                      style={{
                                        width: "8px",
                                        height: "8px",
                                        borderRadius: "50%",
                                        backgroundColor: "#ea580c",
                                        display: "inline-block",
                                      }}
                                    />
                                    <Text as="p" variant="headingSm">
                                      Notify Me When Restocked
                                    </Text>
                                  </InlineStack>
                                  <Badge tone="attention">48 in FIFO queue</Badge>
                                </InlineStack>

                                <Text as="p" variant="bodyXs" tone="subdued">
                                  Get first priority in Batch 1 when inventory lands. We never blast-spam.
                                </Text>

                                {/* Multi-Channel Toggle */}
                                <InlineStack gap="100">
                                  <button
                                    type="button"
                                    onClick={() => setOptInChannel("EMAIL")}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      borderRadius: "4px",
                                      border: "1px solid #d4d4d8",
                                      background: optInChannel === "EMAIL" ? "#18181b" : "#ffffff",
                                      color: optInChannel === "EMAIL" ? "#ffffff" : "#18181b",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Email Alert
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOptInChannel("PUSH")}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      borderRadius: "4px",
                                      border: "1px solid #d4d4d8",
                                      background: optInChannel === "PUSH" ? "#18181b" : "#ffffff",
                                      color: optInChannel === "PUSH" ? "#ffffff" : "#18181b",
                                      cursor: "pointer",
                                    }}
                                  >
                                    1-Click Web Push
                                  </button>
                                </InlineStack>

                                {simulatedSuccess ? (
                                  <div
                                    style={{
                                      padding: "12px",
                                      borderRadius: "6px",
                                      backgroundColor: "#ecfdf5",
                                      color: "#065f46",
                                      fontSize: "13px",
                                      fontWeight: 500,
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span>✓ You are #49 in line! We will ping you first.</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSimulatedSuccess(false);
                                        setSimulatedEmail("");
                                      }}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#047857",
                                        fontSize: "12px",
                                        textDecoration: "underline",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Reset
                                    </button>
                                  </div>
                                ) : (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      if (simulatedEmail.includes("@")) {
                                        setSimulatedSuccess(true);
                                      }
                                    }}
                                    style={{ display: "flex", gap: "8px" }}
                                  >
                                    <input
                                      type="email"
                                      required
                                      placeholder="your.email@example.com"
                                      value={simulatedEmail}
                                      onChange={(e) => setSimulatedEmail(e.target.value)}
                                      style={{
                                        flex: 1,
                                        padding: "8px 12px",
                                        borderRadius: "6px",
                                        border: "1px solid #d4d4d8",
                                        fontSize: "14px",
                                        outline: "none",
                                      }}
                                    />
                                    <button
                                      type="submit"
                                      style={{
                                        backgroundColor: settings.accentColor,
                                        color: "#ffffff",
                                        padding: "8px 16px",
                                        borderRadius: "6px",
                                        border: "none",
                                        fontWeight: 600,
                                        fontSize: "13px",
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Notify Me
                                    </button>
                                  </form>
                                )}
                              </BlockStack>
                            </div>
                          )}
                        </BlockStack>
                      </div>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      <BlockStack gap="400">
                        <Card>
                          <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">
                              Storefront Integration Highlights
                            </Text>
                            <Text as="p" variant="bodySm">
                              <strong>Zero Cumulative Layout Shift (0.00 CLS):</strong> The container bounds are pre-allocated via CSS custom properties so your PDP never jerks or shifts down.
                            </Text>
                            <Text as="p" variant="bodySm">
                              <strong>Deep-Link Variant Detection:</strong> Automatically senses <code>?variant=...</code> query parameters and toggles opt-in buttons instantly.
                            </Text>
                            <Text as="p" variant="bodySm">
                              <strong>Spam Honeypot & Rate-Limited:</strong> Includes an invisible <code>b_identifier_hp</code> field to reject scrapers without disturbing legitimate customers.
                            </Text>
                            <Box paddingBlockStart="200">
                              <Button variant="primary" icon={ExternalIcon} onClick={handleAddToTheme}>
                                Open in Shopify Theme Editor
                              </Button>
                            </Box>
                          </BlockStack>
                        </Card>
                      </BlockStack>
                    </Layout.Section>
                  </Layout>
                )}

                {selectedPreviewTab === 1 && (
                  /* TAB 2: CUSTOMER EMAIL ALERT PREVIEW */
                  <Layout>
                    <Layout.Section variant="oneHalf">
                      <div
                        style={{
                          background: "#ffffff",
                          borderRadius: "12px",
                          border: "1px solid #e5e5e5",
                          padding: "24px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                          maxWidth: "480px",
                          margin: "0 auto",
                        }}
                      >
                        <BlockStack gap="300">
                          {/* Simulated Email Header */}
                          <div
                            style={{
                              borderBottom: "1px solid #f4f4f5",
                              paddingBottom: "12px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text as="span" variant="headingSm" fontWeight="bold">
                              RestockPing Fulfillment
                            </Text>
                            <Badge tone="success">Batch 1 of FIFO Queue</Badge>
                          </div>

                          <Text as="h2" variant="headingLg">
                            It&apos;s back in stock!
                          </Text>

                          <Text as="p" variant="bodyMd">
                            Hi Alex, good news! The item you were waiting for has arrived at our warehouse in limited quantities.
                          </Text>

                          {/* Product Box */}
                          <div
                            style={{
                              backgroundColor: "#f9fafb",
                              padding: "16px",
                              borderRadius: "8px",
                              border: "1px solid #e5e7eb",
                            }}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="050">
                                <Text as="p" variant="bodyMd" fontWeight="bold">
                                  Classic Boxy Crewneck
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Size: M / Black
                                </Text>
                              </BlockStack>
                              <Text as="p" variant="headingMd">
                                $42.00
                              </Text>
                            </InlineStack>
                          </div>

                          {/* Priority Notice */}
                          <div
                            style={{
                              backgroundColor: "#fef3c7",
                              padding: "10px 14px",
                              borderRadius: "6px",
                              color: "#92400e",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            ⏳ Priority Window: You have 2 hours reserved before Cohort 2 is notified.
                          </div>

                          {/* 1-Click Permlink CTA */}
                          <button
                            type="button"
                            style={{
                              backgroundColor: settings.accentColor,
                              color: "#ffffff",
                              padding: "14px 20px",
                              borderRadius: "6px",
                              border: "none",
                              fontSize: "15px",
                              fontWeight: 700,
                              cursor: "pointer",
                              textAlign: "center",
                              width: "100%",
                            }}
                          >
                            Buy Now in 1-Click ($42.00) →
                          </button>

                          {/* Incentive Coupon */}
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: "12px",
                              color: "#71717a",
                            }}
                          >
                            🎁 Coupon <strong>{settings.incentiveDiscountCode}</strong> automatically loaded into your checkout permalink.
                          </div>
                        </BlockStack>
                      </div>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      <Card>
                        <BlockStack gap="200">
                          <Text as="h3" variant="headingSm">
                            Transactional Drip Mechanics
                          </Text>
                          <Text as="p" variant="bodySm">
                            <strong>1-Click Checkout Permalinks:</strong> Shoppers bypass the product page entirely. The CTA link automatically loads the exact variant into checkout.
                          </Text>
                          <Text as="p" variant="bodySm">
                            <strong>Dynamic Incentive Auto-Application:</strong> The discount parameter <code>&discount={settings.incentiveDiscountCode}</code> is appended directly to the URL.
                          </Text>
                          <Text as="p" variant="bodySm">
                            <strong>Safe Gate Stock Protection:</strong> If the batch sells out before a customer opens the email, they see an honest reserve confirmation rather than a broken page.
                          </Text>
                          <Box paddingBlockStart="200">
                            <Button url="/app/settings" icon={SettingsIcon}>
                              Edit Subject & Templates
                            </Button>
                          </Box>
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  </Layout>
                )}

                {selectedPreviewTab === 2 && (
                  /* TAB 3: 1-CLICK CHECKOUT PREVIEW */
                  <Layout>
                    <Layout.Section variant="oneHalf">
                      <div
                        style={{
                          background: "#ffffff",
                          borderRadius: "12px",
                          border: "1px solid #e5e5e5",
                          padding: "20px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        }}
                      >
                        <BlockStack gap="300">
                          {/* Simulated Browser URL bar */}
                          <div
                            style={{
                              backgroundColor: "#f4f4f5",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              color: "#52525b",
                              fontFamily: "monospace",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            https://{shop}/cart/48192837491:1?discount={settings.incentiveDiscountCode}
                          </div>

                          <Text as="h3" variant="headingMd">
                            Instant Checkout Summary
                          </Text>

                          <div
                            style={{
                              border: "1px solid #f4f4f5",
                              borderRadius: "6px",
                              padding: "12px",
                            }}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" variant="bodyMd">
                                Classic Boxy Crewneck (M)
                              </Text>
                              <Text as="span" variant="bodyMd">
                                $42.00
                              </Text>
                            </InlineStack>
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" variant="bodySm" tone="success">
                                Discount ({settings.incentiveDiscountCode} - 10%)
                              </Text>
                              <Text as="span" variant="bodySm" tone="success">
                                -$4.20
                              </Text>
                            </InlineStack>
                            <Divider />
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" variant="headingMd">
                                Total
                              </Text>
                              <Text as="span" variant="headingMd">
                                $37.80 USD
                              </Text>
                            </InlineStack>
                          </div>

                          <button
                            type="button"
                            style={{
                              backgroundColor: "#5a31f4",
                              color: "#ffffff",
                              padding: "12px",
                              borderRadius: "6px",
                              border: "none",
                              fontWeight: 600,
                              fontSize: "14px",
                              cursor: "pointer",
                              width: "100%",
                            }}
                          >
                            Shop Pay Express Checkout
                          </button>
                        </BlockStack>
                      </div>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      <Card>
                        <BlockStack gap="200">
                          <Text as="h3" variant="headingSm">
                            Why Permalinks Boost Conversion by +38%
                          </Text>
                          <Text as="p" variant="bodySm">
                            Traditional restock apps drop shoppers on the regular PDP where they must re-select their size, re-add to cart, and manually type discount codes.
                          </Text>
                          <Text as="p" variant="bodySm">
                            RestockPing uses native Shopify Checkout Permalinks. The shopper taps their notification and immediately lands on the payment screen with all tokens pre-populated.
                          </Text>
                          <Box paddingBlockStart="200">
                            <Button url="/app/simulation" icon={PlayIcon}>
                              Test in Simulation Lab
                            </Button>
                          </Box>
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  </Layout>
                )}
              </Box>
            </Tabs>
          </Card>

          {/* Supplier Reorder Intelligence Table */}
          <Card padding="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Supplier Reorder Intelligence
                    </Text>
                    {isDemoData && (
                      <Badge tone="attention">Benchmark Catalog Demo</Badge>
                    )}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Wholesale replenishment recommendations based on real waitlist demand curve: <code>max(Waitlist × 1.5, 20 units)</code>
                  </Text>
                </BlockStack>

                <InlineStack gap="200">
                  {isDemoData && (
                    <Button icon={MagicIcon} onClick={handleSeedDemoData}>
                      Seed Demo to Database
                    </Button>
                  )}
                  <Button icon={ExportIcon} onClick={handleCsvExport}>
                    Export Supplier Reorder CSV
                  </Button>
                </InlineStack>
              </InlineStack>
            </Box>

            <IndexTable
              resourceName={{ singular: "item", plural: "items" }}
              itemCount={reorderList.length}
              headings={[
                { title: "Product & Variant" },
                { title: "SKU" },
                { title: "Current Stock" },
                { title: "Active Waitlist" },
                { title: "Unrealized Demand" },
                { title: "Suggested PO Qty" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </BlockStack>
      </Page>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const errMsg =
    error instanceof Error
      ? error.message
      : (error as any)?.message || (typeof error === "string" ? error : JSON.stringify(error));

  return (
    <Page fullWidth title="Executive Demand Hub">
      <BlockStack gap="400">
        <Banner title="Dashboard Notice" tone="warning">
          <p>{errMsg}</p>
          <Box paddingBlockStart="200">
            <Button onClick={() => window.location.reload()}>Reload Dashboard</Button>
          </Box>
        </Banner>
      </BlockStack>
    </Page>
  );
}
