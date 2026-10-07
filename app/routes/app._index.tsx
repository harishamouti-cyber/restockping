import React from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateConversionMetrics } from "../services/fifoEngine.server";
import { LivePipelineNodes } from "../components/LivePipelineNodes";
import { TopDemandProducts, type ProductDemand } from "../components/TopDemandProducts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const [settingsRecord, subscribers] = await Promise.all([
      db.restockSettings.findUnique({ where: { shop } }),
      db.restockSubscription.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const settings = settingsRecord || {
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
      minRestockThreshold: 1,
    };

    const metrics = calculateConversionMetrics(subscribers || []);

    // Group top demand items by variant for the micro-table
    const pendingSubscribers = (subscribers || []).filter((s) => s.status === "PENDING");
    const demandMap = new Map<string, ProductDemand>();
    for (const sub of pendingSubscribers) {
      const key = sub.variantId;
      if (!demandMap.has(key)) {
        demandMap.set(key, {
          productId: sub.productId,
          variantId: sub.variantId,
          productTitle: sub.productTitle || "Product",
          variantTitle: sub.variantTitle || "Default Title",
          price: Number(sub.priceSnapshot) || 0,
          subscribersCount: 0,
          totalDemand: 0,
        });
      }
      const item = demandMap.get(key)!;
      item.subscribersCount += 1;
      item.totalDemand += Number(sub.priceSnapshot) || 0;
    }
    const topDemandList = Array.from(demandMap.values())
      .sort((a, b) => b.totalDemand - a.totalDemand)
      .slice(0, 5);

    const totalPotentialRevenue = pendingSubscribers.reduce(
      (sum, s) => sum + (Number(s.priceSnapshot) || 0),
      0
    );

    return json({
      shop,
      settings,
      metrics,
      totalPotentialRevenue,
      topDemandList,
    });
  } catch (err) {
    console.error("[app._index loader error]:", err);
    return json({
      shop,
      settings: {
        dripBatchMultiplier: 2.5,
        dripIntervalMinutes: 120,
        minRestockThreshold: 1,
      },
      metrics: {
        totalRegistered: 0,
        pendingCount: 0,
        dispatchedCount: 0,
        convertedCount: 0,
        ctrPercentage: null,
        ctrBadgeLabel: "No alerts sent yet",
        isCtrActive: false,
        hasOrders: false,
      },
      totalPotentialRevenue: 0,
      topDemandList: [] as ProductDemand[],
    });
  }
};

export default function RestockOverview() {
  const { shop, settings, metrics, totalPotentialRevenue, topDemandList } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const isWaitlistActive = metrics.pendingCount > 0;
  const sampleRestocked = 4;
  const multiplier = Number(settings?.dripBatchMultiplier) || 2.5;
  const calculatedSafeBatch = Math.min(
    Math.round(sampleRestocked * multiplier),
    isWaitlistActive ? metrics.pendingCount : Math.round(sampleRestocked * multiplier)
  );

  const handleThemeDeepLink = () => {
    window.open(`https://${shop}/admin/themes/current/editor?template=product`, "_blank");
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-28 font-sans text-slate-900">
      <ui-title-bar title="Restock Overview">
        <button variant="primary" onClick={handleThemeDeepLink}>
          Add to Theme Editor
        </button>
        <button onClick={() => navigate("/app/settings")}>
          Settings
        </button>
      </ui-title-bar>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Dribbble-Style Ambient Status Hero Banner */}
        <div className="bg-gradient-to-r from-emerald-50/60 via-teal-50/30 to-white border border-emerald-100 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 tracking-tight">
                  Automatic Restock Alerts: Running
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100/70 text-emerald-800 ring-1 ring-emerald-600/20">
                  Smart Protection Active
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                  Paced 2 Hours Apart
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Connected to store inventory · Automatically checks and sends alerts when stock is added
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate("/app/subscribers?status=DISPATCHED")}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200/80 rounded-xl shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
            >
              View Alert History
            </button>
            <button
              onClick={() => navigate("/app/settings")}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200/80 rounded-xl shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
            >
              Alert Settings
            </button>
          </div>
        </div>

        {/* 3 Metric Cards: Dribbble Polish with Equal Baselines */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Potential Waitlist Revenue */}
          <div className="p-6 bg-white border border-slate-200/70 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-400">
                  Potential Waitlist Revenue
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${
                    isWaitlistActive
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-500/20"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {isWaitlistActive ? "Active Demand" : "All Caught Up"}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
                ${Number(totalPotentialRevenue || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 min-h-[32px] leading-relaxed">
              {isWaitlistActive
                ? "Total value of products shoppers are waiting to purchase"
                : "All restock requests have been notified and cleared"}
            </p>
          </div>

          {/* Card 2: Customers Waiting */}
          <div className="p-6 bg-white border border-slate-200/70 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-400">
                  Customers Waiting
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${
                    isWaitlistActive
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-500/20"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {isWaitlistActive ? "Ready to Notify" : "Waitlist Clear"}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
                {metrics.pendingCount}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 min-h-[32px] leading-relaxed">
              {isWaitlistActive
                ? "Shoppers waiting to be notified when items are restocked"
                : "No customers currently waiting for sold-out items"}
            </p>
          </div>

          {/* Card 3: Recovered Sales */}
          <div className="p-6 bg-white border border-slate-200/70 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-400">
                  Recovered Sales
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                  {metrics.dispatchedCount > 0
                    ? `${metrics.dispatchedCount} Sent (Awaiting Order)`
                    : "No Alerts Sent Yet"}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
                {metrics.convertedCount}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 min-h-[32px] leading-relaxed">
              Orders placed directly through 1-click instant checkout links
            </p>
          </div>
        </div>

        {/* How RestockPing Protects Your Store (Dynamic Mobbin Card) */}
        <div className="p-6 bg-white border border-slate-200/70 rounded-2xl shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-700">
              How RestockPing Protects Your Inventory
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              Protection Active
            </span>
          </div>

          {isWaitlistActive ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5 p-3.5 bg-slate-50/80 border border-slate-200/60 rounded-xl text-xs font-mono">
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold shadow-xs">
                  4 Units Restocked
                </span>
                <span className="text-slate-400 font-bold">×</span>
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold shadow-xs">
                  {multiplier}x Safe Multiplier
                </span>
                <span className="text-slate-400 font-bold">→</span>
                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold rounded-lg shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Notifies {calculatedSafeBatch} {calculatedSafeBatch === 1 ? "Customer" : "Customers"} Immediately
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Notifications are sent in controlled groups so multiple shoppers do not rush to purchase the same single restocked item and hit a sudden stockout.
              </p>
            </>
          ) : (
            <div className="p-4 bg-slate-50/80 border border-slate-200/60 rounded-xl text-xs text-slate-600 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100/70 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                ✓
              </div>
              <div>
                <span className="font-semibold text-slate-900 block">
                  All caught up! No shoppers are currently waiting.
                </span>
                <span className="text-slate-500">
                  When a customer joins your waitlist, RestockPing will automatically schedule safe, paced notifications the moment you add new inventory.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Requested SKUs Micro-Table */}
        <TopDemandProducts products={topDemandList} />

        {/* Step-by-Step Customer Journey (Zero DSA Jargon) */}
        <LivePipelineNodes pendingCount={metrics.pendingCount} />
      </main>
    </div>
  );
}
