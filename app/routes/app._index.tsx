import React from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateConversionMetrics } from "../services/fifoEngine.server";
import { TopDemandProducts, type ProductDemand } from "../components/TopDemandProducts";
import { LivePipelineNodes } from "../components/LivePipelineNodes";

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

    // Group top demand items
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
  const multiplier = Number(settings?.dripBatchMultiplier) || 2.5;
  const sampleRestocked = 4;
  const calculatedBatch = Math.min(
    Math.round(sampleRestocked * multiplier),
    isWaitlistActive ? metrics.pendingCount : Math.round(sampleRestocked * multiplier)
  );

  const handleThemeDeepLink = () => {
    window.open(`https://${shop}/admin/themes/current/editor?template=product`, "_blank");
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-16 font-sans text-[#202223] antialiased">
      <ui-title-bar title="Restock Overview">
        <button variant="primary" onClick={handleThemeDeepLink}>
          Add to Theme Editor
        </button>
        <button onClick={() => navigate("/app/settings")}>Settings</button>
      </ui-title-bar>

      <main className="max-w-[1200px] mx-auto px-4 py-4 space-y-3">
        {/* Compact Status Banner (Matches Analytics Filter Bar) */}
        <div className="bg-white border border-[#e1e3e5] rounded-lg px-3.5 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#008060] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#008060]" />
            </span>
            <span className="text-xs font-semibold text-[#202223]">
              Automatic restock alerts running
            </span>
            <span className="text-[#8c9196] text-xs">·</span>
            <span className="text-xs text-[#616161]">
              Paced 2 hours apart ({multiplier}x protection active)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/app/subscribers?status=DISPATCHED")}
              className="px-2.5 py-1 text-xs font-medium text-[#202223] hover:bg-[#f6f6f7] border border-[#d2d5d8] rounded-md transition-colors cursor-pointer"
            >
              Alert history
            </button>
            <button
              onClick={() => navigate("/app/settings")}
              className="px-2.5 py-1 text-xs font-medium text-[#202223] hover:bg-[#f6f6f7] border border-[#d2d5d8] rounded-md transition-colors cursor-pointer"
            >
              Pacing settings
            </button>
          </div>
        </div>

        {/* 3 Metric Cards: 1:1 Shopify Analytics Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: Potential Waitlist Revenue */}
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-normal text-[#616161]">
                Potential waitlist revenue
              </span>
              <span className="text-[11px] font-medium text-[#616161] bg-[#f1f2f4] px-1.5 py-0.5 rounded">
                {isWaitlistActive ? "Active" : "All caught up"}
              </span>
            </div>
            <div className="text-[20px] font-semibold text-[#202223] leading-6 tracking-[-0.01em] tabular-nums mt-1 font-sans">
              ${totalPotentialRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              {isWaitlistActive ? "Customer intent across sold-out items" : "All requests notified and cleared"}
            </div>
          </div>

          {/* Card 2: Customers Waiting */}
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-normal text-[#616161]">
                Customers waiting
              </span>
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                isWaitlistActive ? "bg-[#e3f1df] text-[#008060]" : "bg-[#f1f2f4] text-[#616161]"
              }`}>
                {isWaitlistActive ? "Ready" : "Clear"}
              </span>
            </div>
            <div className="text-[20px] font-semibold text-[#202223] leading-6 tracking-[-0.01em] tabular-nums mt-1 font-sans">
              {metrics.pendingCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              {isWaitlistActive ? "Shoppers awaiting restock notification" : "No customers currently in queue"}
            </div>
          </div>

          {/* Card 3: Recovered Sales */}
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-normal text-[#616161]">
                Recovered sales
              </span>
              <span className="text-[11px] font-medium text-[#616161] bg-[#f1f2f4] px-1.5 py-0.5 rounded">
                {metrics.dispatchedCount > 0 ? `${metrics.dispatchedCount} sent` : "0 sent"}
              </span>
            </div>
            <div className="text-[20px] font-semibold text-[#202223] leading-6 tracking-[-0.01em] tabular-nums mt-1 font-sans">
              {metrics.convertedCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              Orders placed via 1-click checkout links
            </div>
          </div>
        </div>

        {/* 2-Column Balanced Grid (High Density) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Left Column (7 of 12 cols): Top Requested SKUs */}
          <div className="lg:col-span-7">
            <TopDemandProducts products={topDemandList} />
          </div>

          {/* Right Column (5 of 12 cols): Restock Protection Simulator */}
          <div className="lg:col-span-5 p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#202223]">
                Restock protection
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e3f1df] text-[#008060]">
                Active ({multiplier}x)
              </span>
            </div>

            {isWaitlistActive ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#f6f6f7] border border-[#e1e3e5] rounded text-xs font-normal text-[#202223]">
                  <span className="px-1.5 py-0.5 bg-white border border-[#d2d5d8] rounded font-medium">
                    4 units added
                  </span>
                  <span className="text-[#8c9196]">×</span>
                  <span className="px-1.5 py-0.5 bg-white border border-[#d2d5d8] rounded font-medium">
                    {multiplier}x
                  </span>
                  <span className="text-[#8c9196]">→</span>
                  <span className="px-1.5 py-0.5 bg-[#e3f1df] text-[#008060] rounded font-semibold">
                    Notifies {calculatedBatch} shoppers
                  </span>
                </div>
                <p className="text-[11px] text-[#616161] leading-relaxed">
                  Paced dispatch prevents inventory burnout so shoppers don't encounter immediate stockouts.
                </p>
              </div>
            ) : (
              <div className="p-2.5 bg-[#f6f6f7] border border-[#e1e3e5] rounded text-xs text-[#202223] flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#e3f1df] text-[#008060] flex items-center justify-center font-bold text-[11px] shrink-0">
                  ✓
                </div>
                <div className="text-[11px] leading-snug">
                  <span className="font-medium block text-[#202223]">Waitlist is clear.</span>
                  <span className="text-[#616161]">
                    Restocked items will automatically alert customers in safe {multiplier}x batches.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compact 4-Step Pipeline */}
        <LivePipelineNodes pendingCount={metrics.pendingCount} />
      </main>
    </div>
  );
}
