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
    <div className="min-h-screen bg-[#f1f1f1] pb-24 font-sans text-[#303030]">
      <ui-title-bar title="Restock Overview">
        <button variant="primary" onClick={handleThemeDeepLink}>
          Add to Theme Editor
        </button>
        <button onClick={() => navigate("/app/settings")}>
          Settings
        </button>
      </ui-title-bar>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Polaris Status Banner */}
        <div className="bg-white border border-[#e1e3e5] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#303030]">
                  Automatic Restock Alerts: Running
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e3f1df] text-[#1a5c2e] border border-[#c1e5ba]">
                  Smart Protection Active
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f1f1f1] text-[#616161] border border-[#e1e3e5]">
                  Paced 2 Hours Apart
                </span>
              </div>
              <p className="text-xs text-[#616161] mt-0.5">
                Connected to store inventory · Automatically checks and sends alerts when stock is added
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/app/subscribers?status=DISPATCHED")}
              className="px-3 py-1.5 text-xs font-medium text-[#303030] bg-white border border-[#c9cccf] rounded-lg shadow-xs hover:bg-[#f6f6f7] transition-all cursor-pointer"
            >
              View Alert History
            </button>
            <button
              onClick={() => navigate("/app/settings")}
              className="px-3 py-1.5 text-xs font-medium text-[#303030] bg-white border border-[#c9cccf] rounded-lg shadow-xs hover:bg-[#f6f6f7] transition-all cursor-pointer"
            >
              Alert Settings
            </button>
          </div>
        </div>

        {/* 3 Metric Cards: Exact Shopify Admin Analytics Polaris Tokens */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Potential Waitlist Revenue */}
          <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#616161]">
                  Potential Waitlist Revenue
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    isWaitlistActive
                      ? "bg-[#e3f1df] text-[#1a5c2e] border-[#c1e5ba]"
                      : "bg-[#f1f1f1] text-[#616161] border-[#e1e3e5]"
                  }`}
                >
                  {isWaitlistActive ? "Active Demand" : "All Caught Up"}
                </span>
              </div>
              <div className="flex items-baseline gap-0.5 mt-1">
                <span className="text-[28px] font-semibold text-[#303030] tracking-[-0.03em] leading-8 tabular-nums font-sans">
                  ${Number(totalPotentialRevenue || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <p className="text-xs text-[#616161] mt-2 leading-normal">
              {isWaitlistActive
                ? "Total value of products shoppers are waiting to purchase"
                : "All restock requests have been notified and cleared"}
            </p>
          </div>

          {/* Card 2: Customers Waiting */}
          <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#616161]">
                  Customers Waiting
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    isWaitlistActive
                      ? "bg-[#e3f1df] text-[#1a5c2e] border-[#c1e5ba]"
                      : "bg-[#f1f1f1] text-[#616161] border-[#e1e3e5]"
                  }`}
                >
                  {isWaitlistActive ? "Ready to Notify" : "Waitlist Clear"}
                </span>
              </div>
              <div className="flex items-baseline gap-0.5 mt-1">
                <span className="text-[28px] font-semibold text-[#303030] tracking-[-0.03em] leading-8 tabular-nums font-sans">
                  {metrics.pendingCount}
                </span>
              </div>
            </div>
            <p className="text-xs text-[#616161] mt-2 leading-normal">
              {isWaitlistActive
                ? "Shoppers waiting to be notified when items are restocked"
                : "No customers currently waiting for sold-out items"}
            </p>
          </div>

          {/* Card 3: Recovered Sales */}
          <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#616161]">
                  Recovered Sales
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f1f1f1] text-[#616161] border border-[#e1e3e5]">
                  {metrics.dispatchedCount > 0
                    ? `${metrics.dispatchedCount} Sent (Awaiting Order)`
                    : "No Alerts Sent Yet"}
                </span>
              </div>
              <div className="flex items-baseline gap-0.5 mt-1">
                <span className="text-[28px] font-semibold text-[#303030] tracking-[-0.03em] leading-8 tabular-nums font-sans">
                  {metrics.convertedCount}
                </span>
              </div>
            </div>
            <p className="text-xs text-[#616161] mt-2 leading-normal">
              Orders placed directly through 1-click instant checkout links
            </p>
          </div>
        </div>

        {/* Dense Polaris Two-Column Layout (8 col main / 4 col sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Main Column (8 cols): High Priority Operations */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top In-Demand SKUs Table */}
            <TopDemandProducts products={topDemandList} />

            {/* Step-by-Step Customer Journey */}
            <LivePipelineNodes pendingCount={metrics.pendingCount} />
          </div>

          {/* Sidebar Column (4 cols): Restock Protection Engine & Storefront Health */}
          <div className="lg:col-span-4 space-y-4">
            {/* Restock Protection Engine Card */}
            <div className="p-5 bg-white border border-[#e1e3e5] rounded-xl shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#303030]">
                    Restock Protection
                  </h3>
                  <p className="text-xs text-[#616161] mt-0.5">
                    Prevents instant stockout surges
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e3f1df] text-[#1a5c2e] border border-[#c1e5ba]">
                  Active
                </span>
              </div>

              {isWaitlistActive ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg text-xs font-medium">
                    <span className="px-2.5 py-1 bg-white border border-[#c9cccf] rounded text-[#303030]">
                      4 Restocked
                    </span>
                    <span className="text-[#616161]">×</span>
                    <span className="px-2.5 py-1 bg-white border border-[#c9cccf] rounded text-[#303030]">
                      {multiplier}x Safe Multiplier
                    </span>
                    <span className="text-[#616161]">→</span>
                    <span className="px-2.5 py-1 bg-[#e3f1df] border border-[#c1e5ba] text-[#1a5c2e] rounded flex items-center gap-1.5 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      Notifies {calculatedSafeBatch} Customers
                    </span>
                  </div>
                  <p className="text-xs text-[#616161] leading-relaxed">
                    Shoppers are notified in controlled cohorts so multiple buyers don't race to checkout and experience immediate "Sold Out" frustration.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg text-xs text-[#616161] flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#e3f1df] text-[#1a5c2e] flex items-center justify-center font-bold text-xs shrink-0">
                    ✓
                  </div>
                  <div>
                    <span className="font-semibold text-[#303030] block">
                      All caught up! Waitlist is clear.
                    </span>
                    <span className="text-[#616161]">
                      When customers sign up for sold-out items, RestockPing will automatically schedule safe alerts upon restock.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Storefront & Automation Status */}
            <div className="p-5 bg-white border border-[#e1e3e5] rounded-xl shadow-xs space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#303030]">
                Storefront Integration
              </h3>
              <div className="divide-y divide-[#e1e3e5] text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#616161]">Inventory Sync</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live & Connected
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#616161]">Batch Multiplier</span>
                  <span className="font-medium text-[#303030]">{multiplier}x inventory</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#616161]">Pause Interval</span>
                  <span className="font-medium text-[#303030]">{settings.dripIntervalMinutes || 120} minutes</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#616161]">Store Domain</span>
                  <span className="font-medium text-[#303030] truncate max-w-[150px]">{shop}</span>
                </div>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => navigate("/app/subscribers")}
                  className="w-full py-2 px-3 text-xs font-medium text-[#303030] bg-[#f6f6f7] hover:bg-[#e1e3e5] border border-[#c9cccf] rounded-lg transition-all text-center cursor-pointer"
                >
                  Manage All Subscribers →
                </button>
                <button
                  onClick={handleThemeDeepLink}
                  className="w-full py-2 px-3 text-xs font-medium text-[#005bd3] bg-white hover:bg-slate-50 border border-[#c9cccf] rounded-lg transition-all text-center cursor-pointer"
                >
                  Customize Button in Theme
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
