import React from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateConversionMetrics } from "../services/fifoEngine.server";
import { TopDemandProducts, type ProductDemand } from "../components/TopDemandProducts";
import { LivePipelineNodes } from "../components/LivePipelineNodes";
import { openThemeEditor, getThemeEditorUrl } from "../utils/themeDeepLink";

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

  const themeEditorUrl = getThemeEditorUrl(shop);

  const handleThemeDeepLink = () => {
    openThemeEditor(shop);
  };

  const [showSetupGuide, setShowSetupGuide] = React.useState(true);

  React.useEffect(() => {
    try {
      const dismissed = localStorage.getItem("restockping_setup_guide_dismissed");
      if (dismissed === "true") {
        setShowSetupGuide(false);
      }
    } catch {}
  }, []);

  const handleDismissSetup = () => {
    setShowSetupGuide(false);
    try {
      localStorage.setItem("restockping_setup_guide_dismissed", "true");
    } catch {}
  };

  const handleReopenSetup = () => {
    setShowSetupGuide(true);
    try {
      localStorage.removeItem("restockping_setup_guide_dismissed");
    } catch {}
  };

  const isStep1Done = metrics.totalRegistered > 0;
  const isStep2Done = Boolean(settings?.storeDisplayName || (settings as any)?.incentiveDiscountCode);
  const isStep3Done = metrics.dispatchedCount > 0;
  const completedSteps = [isStep1Done, isStep2Done, isStep3Done].filter(Boolean).length;

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
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#008060] shrink-0" />
            <span className="text-xs font-semibold text-[#202223]">
              Automatic restock alerts active
            </span>
            <span className="text-[#8c9196] text-xs">·</span>
            <span className="text-xs text-[#616161]">
              Connected to store inventory ({multiplier}x cohort pacing)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!showSetupGuide && (
              <button
                onClick={handleReopenSetup}
                className="px-2.5 py-1 text-xs font-medium text-[#005bd3] hover:bg-[#f6f6f7] border border-[#d2d5d8] rounded-md transition-colors cursor-pointer"
              >
                Setup guide
              </button>
            )}
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

        {/* Interactive 3-Step Merchant Setup Guide */}
        {showSetupGuide && (
          <div className="bg-white border border-[#e1e3e5] rounded-xl p-4 shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#e3f1df] text-[#008060] flex items-center justify-center text-xs font-bold shrink-0">
                  ⚡
                </span>
                <div>
                  <h3 className="text-xs font-semibold text-[#202223]">
                    Quick Start Setup Guide
                  </h3>
                  <span className="text-[11px] text-[#616161]">
                    Complete 3 simple steps to start converting out-of-stock shoppers into revenue.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-24 h-1.5 bg-[#f1f2f4] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(15, Math.round((completedSteps / 3) * 100))}%` }}
                      className="h-full bg-[#008060] transition-all duration-300"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-[#616161]">
                    {completedSteps} of 3 completed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDismissSetup}
                  className="text-xs font-medium text-[#616161] hover:text-[#202223] px-2 py-0.5 rounded hover:bg-[#f1f2f4] transition-colors cursor-pointer"
                  title="Dismiss setup guide"
                >
                  Dismiss
                </button>
              </div>
            </div>

            {/* 3 Steps Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Step 1 */}
              <div className={`p-3 rounded-lg border transition-all flex flex-col justify-between ${
                isStep1Done ? "bg-[#fbfcfd] border-[#e1e3e5]" : "bg-[#f0f7ff] border-[#b4dbff]"
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[#616161]">
                      Step 1
                    </span>
                    {isStep1Done ? (
                      <span className="text-[10px] font-semibold text-[#008060] bg-[#e3f1df] px-1.5 py-0.5 rounded">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-[#002b66] bg-[#dbeafe] px-1.5 py-0.5 rounded">
                        Action required
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-[#202223] mb-1">
                    Add button to theme
                  </h4>
                  <p className="text-[11px] text-[#616161] leading-relaxed">
                    Enable the RestockPing app block on product templates in Shopify Theme Editor.
                  </p>
                </div>
                <div className="mt-3">
                  <a
                    href={themeEditorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      handleThemeDeepLink();
                    }}
                    className="w-full text-center px-2.5 py-1 text-xs font-medium text-[#002b66] bg-white border border-[#b4dbff] rounded-md hover:bg-[#e0f0ff] transition-colors inline-block cursor-pointer shadow-2xs no-underline"
                  >
                    Open theme editor →
                  </a>
                </div>
              </div>

              {/* Step 2 */}
              <div className={`p-3 rounded-lg border transition-all flex flex-col justify-between ${
                isStep2Done ? "bg-[#fbfcfd] border-[#e1e3e5]" : "bg-white border-[#e1e3e5]"
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[#616161]">
                      Step 2
                    </span>
                    {isStep2Done ? (
                      <span className="text-[10px] font-semibold text-[#008060] bg-[#e3f1df] px-1.5 py-0.5 rounded">
                        ✓ Configured
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-[#616161] bg-[#f1f2f4] px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-[#202223] mb-1">
                    Brand email & discounts
                  </h4>
                  <p className="text-[11px] text-[#616161] leading-relaxed">
                    Customize your sender brand and add an auto-applied checkout discount code.
                  </p>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => navigate("/app/settings")}
                    className="w-full px-2.5 py-1 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors cursor-pointer shadow-2xs"
                  >
                    Configure settings →
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div className={`p-3 rounded-lg border transition-all flex flex-col justify-between ${
                isStep3Done ? "bg-[#fbfcfd] border-[#e1e3e5]" : "bg-white border-[#e1e3e5]"
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[#616161]">
                      Step 3
                    </span>
                    {isStep3Done ? (
                      <span className="text-[10px] font-semibold text-[#008060] bg-[#e3f1df] px-1.5 py-0.5 rounded">
                        ✓ Verified
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-[#616161] bg-[#f1f2f4] px-1.5 py-0.5 rounded">
                        Verification
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-[#202223] mb-1">
                    Send test alert email
                  </h4>
                  <p className="text-[11px] text-[#616161] leading-relaxed">
                    Verify transactional deliverability with real product photos to your inbox.
                  </p>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => navigate("/app/settings")}
                    className="w-full px-2.5 py-1 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors cursor-pointer shadow-2xs"
                  >
                    Send test email →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3 Metric Cards: Exact Shopify Analytics Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: Pending Waitlist Demand */}
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-normal text-[#616161]">
                Pending waitlist demand
              </span>
              <span className="text-[11px] font-medium text-[#616161] bg-[#f1f2f4] px-1.5 py-0.5 rounded">
                {isWaitlistActive ? "Active" : "All caught up"}
              </span>
            </div>
            {/* Clean, unslashed, normal round zero */}
            <div className="shopify-numeral mt-1">
              ${totalPotentialRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              {isWaitlistActive ? "Total retail value across waiting shoppers" : "All requests notified and cleared"}
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
            {/* Clean, unslashed, normal round zero */}
            <div className="shopify-numeral mt-1">
              {metrics.pendingCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              {isWaitlistActive ? "Shoppers awaiting restock notification" : "No shoppers currently waiting"}
            </div>
          </div>

          {/* Card 3: Alerts Dispatched */}
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-normal text-[#616161]">
                Alerts dispatched
              </span>
              <span className="text-[11px] font-medium text-[#616161] bg-[#f1f2f4] px-1.5 py-0.5 rounded">
                {metrics.dispatchedCount > 0 ? "Dispatched" : "No alerts yet"}
              </span>
            </div>
            {/* Clean, unslashed, normal round zero */}
            <div className="shopify-numeral mt-1">
              {metrics.dispatchedCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              Restock notifications sent to waitlist customers
            </div>
          </div>
        </div>

        {/* 2-Column Balanced Grid (High Density with Equalized Heights) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          {/* Left Column (7 of 12 cols): Top Requested SKUs */}
          <div className="lg:col-span-7 h-full">
            <TopDemandProducts products={topDemandList} />
          </div>

          {/* Right Column (5 of 12 cols): Restock Pacing Simulator Teaser */}
          <div className="lg:col-span-5 h-full p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[13px] font-medium text-[#202223]">
                  Restock alert pacing
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e3f1df] text-[#008060]">
                  Active ({multiplier}x cohort)
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
                    Paced dispatch spaces out demand cohorts so shoppers don't encounter sudden stockouts.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-[#f6f6f7] border border-[#e1e3e5] rounded-md text-xs text-[#202223] flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#e3f1df] text-[#008060] flex items-center justify-center font-bold text-[11px] shrink-0">
                    ✓
                  </div>
                  <div className="text-[11px] leading-snug">
                    <span className="font-medium block text-[#202223]">Waitlist is clear.</span>
                    <span className="text-[#616161]">
                      Restocked items will alert customers in paced {multiplier}x cohorts.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Pacing Summary Strip to Perfectly Balance Card Height */}
            <div className="pt-2.5 mt-2 border-t border-[#f1f2f4] flex items-center justify-between text-[11px] text-[#8c9196]">
              <span>Next check: <strong className="text-[#202223] font-medium">Automatic</strong></span>
              <span>Batch window: <strong className="text-[#202223] font-medium">2 hours</strong></span>
            </div>
          </div>
        </div>

        {/* Compact 4-Step Pipeline */}
        <LivePipelineNodes pendingCount={metrics.pendingCount} />
      </main>
    </div>
  );
}
