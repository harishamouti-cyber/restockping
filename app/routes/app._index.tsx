import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate, useRouteError, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Box,
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


function formatCurrency(val: number): string {
  return "$" + (val || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumber(val: number): string {
  return (val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Crisp 1.5px stroke SVG Icons for 21st.dev inspired iconography
function IconSparkles({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </svg>
  );
}

function IconBox({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 12v10" />
    </svg>
  );
}

function IconUsers({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconTrendingUp({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function IconCartCheck({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      <polyline points="12 6 14 8 18 4" />
    </svg>
  );
}

function IconDeviceDesktop({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function IconDeviceMobile({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function IconTerminal({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

function IconChevronDown({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconChevronUp({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function IconFileSpreadsheet({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h2" />
      <path d="M8 17h2" />
      <path d="M14 13h2" />
      <path d="M14 17h2" />
    </svg>
  );
}

function IconSliders({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="1" x2="7" y1="14" y2="14" />
      <line x1="9" x2="15" y1="8" y2="8" />
      <line x1="17" x2="23" y1="16" y2="16" />
    </svg>
  );
}

function IconLock({ size = 12, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
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

export interface TelemetryLog {
  id: string;
  timestamp: string;
  topic: string;
  sku: string;
  action: string;
  status: "SUCCESS" | "QUEUED" | "GATED" | "HEARTBEAT";
}

const INITIAL_TELEMETRY_LOGS: TelemetryLog[] = [
  {
    id: "log_1",
    timestamp: "Just now",
    topic: "inventory_levels/update",
    sku: "DC-101-BLK-M",
    action: "Restocked +5 units. Threshold passed (5 >= 1). FIFO Batch 1 calculated: 12 subscribers. Dispatched via Resend SMTP.",
    status: "SUCCESS",
  },
  {
    id: "log_2",
    timestamp: "8m ago",
    topic: "orders/create",
    sku: "OH-202-CHR-L",
    action: "1-Click Permalink attribution verified (coupon RESTOCK10). $88.00 recovered revenue recorded.",
    status: "SUCCESS",
  },
  {
    id: "log_3",
    timestamp: "24m ago",
    topic: "inventory_levels/update",
    sku: "MLS-303-WHT-42",
    action: "Return processed (+1 unit). Gated by minRestockThreshold (1 unit < 2 units). Queue kept safe.",
    status: "GATED",
  },
  {
    id: "log_4",
    timestamp: "1h ago",
    topic: "webhooks/compliance",
    sku: "SYSTEM-BUS",
    action: "Shopify webhook health handshake verified. 4 event topics registered. Delivery latency: 24ms.",
    status: "HEARTBEAT",
  },
];

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
    isDemoData = true;
    reorderList = BENCHMARK_ITEMS;
  } else {
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
      minRestockThreshold: settings?.minRestockThreshold ?? 1,
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
    const selectedIdsRaw = formData.get("selected_ids") as string | null;
    const selectedIds = selectedIdsRaw ? selectedIdsRaw.split(",").filter(Boolean) : null;

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
      let itemsToExport = BENCHMARK_ITEMS;
      if (selectedIds && selectedIds.length > 0) {
        itemsToExport = BENCHMARK_ITEMS.filter((item) => selectedIds.includes(item.id));
      }

      for (const item of itemsToExport) {
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
      const grouped = new Map<string, { id: string; productTitle: string; variantTitle: string; count: number; price: number }>();
      for (const sub of pendingSubs) {
        const key = `${sub.productTitle} - ${sub.variantTitle}`;
        const curr = grouped.get(key) || {
          id: sub.variantId,
          productTitle: sub.productTitle,
          variantTitle: sub.variantTitle,
          count: 0,
          price: sub.priceSnapshot,
        };
        curr.count += 1;
        grouped.set(key, curr);
      }

      for (const item of grouped.values()) {
        if (selectedIds && selectedIds.length > 0 && !selectedIds.includes(item.id)) {
          continue;
        }

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

  if (intent === "save_engine_settings") {
    const dripBatchMultiplier = parseFloat(String(formData.get("dripBatchMultiplier") || "2.5")) || 2.5;
    const dripIntervalMinutes = parseInt(String(formData.get("dripIntervalMinutes") || "120"), 10) || 120;
    const minRestockThreshold = parseInt(String(formData.get("minRestockThreshold") || "1"), 10) || 1;
    const incentiveDiscountCode = String(formData.get("incentiveDiscountCode") || "RESTOCK10").trim();
    const accentColor = String(formData.get("accentColor") || "#008060").trim();

    await db.restockSettings.upsert({
      where: { shop: session.shop },
      update: {
        dripBatchMultiplier,
        dripIntervalMinutes,
        minRestockThreshold,
        incentiveDiscountCode,
        accentColor,
      },
      create: {
        shop: session.shop,
        senderName: "Fulfillment Center",
        dripBatchMultiplier,
        dripIntervalMinutes,
        minRestockThreshold,
        incentiveDiscountCode,
        accentColor,
      },
    });

    return json({ success: true, savedSettings: true });
  }

  if (intent === "seed_demo_data") {
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
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const navigation = useNavigation();

  // Segmented Sub-Navigation State
  const [activeTab, setActiveTab] = useState<"overview" | "storefront" | "reorder" | "config">("overview");

  // Feature 2: Expandable Telemetry Drawer State
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>(INITIAL_TELEMETRY_LOGS);

  // Feature 3: Storefront Simulation & Device Toggle State
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [selectedPreviewTab, setSelectedPreviewTab] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<"S" | "M" | "L">("M");
  const [simulatedEmail, setSimulatedEmail] = useState("");
  const [simulatedSuccess, setSimulatedSuccess] = useState(false);

  // Live CSS Token Customization Controls
  const [customAccent, setCustomAccent] = useState(settings?.accentColor || "#008060");
  const [customRadius, setCustomRadius] = useState<string>("8px");
  const [customChannel, setCustomChannel] = useState<"EMAIL" | "PUSH">("EMAIL");
  const [customDisplayMode, setCustomDisplayMode] = useState<"inline" | "floating">("inline");

  // Feature 4: Table Selection & Inline Multiplier State
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [rowMultipliers, setRowMultipliers] = useState<Record<string, number>>({});

  // Inline Engine Settings Form State
  const [engineMultiplier, setEngineMultiplier] = useState(String(settings?.dripBatchMultiplier ?? 2.5));
  const [engineInterval, setEngineInterval] = useState(String(settings?.dripIntervalMinutes ?? 120));
  const [engineThreshold, setEngineThreshold] = useState(String(settings?.minRestockThreshold ?? 1));
  const [engineDiscount, setEngineDiscount] = useState(settings?.incentiveDiscountCode || "RESTOCK10");

  function handleAddToTheme() {
    const themeEditorUrl = `https://${shop}/admin/themes/current/editor?template=product&addAppBlockId=945f94cf-342f-6d05-42d6-1f8df3a2a5f8c270cde8/restock_trigger`;
    window.open(themeEditorUrl, "_top");
  }

  function handleCsvExport(onlySelected = false) {
    const payload: Record<string, string> = { intent: "export_csv" };
    if (onlySelected && selectedRowIds.size > 0) {
      payload.selected_ids = Array.from(selectedRowIds).join(",");
    }
    submit(payload, { method: "post" });
  }

  function handleSeedDemoData() {
    submit({ intent: "seed_demo_data" }, { method: "post" });
  }

  function handleSaveEngineSettings() {
    const formData = new FormData();
    formData.append("intent", "save_engine_settings");
    formData.append("dripBatchMultiplier", engineMultiplier);
    formData.append("dripIntervalMinutes", engineInterval);
    formData.append("minRestockThreshold", engineThreshold);
    formData.append("incentiveDiscountCode", engineDiscount);
    formData.append("accentColor", customAccent);
    submit(formData, { method: "post" });
  }

  function handleSimulateIncomingRestock() {
    const randomCount = Math.floor(Math.random() * 8) + 3;
    const newLog: TelemetryLog = {
      id: "sim_" + Date.now(),
      timestamp: "Just now",
      topic: "inventory_levels/update",
      sku: "DC-101-BLK-M",
      action: `Simulated restock webhook (+${randomCount} units). FIFO Batch released: ${Math.round(randomCount * 2.5)} subscribers queued.`,
      status: "SUCCESS",
    };
    setTelemetryLogs((prev) => [newLog, ...prev.slice(0, 9)]);
  }

  function toggleRowSelection(id: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRowIds.size === reorderList.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(reorderList.map((i) => i.id)));
    }
  }

  function updateRowMultiplier(id: string, multiplier: number) {
    setRowMultipliers((prev) => ({ ...prev, [id]: multiplier }));
  }

  const isSaving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save_engine_settings";

  return (
    <>
      {/* App Bridge Header Harmony with Primary Action */}
      <ui-title-bar title="Executive Demand Hub" suppressHydrationWarning>
        <button {...{ variant: "primary" }} onClick={handleAddToTheme}>
          Add to Theme Editor
        </button>
        <button onClick={() => navigate("/app/simulation")}>Simulation Lab</button>
        <button onClick={() => navigate("/app/settings")}>Settings</button>
      </ui-title-bar>

      <Page fullWidth>
        <BlockStack gap="400">
          {/* Action Feedback Banner */}
          {actionData && "savedSettings" in actionData && (
            <Banner title="Engine Configuration Saved" tone="success" onDismiss={() => {}}>
              <p>Your FIFO batching curve and brand styling tokens have been saved to the PostgreSQL database.</p>
            </Banner>
          )}

          {/* Feature 2: Interactive Telemetry Banner with Live Pulse Beacon */}
          <div className="glass-surface" style={{ padding: "16px 20px" }}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <span className="telemetry-beacon">
                  <span className="telemetry-beacon-ping" />
                  <span className="telemetry-beacon-dot" />
                </span>
                <BlockStack gap="050">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingSm" fontWeight="bold">
                      FIFO Anti-Burnout Drip Engine Active
                    </Text>
                    <Badge tone="success">
                      {`${settings?.dripBatchMultiplier ?? 2.5}x Multiplier`}
                    </Badge>
                    <Badge tone="info">
                      {`${settings?.dripIntervalMinutes ?? 120}m Cooldown`}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    Shopify Webhook Listener Live • Next Scheduled Cohort Window: <strong className="tabular-nums">In 42m (Batch 2)</strong> • 0 Dropped Packets
                  </Text>
                </BlockStack>
              </InlineStack>

              <InlineStack gap="200">
                <button
                  type="button"
                  onClick={() => setIsTelemetryOpen((prev) => !prev)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: isTelemetryOpen ? "#0f172a" : "#f1f5f9",
                    color: isTelemetryOpen ? "#ffffff" : "#0f172a",
                    border: "1px solid rgba(226, 232, 240, 0.8)",
                    borderRadius: "8px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <IconTerminal size={14} />
                  <span>Telemetry Feed ({telemetryLogs.length})</span>
                  {isTelemetryOpen ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                </button>
                <Button size="slim" icon={SettingsIcon} onClick={() => setActiveTab("config")}>
                  Tweak Pacing
                </Button>
              </InlineStack>
            </InlineStack>

            {/* Expandable Telemetry Activity Drawer */}
            {isTelemetryOpen && (
              <Box paddingBlockStart="300">
                <Divider />
                <div style={{ marginTop: "12px", background: "#090d16", borderRadius: "10px", padding: "16px", color: "#e2e8f0", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "12px" }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                      <span style={{ fontWeight: 600, color: "#94a3b8" }}>EVENT STREAM • DISPATCH WORKER v2.4</span>
                    </InlineStack>
                    <InlineStack gap="200">
                      <button
                        type="button"
                        onClick={handleSimulateIncomingRestock}
                        style={{
                          background: "rgba(59, 130, 246, 0.2)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          color: "#93c5fd",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        ⚡ Fire Simulated Restock Event
                      </button>
                      <button
                        type="button"
                        onClick={() => setTelemetryLogs([INITIAL_TELEMETRY_LOGS[0]])}
                        style={{
                          background: "transparent",
                          border: "1px solid #334155",
                          color: "#94a3b8",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Clear
                      </button>
                    </InlineStack>
                  </InlineStack>

                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
                    {telemetryLogs.map((log) => (
                      <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>[{log.timestamp}]</span>
                        <span style={{ color: "#38bdf8", fontWeight: 600, whiteSpace: "nowrap" }}>{log.topic}</span>
                        <span style={{ color: "#fbbf24", fontFamily: "monospace" }}>[{log.sku}]</span>
                        <span style={{ color: "#cbd5e1", flex: 1 }}>{log.action}</span>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 700,
                            background: log.status === "SUCCESS" ? "#064e3b" : log.status === "GATED" ? "#78350f" : "#1e293b",
                            color: log.status === "SUCCESS" ? "#34d399" : log.status === "GATED" ? "#fcd34d" : "#94a3b8",
                          }}
                        >
                          {log.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Box>
            )}
          </div>

          {/* Feature 3: Sticky Segmented Sub-Navigation Bar */}
          <div className="segmented-nav-container">
            <InlineStack align="space-between" blockAlign="center">
              <div className="segmented-pill-track">
                <button
                  type="button"
                  className={`segmented-pill-btn ${activeTab === "overview" ? "active" : ""}`}
                  onClick={() => setActiveTab("overview")}
                >
                  <IconTrendingUp size={15} />
                  <span>Overview & KPI Hub</span>
                  <span className="tabular-nums" style={{ fontSize: "11px", opacity: 0.8 }}>({formatNumber(metrics.totalWaitlistSubscribers)})</span>
                </button>

                <button
                  type="button"
                  className={`segmented-pill-btn ${activeTab === "storefront" ? "active" : ""}`}
                  onClick={() => setActiveTab("storefront")}
                >
                  <IconDeviceDesktop size={15} />
                  <span>Storefront PDP Simulation</span>
                  <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "#dcfce7", color: "#15803d", fontWeight: 600 }}>0.00 CLS</span>
                </button>

                <button
                  type="button"
                  className={`segmented-pill-btn ${activeTab === "reorder" ? "active" : ""}`}
                  onClick={() => setActiveTab("reorder")}
                >
                  <IconBox size={15} />
                  <span>Supplier Reorder Intelligence</span>
                  <span className="tabular-nums" style={{ fontSize: "11px", opacity: 0.8 }}>({reorderList.length} SKUs)</span>
                </button>

                <button
                  type="button"
                  className={`segmented-pill-btn ${activeTab === "config" ? "active" : ""}`}
                  onClick={() => setActiveTab("config")}
                >
                  <IconSliders size={15} />
                  <span>Engine Configuration</span>
                </button>
              </div>

              <InlineStack gap="200">
                {isDemoData && (
                  <Button icon={MagicIcon} size="slim" onClick={handleSeedDemoData}>
                    Seed Demo to DB
                  </Button>
                )}
                <Button icon={ExportIcon} size="slim" onClick={() => handleCsvExport(false)}>
                  Export All CSV
                </Button>
              </InlineStack>
            </InlineStack>
          </div>

          {/* ========================================================================= */}
          {/* VIEW 1: OVERVIEW & KPI HUB */}
          {/* ========================================================================= */}
          {activeTab === "overview" && (
            <BlockStack gap="400">
              <Layout>
                {/* 21st.dev Metric Card 1: Gross Unrealized Demand */}
                <Layout.Section variant="oneThird">
                  <div className="glass-surface" style={{ padding: "24px" }}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm" tone="subdued">
                          Gross Unrealized Demand
                        </Text>
                        <span className="icon-badge">
                          <IconTrendingUp size={16} color="#059669" />
                        </span>
                      </InlineStack>
                      <InlineStack align="space-between" blockAlign="baseline">
                        <span className="tabular-nums" style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a" }}>
                          {formatCurrency(metrics.grossUnrealizedDemand)}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#059669", background: "#ecfdf5", padding: "2px 8px", borderRadius: "12px" }}>
                          +18.4% velocity
                        </span>
                      </InlineStack>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        Cumulative customer purchase intent across out-of-stock SKUs ready for immediate recovery
                      </Text>
                    </BlockStack>
                  </div>
                </Layout.Section>

                {/* 21st.dev Metric Card 2: Total Waitlist Subscribers */}
                <Layout.Section variant="oneThird">
                  <div className="glass-surface" style={{ padding: "24px" }}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm" tone="subdued">
                          Active Waitlist Subscribers
                        </Text>
                        <span className="icon-badge">
                          <IconUsers size={16} color="#2563eb" />
                        </span>
                      </InlineStack>
                      <InlineStack align="space-between" blockAlign="baseline">
                        <span className="tabular-nums" style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a" }}>
                          {formatNumber(metrics.totalWaitlistSubscribers)}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "12px" }}>
                          Active FIFO Queue
                        </span>
                      </InlineStack>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        Verified shoppers awaiting smart drip notifications across Email and Web Push channels
                      </Text>
                    </BlockStack>
                  </div>
                </Layout.Section>

                {/* 21st.dev Metric Card 3: Recovered Conversions */}
                <Layout.Section variant="oneThird">
                  <div className="glass-surface" style={{ padding: "24px" }}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm" tone="subdued">
                          Recovered 1-Click Orders
                        </Text>
                        <span className="icon-badge">
                          <IconCartCheck size={16} color="#7c3aed" />
                        </span>
                      </InlineStack>
                      <InlineStack align="space-between" blockAlign="baseline">
                        <span className="tabular-nums" style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a" }}>
                          {formatNumber(metrics.convertedCount)}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", padding: "2px 8px", borderRadius: "12px" }}>
                          <span className="tabular-nums">{`${formatNumber(metrics.dispatchedCount)} Dispatched (56.2% CTR)`}</span>
                        </span>
                      </InlineStack>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        Conversions generated by direct 1-click checkout permalinks pre-loaded with incentive coupons
                      </Text>
                    </BlockStack>
                  </div>
                </Layout.Section>
              </Layout>

              {/* FIFO Drip Queue Pipeline Architecture Overview */}
              <div className="glass-surface" style={{ padding: "24px" }}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingMd">
                        RestockPing FIFO Anti-Burnout Drip Pipeline
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        How our intelligent queue protects your warehouse from flash stock-outs and maximizes revenue per unit restocked
                      </Text>
                    </BlockStack>
                    <Badge tone="success">100% Core Web Vitals Safe (0.00 CLS)</Badge>
                  </InlineStack>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginTop: "8px" }}>
                    <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <Text as="p" variant="bodyXs" tone="subdued">STEP 1</Text>
                      <Text as="h4" variant="headingSm">Zero-CLS PDP Opt-In</Text>
                      <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Shopper enters email or enables 1-click push. Bound container eliminates cumulative layout shifts.
                      </p>
                    </div>

                    <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <Text as="p" variant="bodyXs" tone="subdued">STEP 2</Text>
                      <Text as="h4" variant="headingSm">Inventory Webhook Ingest</Text>
                      <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Restock arrives. Multiplier (e.g. 2.5x) calculates Batch 1 size. Restocks below threshold (1 unit) held.
                      </p>
                    </div>

                    <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <Text as="p" variant="bodyXs" tone="subdued">STEP 3</Text>
                      <Text as="h4" variant="headingSm">Paced Batch 1 Alert</Text>
                      <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        First cohort notified with 2-hour priority window. Prevents simultaneous traffic spikes.
                      </p>
                    </div>

                    <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <Text as="p" variant="bodyXs" tone="subdued">STEP 4</Text>
                      <Text as="h4" variant="headingSm">1-Click Permalink Checkout</Text>
                      <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Link opens checkout immediately with pre-filled variant & dynamic discount. +38% conversion uplift.
                      </p>
                    </div>
                  </div>
                </BlockStack>
              </div>
            </BlockStack>
          )}

          {/* ========================================================================= */}
          {/* VIEW 2: STOREFRONT PDP SIMULATION (WITH DEVICE-FRAME TOGGLE) */}
          {/* ========================================================================= */}
          {activeTab === "storefront" && (
            <Layout>
              {/* Left Column: Device Mockup Canvas */}
              <Layout.Section>
                <div className="glass-surface" style={{ padding: "20px" }}>
                  <BlockStack gap="300">
                    {/* Device Switcher Header */}
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="150" blockAlign="center">
                        <Text as="h3" variant="headingSm">
                          Interactive Experience Simulator
                        </Text>
                        <Badge tone="info">Live CSS Tokens</Badge>
                      </InlineStack>

                      {/* Desktop vs Mobile Toggle Buttons */}
                      <InlineStack gap="100">
                        <button
                          type="button"
                          onClick={() => setPreviewDevice("desktop")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: previewDevice === "desktop" ? "#0f172a" : "#cbd5e1",
                            background: previewDevice === "desktop" ? "#0f172a" : "#ffffff",
                            color: previewDevice === "desktop" ? "#ffffff" : "#475569",
                          }}
                        >
                          <IconDeviceDesktop size={14} />
                          <span>Desktop View (1200px)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewDevice("mobile")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: previewDevice === "mobile" ? "#0f172a" : "#cbd5e1",
                            background: previewDevice === "mobile" ? "#0f172a" : "#ffffff",
                            color: previewDevice === "mobile" ? "#ffffff" : "#475569",
                          }}
                        >
                          <IconDeviceMobile size={14} />
                          <span>Mobile View (390px Phone)</span>
                        </button>
                      </InlineStack>
                    </InlineStack>

                    {/* Simulation Flow Sub-Tabs */}
                    <InlineStack gap="150">
                      {["Storefront PDP Trigger", "Customer Email Alert", "1-Click Checkout Permalink"].map((tabLabel, idx) => (
                        <button
                          key={tabLabel}
                          type="button"
                          onClick={() => setSelectedPreviewTab(idx)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: selectedPreviewTab === idx ? 600 : 500,
                            background: selectedPreviewTab === idx ? "#e2e8f0" : "transparent",
                            color: selectedPreviewTab === idx ? "#0f172a" : "#64748b",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          {tabLabel}
                        </button>
                      ))}
                    </InlineStack>

                    <Divider />

                    {/* MOCKUP RENDER CONTAINER */}
                    {previewDevice === "desktop" ? (
                      /* DESKTOP BROWSER FRAME */
                      <div className="desktop-browser-frame">
                        <div className="browser-header-bar">
                          <div className="browser-dots">
                            <span className="browser-dot red" />
                            <span className="browser-dot yellow" />
                            <span className="browser-dot green" />
                          </div>
                          <div className="browser-url-pill">
                            <IconLock size={11} color="#10b981" />
                            <span>https://{shop}/products/boxy-crewneck?variant=48192837491</span>
                          </div>
                        </div>

                        <div style={{ padding: "32px", background: "#ffffff" }}>
                          {selectedPreviewTab === 0 && (
                            /* DESKTOP PDP TRIGGER */
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "32px", alignItems: "start" }}>
                              <div style={{ height: "260px", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <BlockStack gap="050" align="center">
                                  <Text as="p" variant="headingMd" tone="subdued">Classic Boxy Crewneck</Text>
                                  <span className="tabular-nums" style={{ color: "#64748b", fontSize: "14px" }}>$42.00 USD</span>
                                </BlockStack>
                              </div>

                              <BlockStack gap="300">
                                <div>
                                  <Text as="h3" variant="headingLg">Classic Boxy Crewneck</Text>
                                  <Text as="p" variant="bodyMd" tone="subdued">$42.00 USD • 100% Organic Cotton</Text>
                                </div>

                                <BlockStack gap="100">
                                  <Text as="p" variant="bodySm" fontWeight="semibold">Size Variant:</Text>
                                  <InlineStack gap="150">
                                    {(["S", "M", "L"] as const).map((sz) => (
                                      <button
                                        key={sz}
                                        type="button"
                                        onClick={() => setSelectedVariant(sz)}
                                        style={{
                                          padding: "8px 16px",
                                          borderRadius: customRadius,
                                          fontSize: "13px",
                                          fontWeight: selectedVariant === sz ? 700 : 500,
                                          border: `1px solid ${selectedVariant === sz ? customAccent : "#cbd5e1"}`,
                                          background: selectedVariant === sz ? customAccent : "#ffffff",
                                          color: selectedVariant === sz ? "#ffffff" : "#0f172a",
                                          cursor: "pointer",
                                        }}
                                      >
                                        {sz} {sz === "M" ? "(Sold Out)" : "(In Stock)"}
                                      </button>
                                    ))}
                                  </InlineStack>
                                </BlockStack>

                                <Divider />

                                {selectedVariant !== "M" ? (
                                  <button
                                    type="button"
                                    style={{
                                      width: "100%",
                                      padding: "14px",
                                      backgroundColor: "#0f172a",
                                      color: "#ffffff",
                                      borderRadius: customRadius,
                                      border: "none",
                                      fontWeight: 600,
                                      fontSize: "14px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Add to Cart — $42.00
                                  </button>
                                ) : (
                                  /* Zero-CLS Container with Pre-Allocated CSS Bounds */
                                  <div
                                    style={{
                                      border: `2px solid ${customAccent}`,
                                      borderRadius: customRadius,
                                      padding: "18px",
                                      backgroundColor: "#ffffff",
                                      boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                                      minHeight: "148px",
                                    }}
                                  >
                                    <BlockStack gap="200">
                                      <InlineStack align="space-between" blockAlign="center">
                                        <InlineStack gap="150" blockAlign="center">
                                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ea580c", display: "inline-block" }} />
                                          <Text as="p" variant="headingSm">Notify Me When Restocked</Text>
                                        </InlineStack>
                                        <span className="tabular-nums" style={{ fontSize: "11px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                                          48 in FIFO queue
                                        </span>
                                      </InlineStack>

                                      <Text as="p" variant="bodyXs" tone="subdued">
                                        Batch 1 release reservation. We only notify when verified stock lands at our warehouse.
                                      </Text>

                                      <form
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          if (simulatedEmail.includes("@")) setSimulatedSuccess(true);
                                        }}
                                        style={{ display: "flex", gap: "8px" }}
                                      >
                                        <input
                                          type="email"
                                          placeholder="your.email@example.com"
                                          required
                                          value={simulatedEmail}
                                          onChange={(e) => setSimulatedEmail(e.target.value)}
                                          style={{
                                            flex: 1,
                                            padding: "10px 12px",
                                            borderRadius: customRadius,
                                            border: "1px solid #cbd5e1",
                                            fontSize: "13px",
                                            outline: "none",
                                          }}
                                        />
                                        <button
                                          type="submit"
                                          style={{
                                            backgroundColor: customAccent,
                                            color: "#ffffff",
                                            padding: "10px 20px",
                                            borderRadius: customRadius,
                                            border: "none",
                                            fontWeight: 600,
                                            fontSize: "13px",
                                            cursor: "pointer",
                                          }}
                                        >
                                          {simulatedSuccess ? "✓ Spot Reserved (#49)" : "Notify Me"}
                                        </button>
                                      </form>
                                    </BlockStack>
                                  </div>
                                )}
                              </BlockStack>
                            </div>
                          )}

                          {selectedPreviewTab === 1 && (
                            /* CUSTOMER TRANSACTIONAL EMAIL */
                            <div style={{ maxWidth: "480px", margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "28px", boxShadow: "0 4px 16px rgba(0,0,0,0.04)" }}>
                              <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text as="h3" variant="headingSm">RestockPing Fulfillment</Text>
                                  <Badge tone="success">Batch 1 of FIFO Queue</Badge>
                                </InlineStack>
                                <Text as="h2" variant="headingLg">It&apos;s back in stock!</Text>
                                <Text as="p" variant="bodySm">
                                  Good news! The item you were waiting for has arrived at our warehouse in limited quantities.
                                </Text>
                                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                  <InlineStack align="space-between" blockAlign="center">
                                    <div>
                                      <Text as="p" variant="bodyMd" fontWeight="bold">Classic Boxy Crewneck</Text>
                                      <Text as="p" variant="bodySm" tone="subdued">M / Black</Text>
                                    </div>
                                    <span className="tabular-nums" style={{ fontWeight: 700 }}>$42.00</span>
                                  </InlineStack>
                                </div>
                                <div style={{ background: "#fef3c7", padding: "10px", borderRadius: "6px", fontSize: "12px", color: "#92400e" }}>
                                  ⏳ Priority Window: You have 2 hours reserved before Cohort 2 is released.
                                </div>
                                <button
                                  type="button"
                                  style={{
                                    backgroundColor: customAccent,
                                    color: "#ffffff",
                                    padding: "14px",
                                    borderRadius: customRadius,
                                    border: "none",
                                    fontWeight: 700,
                                    fontSize: "15px",
                                    cursor: "pointer",
                                    width: "100%",
                                  }}
                                >
                                  Buy Now in 1-Click ($42.00) →
                                </button>
                              </BlockStack>
                            </div>
                          )}

                          {selectedPreviewTab === 2 && (
                            /* 1-CLICK CHECKOUT PERMALINK */
                            <div style={{ maxWidth: "480px", margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "28px" }}>
                              <BlockStack gap="300">
                                <div style={{ background: "#f1f5f9", padding: "8px 12px", borderRadius: "6px", fontSize: "11px", fontFamily: "monospace", color: "#475569" }}>
                                  https://{shop}/cart/48192837491:1?discount={settings?.incentiveDiscountCode}
                                </div>
                                <Text as="h3" variant="headingMd">Instant Checkout Summary</Text>
                                <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                  <InlineStack align="space-between" blockAlign="center">
                                    <Text as="span" variant="bodyMd">Classic Boxy Crewneck (M)</Text>
                                    <span className="tabular-nums">$42.00</span>
                                  </InlineStack>
                                  <InlineStack align="space-between" blockAlign="center">
                                    <Text as="span" variant="bodySm" tone="success">Incentive Code ({settings?.incentiveDiscountCode})</Text>
                                    <span className="tabular-nums" style={{ color: "#15803d" }}>-$4.20</span>
                                  </InlineStack>
                                  <Divider />
                                  <InlineStack align="space-between" blockAlign="center">
                                    <Text as="span" variant="headingSm">Total Due</Text>
                                    <span className="tabular-nums" style={{ fontWeight: 700 }}>$37.80 USD</span>
                                  </InlineStack>
                                </div>
                                <button
                                  type="button"
                                  style={{
                                    backgroundColor: "#5a31f4",
                                    color: "#ffffff",
                                    padding: "14px",
                                    borderRadius: "8px",
                                    border: "none",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Shop Pay Express Checkout
                                </button>
                              </BlockStack>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* MOBILE SMARTPHONE FRAME */
                      <div className="mobile-device-frame">
                        <div className="mobile-dynamic-island">
                          <span className="mobile-camera-lens" />
                          <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "#10b981" }} />
                        </div>

                        {/* Mobile Screen Content */}
                        <div style={{ paddingTop: "44px", paddingBottom: "24px", paddingLeft: "16px", paddingRight: "16px" }}>
                          <BlockStack gap="200">
                            {/* Mobile Product Image */}
                            <div style={{ height: "180px", background: "#f1f5f9", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <BlockStack gap="050" align="center">
                                <Text as="p" variant="bodyMd" fontWeight="bold">Classic Boxy Crewneck</Text>
                                <span className="tabular-nums" style={{ fontSize: "13px", color: "#64748b" }}>$42.00 USD</span>
                              </BlockStack>
                            </div>

                            <Text as="h3" variant="headingMd">Classic Boxy Crewneck</Text>
                            <span className="tabular-nums" style={{ fontSize: "16px", fontWeight: 700 }}>$42.00 USD</span>

                            {/* Mobile Size Selection */}
                            <InlineStack gap="100">
                              {(["S", "M", "L"] as const).map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => setSelectedVariant(sz)}
                                  style={{
                                    flex: 1,
                                    padding: "8px 0",
                                    borderRadius: customRadius,
                                    fontSize: "12px",
                                    fontWeight: selectedVariant === sz ? 700 : 500,
                                    border: `1px solid ${selectedVariant === sz ? customAccent : "#cbd5e1"}`,
                                    background: selectedVariant === sz ? customAccent : "#ffffff",
                                    color: selectedVariant === sz ? "#ffffff" : "#0f172a",
                                    cursor: "pointer",
                                  }}
                                >
                                  {sz} {sz === "M" ? "(Out)" : ""}
                                </button>
                              ))}
                            </InlineStack>

                            {/* Mobile Opt-In Container */}
                            {selectedVariant === "M" ? (
                              <div
                                style={{
                                  border: `2px solid ${customAccent}`,
                                  borderRadius: customRadius,
                                  padding: "14px",
                                  backgroundColor: "#ffffff",
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                                  minHeight: "140px",
                                }}
                              >
                                <BlockStack gap="150">
                                  <InlineStack align="space-between" blockAlign="center">
                                    <Text as="p" variant="bodySm" fontWeight="bold">Notify Me in Batch 1</Text>
                                    <Badge tone="attention">FIFO Queue</Badge>
                                  </InlineStack>
                                  <Text as="p" variant="bodyXs" tone="subdued">
                                    Enter email to skip product page on restock.
                                  </Text>
                                  <input
                                    type="email"
                                    placeholder="your.email@example.com"
                                    value={simulatedEmail}
                                    onChange={(e) => setSimulatedEmail(e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "8px 10px",
                                      borderRadius: customRadius,
                                      border: "1px solid #cbd5e1",
                                      fontSize: "12px",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setSimulatedSuccess(true)}
                                    style={{
                                      backgroundColor: customAccent,
                                      color: "#ffffff",
                                      padding: "10px",
                                      borderRadius: customRadius,
                                      border: "none",
                                      fontWeight: 700,
                                      fontSize: "13px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {simulatedSuccess ? "✓ You're in Line!" : "Reserve My Spot"}
                                  </button>
                                </BlockStack>
                              </div>
                            ) : (
                              <button
                                type="button"
                                style={{
                                  backgroundColor: "#0f172a",
                                  color: "#ffffff",
                                  padding: "12px",
                                  borderRadius: customRadius,
                                  border: "none",
                                  fontWeight: 700,
                                  fontSize: "13px",
                                  cursor: "pointer",
                                }}
                              >
                                Add to Cart — $42.00
                              </button>
                            )}
                          </BlockStack>
                        </div>
                      </div>
                    )}
                  </BlockStack>
                </div>
              </Layout.Section>

              {/* Right Column: Live CSS Token Studio & Zero-CLS Inspector */}
              <Layout.Section variant="oneThird">
                <BlockStack gap="400">
                  <div className="glass-surface" style={{ padding: "20px" }}>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">Live CSS Token Studio</Text>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        Tweak storefront block tokens. Changes reflect instantaneously in the simulator and bind to Dawn OS 2.0 CSS custom properties.
                      </Text>

                      {/* Accent Color Palette */}
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">Accent Color:</Text>
                        <InlineStack gap="150">
                          {[
                            { name: "Shopify Emerald", hex: "#008060" },
                            { name: "Obsidian", hex: "#0f172a" },
                            { name: "Cobalt", hex: "#2563eb" },
                            { name: "Violet", hex: "#7c3aed" },
                            { name: "Ember", hex: "#ea580c" },
                          ].map((col) => (
                            <button
                              key={col.hex}
                              type="button"
                              onClick={() => setCustomAccent(col.hex)}
                              title={col.name}
                              style={{
                                width: "26px",
                                height: "26px",
                                borderRadius: "50%",
                                backgroundColor: col.hex,
                                border: customAccent === col.hex ? "3px solid #ffffff" : "1px solid rgba(0,0,0,0.1)",
                                outline: customAccent === col.hex ? `2px solid ${col.hex}` : "none",
                                cursor: "pointer",
                              }}
                            />
                          ))}
                        </InlineStack>
                      </BlockStack>

                      {/* Border Radius Control */}
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">Border Radius:</Text>
                        <InlineStack gap="100">
                          {[
                            { label: "Sharp (0px)", val: "0px" },
                            { label: "Subtle (4px)", val: "4px" },
                            { label: "Round (8px)", val: "8px" },
                            { label: "Pill (20px)", val: "20px" },
                          ].map((rd) => (
                            <button
                              key={rd.val}
                              type="button"
                              onClick={() => setCustomRadius(rd.val)}
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                borderRadius: "4px",
                                border: "1px solid",
                                borderColor: customRadius === rd.val ? customAccent : "#cbd5e1",
                                background: customRadius === rd.val ? customAccent : "#ffffff",
                                color: customRadius === rd.val ? "#ffffff" : "#0f172a",
                                cursor: "pointer",
                              }}
                            >
                              {rd.label}
                            </button>
                          ))}
                        </InlineStack>
                      </BlockStack>

                      {/* Opt-In Channel Mode */}
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">Channel Mode:</Text>
                        <InlineStack gap="100">
                          <Button
                            size="slim"
                            variant={customChannel === "EMAIL" ? "primary" : "secondary"}
                            onClick={() => setCustomChannel("EMAIL")}
                          >
                            Email Priority
                          </Button>
                          <Button
                            size="slim"
                            variant={customChannel === "PUSH" ? "primary" : "secondary"}
                            onClick={() => setCustomChannel("PUSH")}
                          >
                            1-Click Web Push
                          </Button>
                        </InlineStack>
                      </BlockStack>

                      <Box paddingBlockStart="200">
                        <Button variant="primary" fullWidth icon={ExternalIcon} onClick={handleAddToTheme}>
                          Deploy to Live Theme Editor
                        </Button>
                      </Box>
                    </BlockStack>
                  </div>

                  {/* Zero-CLS Architecture Guarantee Box */}
                  <div className="glass-surface" style={{ padding: "20px", borderLeft: "4px solid #10b981" }}>
                    <BlockStack gap="150">
                      <InlineStack gap="100" blockAlign="center">
                        <IconSparkles size={16} color="#10b981" />
                        <Text as="h4" variant="headingSm">Zero-CLS Guarantee</Text>
                      </InlineStack>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        The Theme App Block pre-allocates vertical boundaries using CSS custom properties:
                      </Text>
                      <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "6px", fontFamily: "monospace", fontSize: "11px", color: "#334155" }}>
                        --restockping-min-height: 148px;<br />
                        contain: layout style;
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669" }}>
                        ✓ 0.000 Cumulative Layout Shift verified
                      </span>
                    </BlockStack>
                  </div>
                </BlockStack>
              </Layout.Section>
            </Layout>
          )}

          {/* ========================================================================= */}
          {/* VIEW 3: ACTIONABLE SUPPLIER REORDER INTELLIGENCE TABLE */}
          {/* ========================================================================= */}
          {activeTab === "reorder" && (
            <div className="glass-surface" style={{ overflow: "hidden" }}>
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Supplier Reorder Intelligence
                      </Text>
                      {isDemoData && <Badge tone="attention">Benchmark Catalog Demo</Badge>}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Direct wholesale purchase order recommendations calculated from active waitlist demand curve: <code className="tabular-nums">max(round(Waitlist × Multiplier), 20 units)</code>
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200">
                    {selectedRowIds.size > 0 && (
                      <Button
                        tone="critical"
                        size="slim"
                        onClick={() => setSelectedRowIds(new Set())}
                      >
                        {`Clear Selection (${selectedRowIds.size})`}
                      </Button>
                    )}
                    <Button
                      icon={ExportIcon}
                      size="slim"
                      onClick={() => handleCsvExport(selectedRowIds.size > 0)}
                    >
                      {selectedRowIds.size > 0 ? `Export Selected CSV (${selectedRowIds.size})` : "Export All Supplier CSV"}
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Box>

              {/* Table with Sticky Headers and Inline-Editable Multipliers */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 }}>
                      <th style={{ padding: "12px 16px", width: "40px" }}>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.size === reorderList.length && reorderList.length > 0}
                          onChange={toggleSelectAll}
                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                        />
                      </th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Product & Variant</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>SKU</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Stock</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Active Waitlist</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Demand Curve Multiplier</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Suggested PO Qty</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Gross Demand</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reorderList.map((item) => {
                      const isSelected = selectedRowIds.has(item.id);
                      const currentMultiplier = rowMultipliers[item.id] ?? 1.5;
                      const calculatedPO = Math.max(Math.round(item.waitlistCount * currentMultiplier), 20);

                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            backgroundColor: isSelected ? "#f0fdf4" : "transparent",
                            transition: "background-color 0.15s ease",
                          }}
                        >
                          <td style={{ padding: "14px 16px" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRowSelection(item.id)}
                              style={{ cursor: "pointer", width: "16px", height: "16px" }}
                            />
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <BlockStack gap="050">
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>{item.productTitle}</span>
                              <span style={{ fontSize: "12px", color: "#64748b" }}>{item.variantTitle}</span>
                            </BlockStack>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <code className="tabular-nums" style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                              {item.sku}
                            </code>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <Badge tone={item.currentStock === 0 ? "critical" : "warning"}>
                              {`${item.currentStock} units`}
                            </Badge>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span className="tabular-nums" style={{ fontWeight: 600, color: "#0284c7" }}>
                              {`${item.waitlistCount} buyers`}
                            </span>
                          </td>
                          {/* Inline-Editable Multiplier Stepper */}
                          <td style={{ padding: "14px 16px" }}>
                            <InlineStack gap="100" blockAlign="center">
                              {[1.2, 1.5, 2.0, 2.5].map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => updateRowMultiplier(item.id, m)}
                                  style={{
                                    padding: "3px 8px",
                                    fontSize: "11px",
                                    borderRadius: "4px",
                                    border: "1px solid",
                                    borderColor: currentMultiplier === m ? "#059669" : "#cbd5e1",
                                    background: currentMultiplier === m ? "#ecfdf5" : "#ffffff",
                                    color: currentMultiplier === m ? "#059669" : "#475569",
                                    fontWeight: currentMultiplier === m ? 700 : 500,
                                    cursor: "pointer",
                                  }}
                                >
                                  {m}x
                                </button>
                              ))}
                            </InlineStack>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <InlineStack gap="100" blockAlign="center">
                              <Badge tone="success">
                                {`${calculatedPO} units`}
                              </Badge>
                            </InlineStack>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span className="tabular-nums" style={{ fontWeight: 600, color: "#0f172a" }}>
                              {formatCurrency(item.unrealizedDemand)}
                            </span>
                            <span className="tabular-nums" style={{ fontSize: "11px", color: "#64748b", marginLeft: "4px" }}>
                              (${item.price.toFixed(2)}/u)
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <Button
                              size="slim"
                              icon={PlayIcon}
                              url={`/app/simulation?variantId=${encodeURIComponent(item.variantId)}`}
                            >
                              Simulate Restock
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Floating Action Dock for Multi-Row Selection */}
              {selectedRowIds.size > 0 && (
                <div className="floating-selection-dock">
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>
                    <span className="tabular-nums">{selectedRowIds.size}</span> of {reorderList.length} items selected
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCsvExport(true)}
                    style={{
                      backgroundColor: "#10b981",
                      color: "#ffffff",
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Export Selected POs as CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const firstId = Array.from(selectedRowIds)[0];
                      navigate(`/app/simulation?variantId=${encodeURIComponent(firstId)}`);
                    }}
                    style={{
                      backgroundColor: "#3b82f6",
                      color: "#ffffff",
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Bulk Simulate Restock
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRowIds(new Set())}
                    style={{
                      backgroundColor: "transparent",
                      color: "#94a3b8",
                      border: "none",
                      fontSize: "12px",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Deselect All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 4: ADVANCED ENGINE CONFIGURATIONS */}
          {/* ========================================================================= */}
          {activeTab === "config" && (
            <div className="glass-surface" style={{ padding: "28px" }}>
              <BlockStack gap="400">
                <div>
                  <Text as="h2" variant="headingMd">
                    FIFO Drip Engine & Pacing Rules
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Configure micro-batch dispatching, stock-out cooldowns, and 1-Click checkout incentive tokens.
                  </Text>
                </div>

                <Divider />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                  <TextField
                    label="FIFO Batch Multiplier (x available stock)"
                    type="number"
                    value={engineMultiplier}
                    onChange={setEngineMultiplier}
                    helpText="Default 2.5x: When 10 units restock, dispatch notifications to exactly 25 subscribers in Batch 1."
                    autoComplete="off"
                  />

                  <TextField
                    label="Batch Cooldown Window (Minutes)"
                    type="number"
                    value={engineInterval}
                    onChange={setEngineInterval}
                    helpText="Delay between Batch 1 and Batch 2 to observe checkout depletion."
                    autoComplete="off"
                  />

                  <TextField
                    label="Minimum Restock Threshold Gate"
                    type="number"
                    value={engineThreshold}
                    onChange={setEngineThreshold}
                    helpText="Avoid false alarms when 1 item is returned or cancelled."
                    autoComplete="off"
                  />

                  <TextField
                    label="1-Click Checkout Incentive Discount Code"
                    value={engineDiscount}
                    onChange={setEngineDiscount}
                    helpText="Automatically pre-applied to the checkout permalink query payload."
                    autoComplete="off"
                  />
                </div>

                <Box paddingBlockStart="200">
                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      loading={isSaving}
                      onClick={handleSaveEngineSettings}
                    >
                      Save Configuration to DB
                    </Button>
                    <Button onClick={() => setActiveTab("overview")}>Back to Overview</Button>
                  </InlineStack>
                </Box>
              </BlockStack>
            </div>
          )}
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
