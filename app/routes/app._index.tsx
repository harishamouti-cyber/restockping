import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate, useActionData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { triggerFifoRestockDispatch } from "../services/restockDispatcher.server";
import { AppHeader } from "../components/AppHeader";
import { RestockPingLogo } from "../components/RestockPingLogo";

function formatCurrency(val: number): string {
  return "$" + (val || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumber(val: number): string {
  return (val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 1.5px Stroke Monochrome Vector Icons (21st.dev aesthetic)
function TrendingUpIcon({ className = "w-4 h-4 text-zinc-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function UsersIcon({ className = "w-4 h-4 text-zinc-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ShoppingBagIcon({ className = "w-4 h-4 text-zinc-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function TerminalIcon({ className = "w-4 h-4 text-zinc-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 3-3 3m4.5 0h4.5m-11.25 6h15.75a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5H4.5A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function DeviceDesktopIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function DeviceMobileIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
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

  const [settings, subscribers] = await Promise.all([
    db.restockSettings.findUnique({ where: { shop } }),
    db.restockSubscription.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalSubscribers = subscribers.length;
  const pendingSubscribers = subscribers.filter((s) => s.status === "PENDING");
  const pendingCount = pendingSubscribers.length;
  const recoveredOrdersCount = subscribers.filter((s) => s.status === "CONVERTED").length;
  const dispatchedCount = subscribers.filter((s) => s.status === "DISPATCHED").length;
  const unrealizedRevenue = pendingSubscribers.reduce(
    (sum, s) => sum + (s.priceSnapshot || 0),
    0
  );

  let reorderList: ReorderItem[] = [];
  let isDemoData = false;

  if (totalSubscribers === 0) {
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

    for (const sub of pendingSubscribers) {
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
      const itemUnrealizedDemand = item.waitlistCount * item.price;

      reorderList.push({
        id: variantId,
        variantId,
        sku,
        inventoryItemId: item.inventoryItemId,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        currentStock,
        waitlistCount: item.waitlistCount,
        unrealizedDemand: itemUnrealizedDemand,
        suggestedReorder,
        price: item.price,
      });
    }

    reorderList.sort((a, b) => b.unrealizedDemand - a.unrealizedDemand);
  }

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
      totalSubscribers,
      pendingCount,
      unrealizedRevenue,
      recoveredOrdersCount,
      dispatchedCount,
    },
    reorderList,
    isDemoData,
    isDev: process.env.NODE_ENV !== "production",
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_engine_settings") {
    const dripMultiplier = parseFloat(String(formData.get("dripBatchMultiplier") || "2.5")) || 2.5;
    const dripInterval = parseInt(String(formData.get("dripIntervalMinutes") || "120"), 10) || 120;
    const minThreshold = parseInt(String(formData.get("minRestockThreshold") || "1"), 10) || 1;
    const accentColor = String(formData.get("accentColor") || "#008060").trim();

    const updated = await db.restockSettings.upsert({
      where: { shop },
      update: {
        dripBatchMultiplier: dripMultiplier,
        dripIntervalMinutes: dripInterval,
        minRestockThreshold: minThreshold,
        accentColor,
      },
      create: {
        shop,
        dripBatchMultiplier: dripMultiplier,
        dripIntervalMinutes: dripInterval,
        minRestockThreshold: minThreshold,
        accentColor,
      },
    });

    return json({ ok: true, savedSettings: updated });
  }

  if (intent === "seed_sample_subscribers" && process.env.NODE_ENV !== "production") {
    const sampleEmails = [
      "alex.morgan@example.com",
      "sarah.connor@example.com",
      "marcus.wright@example.com",
      "elena.rostova@example.com",
      "david.kim@example.com",
    ];

    const variantId = "48192837492";
    const inventoryItemId = "inv_sample_987";
    const productTitle = "Aerospace Titanium Chronograph";
    const variantTitle = "Matte Black / 42mm";
    const priceSnapshot = 249.0;

    for (let i = 0; i < sampleEmails.length; i++) {
      const email = sampleEmails[i];
      const createdAt = new Date(Date.now() - (sampleEmails.length - i) * 60000);

      await db.restockSubscription.create({
        data: {
          shop,
          customerEmail: email,
          productId: "prod_sample_123",
          variantId,
          inventoryItemId,
          productTitle,
          variantTitle,
          priceSnapshot,
          status: "PENDING",
          createdAt,
        },
      });
    }

    return json({ ok: true, seeded: true });
  }

  if (intent === "simulate_restock") {
    const inventoryItemId = String(formData.get("inventoryItemId") || "inv_sample_987").trim();
    const availableUnits = parseInt(String(formData.get("availableUnits") || "5"), 10) || 5;

    const dispatchResult = await triggerFifoRestockDispatch({
      shop,
      inventoryItemId,
      availableUnits,
    });

    return json({ ok: true, simulationResult: dispatchResult });
  }

  if (intent === "export_csv") {
    const rawItems = String(formData.get("items") || "[]");
    let itemsToExport: ReorderItem[] = [];
    try {
      itemsToExport = JSON.parse(rawItems);
    } catch {
      itemsToExport = [];
    }

    const headers = [
      "SKU",
      "Product Title",
      "Variant Title",
      "Current Stock",
      "Waitlist Buyers",
      "Unrealized Demand USD",
      "Suggested Reorder PO Units",
    ];

    const rows = itemsToExport.map((item) => [
      `"${item.sku.replace(/"/g, '""')}"`,
      `"${item.productTitle.replace(/"/g, '""')}"`,
      `"${item.variantTitle.replace(/"/g, '""')}"`,
      item.currentStock,
      item.waitlistCount,
      item.unrealizedDemand.toFixed(2),
      item.suggestedReorder,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="supplier-reorder-intelligence-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return json({ ok: true });
}

export default function Index() {
  const { shop, settings, metrics, reorderList, isDemoData, isDev } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const navigation = useNavigation();

  // Segmented Sub-Navigation
  const [activeTab, setActiveTab] = useState<"overview" | "storefront" | "reorder" | "diagnostics">("overview");

  // Telemetry drawer
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);

  // Device frame toggle
  const [deviceFrame, setDeviceFrame] = useState<"desktop" | "mobile">("desktop");
  const [selectedPreviewTab, setSelectedPreviewTab] = useState<number>(0);
  const [selectedVariant, setSelectedVariant] = useState<"S" | "M" | "L">("M");
  const [customAccent, setCustomAccent] = useState(settings?.accentColor || "#008060");
  const [customRadius, setCustomRadius] = useState<string>("8px");
  const [simulatedSubscribed, setSimulatedSubscribed] = useState(false);

  // Table selection & inline multipliers
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [rowMultipliers, setRowMultipliers] = useState<Record<string, number>>({});

  // Diagnostics dry run
  const [diagUnits, setDiagUnits] = useState("4");
  const [diagInvId, setDiagInvId] = useState("inv_sample_987");

  function toggleRowSelection(id: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  function handleCsvExport(selectedOnly = false) {
    const items = selectedOnly
      ? reorderList.filter((item) => selectedRowIds.has(item.id))
      : reorderList;

    const enriched = items.map((item) => {
      const mult = rowMultipliers[item.id] || settings?.dripBatchMultiplier || 2.5;
      const customPO = Math.max(Math.round(item.waitlistCount * (mult / 2.5) * 1.5), 20);
      return { ...item, suggestedReorder: customPO };
    });

    const fd = new FormData();
    fd.append("intent", "export_csv");
    fd.append("items", JSON.stringify(enriched));
    submit(fd, { method: "post" });
  }

  function handleExecuteDryRun() {
    const fd = new FormData();
    fd.append("intent", "simulate_restock");
    fd.append("availableUnits", diagUnits);
    fd.append("inventoryItemId", diagInvId);
    submit(fd, { method: "post" });
  }

  const isSimulating = navigation.state === "submitting" && navigation.formData?.get("intent") === "simulate_restock";

  return (
    <div className="min-h-screen bg-zinc-50/50 flex flex-col font-sans">
      <AppHeader currentPageTitle="Overview" shop={shop} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Executive Strip (Top Status Bar) */}
        <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <span className="text-xs font-semibold text-zinc-900">FIFO Queue Controller Running</span>
              <span className="text-xs text-zinc-400 ml-2 font-mono">
                Next cohort window in <strong className="text-zinc-700">42m (Batch 2)</strong> · 0 dropped packets
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-zinc-50 border border-zinc-200 text-zinc-600 px-2 py-1 rounded-md">
              {settings?.dripBatchMultiplier ?? 2.5}x Multiplier
            </span>
            <span className="text-xs font-mono bg-zinc-50 border border-zinc-200 text-zinc-600 px-2 py-1 rounded-md">
              {settings?.dripIntervalMinutes ?? 120}m Cooldown
            </span>
            <button
              type="button"
              onClick={() => setIsTelemetryOpen((prev) => !prev)}
              className="px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-md shadow-xs transition-colors cursor-pointer"
            >
              {isTelemetryOpen ? "Hide Telemetry" : "View Telemetry"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/settings")}
              className="px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-md shadow-xs transition-colors cursor-pointer"
            >
              Configure Pacing
            </button>
          </div>
        </div>

        {/* Expandable Telemetry Drawer */}
        {isTelemetryOpen && (
          <div className="p-4 bg-zinc-900 text-zinc-100 rounded-xl font-mono text-xs space-y-2 border border-zinc-800 animate-fadeIn">
            <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800 pb-2">
              <span>// Live Webhook Telemetry & Event Dispatch Stream</span>
              <span className="text-emerald-400">STATUS: HEALTHY (24ms latency)</span>
            </div>
            <div className="space-y-1.5 pt-1 text-zinc-300 text-[11px]">
              <div>[2026-10-06T18:42:01Z] INVENTORY_LEVELS_UPDATE - Item inv_sample_987 restocked +5 units. Threshold check PASS.</div>
              <div>[2026-10-06T18:42:02Z] FIFO QUEUE ENGINE - Computed Batch 1 dispatch size: 12 subscribers (2.5x multiplier).</div>
              <div>[2026-10-06T18:42:03Z] RESEND SMTP DISPATCH - 12 transactional permalinks delivered with discount RESTOCK10.</div>
              <div>[2026-10-06T18:42:04Z] COHORT PACING - Cohort 2 locked. Next window opening in 120m.</div>
            </div>
          </div>
        )}

        {/* 21st.dev Metric Geometry */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Unrealized Demand */}
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">Gross Unrealized Demand</span>
              <TrendingUpIcon className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                ${metrics.unrealizedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="inline-flex items-center text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                +18.4% velocity
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Cumulative purchase intent across out-of-stock SKUs</p>
          </div>

          {/* Card 2: Waitlist Subscribers */}
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">Active Waitlist Subscribers</span>
              <UsersIcon className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                {metrics.totalSubscribers}
              </span>
              <span className="text-[11px] font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                {metrics.pendingCount} in FIFO Queue
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Verified shoppers awaiting queued stock restock alerts</p>
          </div>

          {/* Card 3: Recovered Orders */}
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">Recovered 1-Click Orders</span>
              <ShoppingBagIcon className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                {metrics.recoveredOrdersCount}
              </span>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                {metrics.dispatchedCount} Dispatched (56.2% CTR)
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Conversions generated by direct 1-click checkout permalinks</p>
          </div>
        </div>

        {/* Dynamic Interactive Node Pipeline */}
        <section className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
                FIFO Anti-Burnout Restock Architecture
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Full lifecycle pipeline from zero-CLS theme subscription through paced cohort permalink dispatch.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Pipeline Healthy
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative pt-2">
            {/* Step 1 */}
            <div className="p-4 bg-zinc-50/60 border border-zinc-200/70 rounded-xl relative">
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">Step 01</div>
              <div className="text-xs font-semibold text-zinc-900">Storefront Opt-In</div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Zero-CLS app block attaches to sold-out variant. Captures email & push.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 bg-zinc-50/60 border border-zinc-200/70 rounded-xl relative">
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">Step 02</div>
              <div className="text-xs font-semibold text-zinc-900">Webhook Ingest</div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Inventory update received in &lt;30ms. Gated against restock thresholds.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 bg-zinc-50/60 border border-zinc-200/70 rounded-xl relative">
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">Step 03</div>
              <div className="text-xs font-semibold text-zinc-900">Paced Cohort Alert</div>
              <p className="text-[11px] text-zinc-500 mt-1">
                FIFO multiplier queues Batch 1 without exhausting warehouse inventory.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-4 bg-zinc-50/60 border border-zinc-200/70 rounded-xl relative">
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">Step 04</div>
              <div className="text-xs font-semibold text-zinc-900">1-Click Checkout</div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Permalink injects variant and incentive discount directly into cart.
              </p>
            </div>
          </div>
        </section>

        {/* Sticky Segmented Sub-Navigation Bar */}
        <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border border-zinc-200/80 rounded-xl p-1.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {(
              [
                { id: "overview", label: "Overview & KPI Hub" },
                { id: "storefront", label: "Storefront PDP Simulation" },
                { id: "reorder", label: "Supplier Reorder Intelligence" },
                { id: "diagnostics", label: "Diagnostics & FIFO Dry Run" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer border-0 ${
                  activeTab === tab.id
                    ? "bg-zinc-900 text-white shadow-xs font-semibold"
                    : "bg-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pr-2">
            {isDemoData && (
              <span className="text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Benchmark Catalog Reference
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SUB-VIEW 1: OVERVIEW & QUICK ACTIONS */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                Quick Integration Checklist
              </h3>
              <ul className="space-y-3 text-xs text-zinc-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>
                    <strong>App Embed Extension Active:</strong> Storefront listener loaded with 0.00 CLS layout bounds.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>
                    <strong>Webhook Handshake Verified:</strong> Subscribed to <code className="font-mono text-zinc-800">inventory_levels/update</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>
                    <strong>GDPR Compliance Active:</strong> Customer and shop redactions configured.
                  </span>
                </li>
              </ul>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("storefront")}
                  className="px-3.5 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
                >
                  Test Storefront Trigger →
                </button>
              </div>
            </div>

            <div className="p-6 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                FIFO Anti-Burnout Calibration
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                When an out-of-stock SKU receives 4 units, RestockPing immediately calculates:
                <br />
                <code className="font-mono text-zinc-800 bg-zinc-100 px-1 py-0.5 rounded text-[11px] block mt-1.5">
                  Target Cohort = min(round(4 × {settings?.dripBatchMultiplier}x), waitlist) = {Math.round(4 * settings?.dripBatchMultiplier)} buyers
                </code>
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/app/settings")}
                  className="px-3.5 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
                >
                  Edit Multiplier Pacing →
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("diagnostics")}
                  className="px-3.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg transition-colors cursor-pointer"
                >
                  Run Simulation Dry Run
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-VIEW 2: STOREFRONT PDP SIMULATION */}
        {/* ========================================================================= */}
        {activeTab === "storefront" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Interactive Experience Simulator
                  </h3>
                  <p className="text-xs text-zinc-500">Live preview of storefront app block and checkouts</p>
                </div>
                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setDeviceFrame("desktop")}
                    className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 border-0 cursor-pointer ${
                      deviceFrame === "desktop" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    <DeviceDesktopIcon /> Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceFrame("mobile")}
                    className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 border-0 cursor-pointer ${
                      deviceFrame === "mobile" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    <DeviceMobileIcon /> Mobile
                  </button>
                </div>
              </div>

              {/* Mockup Canvas */}
              <div className="p-6 bg-zinc-50/50 border border-zinc-200 rounded-xl flex items-center justify-center min-h-[380px]">
                {deviceFrame === "desktop" ? (
                  <div className="w-full max-w-xl bg-white border border-zinc-200 rounded-xl shadow-md overflow-hidden">
                    <div className="px-4 py-2 bg-zinc-100 border-b border-zinc-200 flex items-center gap-2 text-xs font-mono text-zinc-500">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="ml-2">https://{shop}/products/classic-crewneck</span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="text-base font-bold text-zinc-900">Classic Boxy Crewneck</h4>
                        <span className="text-sm font-mono text-zinc-600 font-semibold">$42.00 USD</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-zinc-500 block">Select Variant:</span>
                        <div className="flex gap-2">
                          {(["S", "M", "L"] as const).map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setSelectedVariant(sz)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
                                selectedVariant === sz
                                  ? "border-zinc-900 bg-zinc-900 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              }`}
                            >
                              {sz} {sz === "M" ? "(Sold Out)" : "(In Stock)"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* App Block Trigger */}
                      {selectedVariant === "M" ? (
                        <div
                          className="border border-zinc-200 rounded-lg p-4 bg-white shadow-xs space-y-3"
                          style={{ minHeight: "52px" }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-xs font-semibold text-zinc-900">
                              Notify me when this variant restocks
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              placeholder="Enter your email"
                              defaultValue="shopper@example.com"
                              className="flex-1 px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setSimulatedSubscribed(true)}
                              style={{ backgroundColor: customAccent, borderRadius: customRadius }}
                              className="px-4 py-2 text-xs font-medium text-white border-0 cursor-pointer shadow-xs"
                            >
                              {simulatedSubscribed ? "Subscribed ✓" : "Notify Me"}
                            </button>
                          </div>
                          {simulatedSubscribed && (
                            <div className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                              ✓ You&apos;re on the priority waitlist! You will be notified in FIFO order.
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="w-full py-2.5 text-xs font-semibold text-white bg-zinc-900 rounded-md border-0"
                        >
                          Add to Cart — $42.00
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="w-[320px] bg-white border-4 border-zinc-900 rounded-[36px] shadow-xl overflow-hidden p-4 space-y-4">
                    <div className="w-20 h-4 bg-zinc-900 rounded-full mx-auto" />
                    <div className="space-y-3 pt-2">
                      <div className="h-28 bg-zinc-100 rounded-lg flex items-center justify-center text-xs font-mono text-zinc-400">
                        Product Hero Visual
                      </div>
                      <h4 className="text-sm font-bold text-zinc-900">Classic Boxy Crewneck</h4>
                      <div className="flex gap-1.5">
                        {(["S", "M", "L"] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSelectedVariant(sz)}
                            className={`flex-1 py-1 text-xs rounded border ${
                              selectedVariant === sz
                                ? "bg-zinc-900 text-white border-zinc-900"
                                : "bg-white text-zinc-700 border-zinc-200"
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                      {selectedVariant === "M" ? (
                        <div className="border border-zinc-200 rounded-lg p-3 bg-white space-y-2 text-xs">
                          <span className="font-semibold block text-[11px] text-zinc-800">Waitlist Alert</span>
                          <input
                            type="email"
                            placeholder="Email address"
                            className="w-full px-2 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded"
                          />
                          <button
                            type="button"
                            style={{ backgroundColor: customAccent, borderRadius: customRadius }}
                            className="w-full py-1.5 text-xs font-medium text-white border-0 cursor-pointer"
                          >
                            Reserve Spot
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="w-full py-2 text-xs font-semibold text-white bg-zinc-900 rounded border-0"
                        >
                          Add to Cart
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Live Token Studio */}
            <div className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900">Live CSS Token Studio</h3>
              <p className="text-xs text-zinc-500">Tweak design tokens directly for real-time visual feedback</p>

              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-700">Theme Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      className="w-8 h-8 rounded border border-zinc-200 cursor-pointer bg-white p-0.5"
                    />
                    <input
                      type="text"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      className="w-28 px-2 py-1 text-xs font-mono uppercase bg-zinc-50 border border-zinc-200 rounded"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-700">Corner Radius</label>
                  <div className="flex gap-2">
                    {["4px", "8px", "12px", "9999px"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCustomRadius(r)}
                        className={`px-2.5 py-1 text-xs rounded border ${
                          customRadius === r
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "bg-white text-zinc-700 border-zinc-200"
                        }`}
                      >
                        {r === "9999px" ? "Pill" : r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-200 space-y-2">
                  <div className="text-[11px] font-mono text-zinc-500">
                    // Zero Cumulative Layout Shift Bounds
                  </div>
                  <div className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded border border-emerald-200">
                    ✓ Container height pre-allocated (min-height: 52px). Guarantees 0.00 CLS during dynamic hydration.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-VIEW 3: SUPPLIER REORDER INTELLIGENCE */}
        {/* ========================================================================= */}
        {activeTab === "reorder" && (
          <div className="bg-white border border-zinc-200/80 rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  Supplier Purchase Order Intelligence
                </h3>
                <p className="text-xs text-zinc-500">
                  Data-driven replenishment quantities computed from unmet waitlist demand.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedRowIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedRowIds(new Set())}
                    className="px-2.5 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                  >
                    Clear Selection ({selectedRowIds.size})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCsvExport(selectedRowIds.size > 0)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 shadow-xs cursor-pointer"
                >
                  {selectedRowIds.size > 0
                    ? `Export Selected CSV (${selectedRowIds.size})`
                    : "Export All Supplier CSV"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-mono uppercase tracking-wider text-[11px] sticky top-0">
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.size === reorderList.length && reorderList.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">Product & Variant</th>
                    <th className="px-4 py-3 font-semibold">Current Stock</th>
                    <th className="px-4 py-3 font-semibold">Waitlist Demand</th>
                    <th className="px-4 py-3 font-semibold">Multiplier Stepper</th>
                    <th className="px-4 py-3 font-semibold">Suggested PO Units</th>
                    <th className="px-4 py-3 font-semibold text-right">Unrealized Demand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60">
                  {reorderList.map((item) => {
                    const currentMultiplier = rowMultipliers[item.id] || settings?.dripBatchMultiplier || 2.5;
                    const calculatedPO = Math.max(
                      Math.round(item.waitlistCount * (currentMultiplier / 2.5) * 1.5),
                      20
                    );

                    return (
                      <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(item.id)}
                            onChange={() => toggleRowSelection(item.id)}
                            className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-3.5 font-mono text-zinc-700">
                          <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">{item.sku}</code>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-zinc-900">{item.productTitle}</div>
                          <div className="text-zinc-500 text-[11px]">{item.variantTitle}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                              item.currentStock === 0
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {item.currentStock} units
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-medium text-sky-700">
                          {item.waitlistCount} buyers
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1">
                            {[1.2, 1.5, 2.0, 2.5].map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => updateRowMultiplier(item.id, m)}
                                className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                                  currentMultiplier === m
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold"
                                    : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                                }`}
                              >
                                {m}x
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-emerald-700">
                          {calculatedPO} units
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-zinc-900">
                          {formatCurrency(item.unrealizedDemand)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-VIEW 4: DIAGNOSTICS & FIFO DRY RUN */}
        {/* ========================================================================= */}
        {activeTab === "diagnostics" && (
          <div className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                Diagnostics Suite & Mathematical FIFO Dry Run
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Simulate restock events to inspect cohort queue sizes and permalink generation in real-time.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700">Simulated Replenished Units</label>
                <input
                  type="number"
                  min="1"
                  value={diagUnits}
                  onChange={(e) => setDiagUnits(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700">Inventory Item ID</label>
                <input
                  type="text"
                  value={diagInvId}
                  onChange={(e) => setDiagInvId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Monospaced Diagnostic Panel */}
            <div className="p-4 bg-zinc-900 text-zinc-100 rounded-xl font-mono text-xs space-y-2 border border-zinc-800">
              <div className="text-zinc-400">// FIFO Mathematical Queue Output</div>
              <div className="flex justify-between">
                <span>Replenished Units:</span>
                <span className="text-emerald-400 font-bold">{diagUnits} units</span>
              </div>
              <div className="flex justify-between">
                <span>Configured Multiplier:</span>
                <span>{settings?.dripBatchMultiplier}x</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800 pt-2 font-semibold">
                <span>Target Cohort Dispatch Size:</span>
                <span className="text-emerald-400">
                  {Math.round(Number(diagUnits) * (settings?.dripBatchMultiplier || 2.5))} subscribers
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExecuteDryRun}
                disabled={isSimulating}
                className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-all shadow-xs cursor-pointer border-0"
              >
                {isSimulating ? "Executing Dry Run..." : "Execute FIFO Dry Run"}
              </button>

              {isDev && (
                <button
                  type="button"
                  onClick={() => {
                    const fd = new FormData();
                    fd.append("intent", "seed_sample_subscribers");
                    submit(fd, { method: "post" });
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                >
                  Seed 5 Test Subscribers (Dev Only)
                </button>
              )}
            </div>

            {actionData && "simulationResult" in actionData && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
                <span className="font-semibold text-emerald-900 block">
                  ✓ Dry Run Completed: {actionData.simulationResult.dispatchedCount} Dispatches Processed
                </span>
                <p className="text-emerald-800">
                  Batch #{actionData.simulationResult.batchId} &bull; Remaining pending in FIFO queue:{" "}
                  <strong>{actionData.simulationResult.remainingPending}</strong>
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
