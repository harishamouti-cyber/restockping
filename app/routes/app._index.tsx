import React from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateConversionMetrics, calculateVelocityMetrics } from "../services/fifoEngine.server";
import { LivePipelineNodes } from "../components/LivePipelineNodes";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, subscribers] = await Promise.all([
    db.restockSettings.findUnique({ where: { shop } }) || {
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
      minRestockThreshold: 1,
      accentColor: "#008060",
      enableWebPush: false,
      senderName: "Fulfillment Center",
      emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    },
    db.restockSubscription.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const metrics = calculateConversionMetrics(subscribers);
  const velocity = calculateVelocityMetrics(subscribers);
  const totalUnrealizedDemand = subscribers
    .filter((s) => s.status === "PENDING")
    .reduce((sum, s) => sum + (Number(s.priceSnapshot) || 0), 0);

  return json({
    shop,
    settings,
    metrics,
    velocity,
    totalUnrealizedDemand,
    isDev: process.env.NODE_ENV !== "production",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SEED_DEV_COHORT" && process.env.NODE_ENV !== "production") {
    const sampleEmails = [
      "alex.morgan@example.com",
      "sarah.connor@example.com",
      "marcus.wright@example.com",
      "elena.rostova@example.com",
      "david.kim@example.com",
    ];

    for (let i = 0; i < sampleEmails.length; i++) {
      const email = sampleEmails[i];
      await db.restockSubscription.create({
        data: {
          shop,
          customerEmail: email,
          productId: "prod_sample_123",
          variantId: "48192837492",
          inventoryItemId: "inv_sample_987",
          productTitle: "Classic Boxy Crewneck",
          variantTitle: "Black / Medium",
          priceSnapshot: 48.0,
          status: "PENDING",
        },
      });
    }
    return json({ success: true, seeded: true });
  }

  return json({ success: false });
};

export default function ExecutiveDemandHub() {
  const { shop, settings, metrics, velocity, totalUnrealizedDemand, isDev } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const handleDeepLinkToTheme = () => {
    window.open(`https://${shop}/admin/themes/current/editor?template=product`, "_blank");
  };

  const handleDevSeed = () => {
    submit({ intent: "SEED_DEV_COHORT" }, { method: "POST" });
  };

  const sampleReplenishedUnits = 4;
  const effectiveQueue = metrics.pendingCount;
  const multiplier = settings?.dripBatchMultiplier || 2.5;
  const intervalMinutes = settings?.dripIntervalMinutes || 120;
  const calculatedCohort = Math.min(
    Math.round(sampleReplenishedUnits * multiplier),
    effectiveQueue > 0
      ? effectiveQueue
      : Math.round(sampleReplenishedUnits * multiplier)
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-zinc-900">
      <TitleBar
        title="Executive Demand Hub"
        primaryAction={{
          content: "Add to Theme Editor",
          onAction: handleDeepLinkToTheme,
        }}
        secondaryActions={[
          {
            content: "Settings",
            onAction: () => navigate("/app/settings"),
          },
        ]}
      />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Executive Status Strip */}
        <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900 tracking-tight">
                  FIFO Anti-Burnout Engine Active
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  {multiplier}x Multiplier
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                  {intervalMinutes}m Window
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                Webhook listener active · Next evaluation window scheduled
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/app/subscribers?status=DISPATCHED")}
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-lg shadow-xs hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Queue History
            </button>
            <button
              onClick={() => navigate("/app/settings")}
              className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-lg shadow-xs hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Configure Pacing
            </button>
          </div>
        </div>

        {/* 21st.dev Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
                Gross Unrealized Demand
              </span>
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                ${totalUnrealizedDemand.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className={`inline-flex items-center text-[11px] font-mono font-medium px-1.5 py-0.5 rounded border ${
                  velocity.hasBaseline
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200/60"
                    : "text-zinc-600 bg-zinc-100 border-zinc-200"
                }`}
              >
                {velocity.label}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Cumulative purchase intent across out-of-stock SKUs</p>
          </div>

          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
                Active Waitlist Subscribers
              </span>
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                {metrics.totalRegistered}
              </span>
              <span className="text-[11px] font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                {metrics.pendingCount} in FIFO Queue
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Verified shoppers awaiting queued stock restock alerts</p>
          </div>

          <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between text-zinc-500 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
                Recovered 1-Click Orders
              </span>
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
                {metrics.convertedCount}
              </span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded border ${
                  metrics.isCtrActive
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200/60"
                    : "text-zinc-600 bg-zinc-100 border-zinc-200"
                }`}
              >
                {metrics.ctrBadgeLabel}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Conversions generated by direct 1-click checkout permalinks</p>
          </div>
        </div>

        {/* Fully Reactive FIFO Calibration Formula Display */}
        <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900 tracking-tight uppercase">
              Dynamic FIFO Pacing Calibration Formula
            </span>
            <span className="text-[11px] font-mono text-zinc-400">Reactive Live Calculation</span>
          </div>
          <div className="font-mono text-xs bg-zinc-50 border border-zinc-200/80 rounded-lg p-3 text-zinc-700">
            Target Cohort = min(round({sampleReplenishedUnits} × {multiplier}x), {effectiveQueue} in queue)
            {" "}= <strong className="text-emerald-700 font-semibold">{calculatedCohort} {calculatedCohort === 1 ? "buyer" : "buyers"}</strong>
          </div>
        </div>

        {/* Live Interconnected Diagnostic Nodes */}
        <LivePipelineNodes pendingCount={metrics.pendingCount} />
      </main>

      {/* Development-Only Mock Seeding Gate */}
      {isDev && (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={handleDevSeed}
            className="px-2.5 py-1 text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-300 rounded shadow-xs hover:bg-amber-100 cursor-pointer"
          >
            [DEV] Seed Mock Cohort
          </button>
        </div>
      )}
    </div>
  );
}
