import React from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateConversionMetrics, calculateVelocityMetrics } from "../services/fifoEngine.server";
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
    const velocity = calculateVelocityMetrics(subscribers || []);

    // Sum potential revenue from all pending waitlist subscribers
    const totalPotentialRevenue = (subscribers || [])
      .filter((s) => s.status === "PENDING")
      .reduce((sum, s) => sum + (Number(s.priceSnapshot) || 0), 0);

    // Aggregate top in-demand out-of-stock SKUs
    const demandByVariant = new Map<string, ProductDemand>();

    for (const sub of subscribers || []) {
      if (sub.status === "PENDING") {
        const key = `${sub.productId}_${sub.variantId}`;
        const existing = demandByVariant.get(key);
        const unitPrice = Number(sub.priceSnapshot) || 0;
        if (existing) {
          existing.subscribersCount += 1;
          existing.totalDemand += unitPrice;
        } else {
          demandByVariant.set(key, {
            productId: sub.productId,
            variantId: sub.variantId,
            productTitle: sub.productTitle || "Product",
            variantTitle: sub.variantTitle || "Default Title",
            price: unitPrice,
            subscribersCount: 1,
            totalDemand: unitPrice,
          });
        }
      }
    }

    const topDemandProducts = Array.from(demandByVariant.values())
      .sort((a, b) => b.totalDemand - a.totalDemand)
      .slice(0, 5);

    return json({
      shop,
      settings,
      metrics,
      velocity,
      totalPotentialRevenue,
      topDemandProducts,
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
      },
      velocity: {
        label: "First Request Recorded",
        isPositive: true,
        hasBaseline: false,
      },
      totalPotentialRevenue: 0,
      topDemandProducts: [] as ProductDemand[],
    });
  }
};

export default function RestockOverview() {
  const {
    shop,
    settings,
    metrics,
    velocity,
    totalPotentialRevenue,
    topDemandProducts,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Dynamic simulation for the human-readable explanation card
  const sampleRestockedUnits = 4;
  const multiplier = Number(settings?.dripBatchMultiplier) || 2.5;
  const currentWaiting = metrics.pendingCount;
  const calculatedBatch = Math.min(
    Math.round(sampleRestockedUnits * multiplier),
    currentWaiting > 0 ? currentWaiting : Math.round(sampleRestockedUnits * multiplier)
  );

  const handleDeepLinkToTheme = () => {
    window.open(`https://${shop}/admin/themes/current/editor?template=product`, "_blank");
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-zinc-900">
      <ui-title-bar title="Restock Overview">
        <button variant="primary" onClick={handleDeepLinkToTheme}>
          Add to Theme Editor
        </button>
        <button onClick={() => navigate("/app/settings")}>
          Settings
        </button>
      </ui-title-bar>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Status Strip: Plain Merchant English */}
        <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900 tracking-tight">
                  Smart Restock Pacing: Active
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  {multiplier}x Batch Pacing
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                  {settings?.dripIntervalMinutes || 120}m Pause Window
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-sans">
                Connected to store inventory · Next automatic stock check in 42m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/app/subscribers?status=DISPATCHED")}
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-lg shadow-xs hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Sent Alert Logs
            </button>
            <button
              onClick={() => navigate("/app/settings")}
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-lg shadow-xs hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Pacing Settings
            </button>
          </div>
        </div>

        {/* 21st.dev Metric Cards: Badges Aligned to Top-Right & Equalized Baselines */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Potential Waitlist Revenue */}
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
                  Potential Waitlist Revenue
                </span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center text-[11px] font-mono font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200 whitespace-nowrap">
                    {velocity.label === "First Cohort Baseline" ? "First Request" : velocity.label}
                  </span>
                  <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                ${Number(totalPotentialRevenue || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-2 min-h-[32px] leading-relaxed">
              Total value of products customers are waiting to buy
            </p>
          </div>

          {/* Card 2: Customers Waiting */}
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
                  Customers Waiting
                </span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 whitespace-nowrap">
                    Queue Ready
                  </span>
                  <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                {metrics.totalRegistered}
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-2 min-h-[32px] leading-relaxed">
              Shoppers waiting to be notified when items return to stock
            </p>
          </div>

          {/* Card 3: Recovered Sales */}
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
                  Recovered Sales
                </span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center text-[11px] font-mono font-medium px-2 py-0.5 rounded border whitespace-nowrap ${
                    metrics.isCtrActive
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200/60"
                      : "text-zinc-600 bg-zinc-100 border-zinc-200"
                  }`}>
                    {metrics.isCtrActive ? metrics.ctrBadgeLabel : "No alerts sent yet"}
                  </span>
                  <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                {metrics.convertedCount}
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-2 min-h-[32px] leading-relaxed">
              Orders placed directly through 1-click instant checkout links
            </p>
          </div>
        </div>

        {/* Visual Calculation Chips: Live Preview */}
        <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-700">
              How Your Alerts Will Send (Live Preview)
            </h3>
            <span className="inline-flex items-center text-[10px] font-mono font-medium text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
              Automatic Pacing Logic
            </span>
          </div>
          
          {/* Visual Flow Formula Chips */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-50 border border-zinc-200/70 rounded-lg text-xs font-mono">
            <span className="px-2.5 py-1 bg-white border border-zinc-200 rounded-md text-zinc-800 font-semibold shadow-xs">
              4 Units Restocked
            </span>
            <span className="text-zinc-400 font-bold">×</span>
            <span className="px-2.5 py-1 bg-white border border-zinc-200 rounded-md text-zinc-800 font-semibold shadow-xs">
              {settings.dripBatchMultiplier}x Pacing Multiplier
            </span>
            <span className="text-zinc-400 font-bold">→</span>
            <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold rounded-md shadow-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Notifies {calculatedBatch} {calculatedBatch === 1 ? "Customer" : "Customers"} Immediately
            </span>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            We pace alerts proportionally to available inventory so multiple customers don't rush the site for the same item and encounter an instant restock outage.
          </p>
        </div>

        {/* Top In-Demand Out-of-Stock SKUs Table */}
        <TopDemandProducts products={topDemandProducts || []} />

        {/* Automated Restock Journey (Step Cards) */}
        <LivePipelineNodes pendingCount={metrics.pendingCount} />
      </main>
    </div>
  );
}
