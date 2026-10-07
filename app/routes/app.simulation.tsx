import React, { useState } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const [settingsRecord, subscribers] = await Promise.all([
      db.restockSettings.findUnique({ where: { shop } }),
      db.restockSubscription.findMany({
        where: { shop, status: "PENDING" },
      }),
    ]);

    const settings = settingsRecord || {
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
    };

    // Aggregate pending subscribers by variant
    const variantCounts = new Map<
      string,
      { productTitle: string; variantTitle: string; count: number }
    >();
    for (const s of subscribers) {
      if (!variantCounts.has(s.variantId)) {
        variantCounts.set(s.variantId, {
          productTitle: s.productTitle,
          variantTitle: s.variantTitle,
          count: 0,
        });
      }
      variantCounts.get(s.variantId)!.count += 1;
    }

    const availableVariants = Array.from(variantCounts.entries()).map(
      ([variantId, data]) => ({
        variantId,
        displayName: `${data.productTitle} (${data.variantTitle})`,
        waitingCount: data.count,
      })
    );

    return json({
      settings,
      availableVariants,
      totalWaiting: subscribers.length,
    });
  } catch (err) {
    console.error("[app.simulation loader error]:", err);
    return json({
      settings: {
        dripBatchMultiplier: 2.5,
        dripIntervalMinutes: 120,
      },
      availableVariants: [],
      totalWaiting: 0,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const units = parseInt(String(formData.get("units") || "4"), 10);
  const multiplier = parseFloat(String(formData.get("multiplier") || "2.5"));
  const waitingCount = parseInt(String(formData.get("waitingCount") || "0"), 10);

  const capacity = Math.round(units * multiplier);
  const actualDispatched = Math.min(capacity, waitingCount);
  const remainingWaiting = Math.max(0, waitingCount - actualDispatched);

  return json({
    success: true,
    units,
    multiplier,
    capacity,
    actualDispatched,
    remainingWaiting,
  });
};

export default function AlertSimulator() {
  const { settings, availableVariants, totalWaiting } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [units, setUnits] = useState(4);
  const [selectedVariantId, setSelectedVariantId] = useState(
    availableVariants[0]?.variantId || "sample_default"
  );

  const selectedVariant = availableVariants.find(
    (v) => v.variantId === selectedVariantId
  );
  const waitingShoppers = selectedVariant
    ? selectedVariant.waitingCount
    : totalWaiting;
  const multiplier = Number(settings.dripBatchMultiplier) || 2.5;

  const theoreticalCapacity = Math.round(units * multiplier);
  const effectiveBatch = Math.min(theoreticalCapacity, waitingShoppers);

  const handleRunSimulation = () => {
    submit(
      {
        units: units.toString(),
        multiplier: multiplier.toString(),
        waitingCount: waitingShoppers.toString(),
      },
      { method: "POST" }
    );
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-16 font-sans text-[#202223] antialiased">
      <ui-title-bar title="Alert Simulator" />

      <main className="max-w-[960px] mx-auto px-4 py-4 space-y-3">
        {/* Main Test Run Card */}
        <div className="p-4 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#202223]">
              Smart restock pacing test run
            </h2>
            <p className="text-xs text-[#616161] mt-0.5">
              Simulate inventory replenishment to test batch pacing, pause intervals, and 1-Click checkout links without sending live messages to real shoppers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-medium text-[#202223] block mb-1">
                Restocked units to simulate
              </label>
              <input
                type="number"
                min="1"
                value={units}
                onChange={(e) =>
                  setUnits(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-full px-3 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060]"
              />
              <span className="text-[11px] text-[#8c9196] mt-1 block">
                Simulated units replenished in warehouse
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-[#202223] block mb-1">
                Target sold-out product
              </label>
              {availableVariants.length > 0 ? (
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060]"
                >
                  {availableVariants.map((v) => (
                    <option key={v.variantId} value={v.variantId}>
                      {v.displayName} ({v.waitingCount} waiting)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value="All products currently in stock (0 waiting)"
                  className="w-full px-3 py-1.5 text-xs bg-[#f6f6f7] border border-[#d2d5d8] rounded-md text-[#616161]"
                />
              )}
              <span className="text-[11px] text-[#8c9196] mt-1 block">
                Shoppers waiting to be notified:{" "}
                <strong className="text-[#202223]">{waitingShoppers}</strong>
              </span>
            </div>
          </div>

          {/* Synchronized Pacing Preview */}
          <div className="p-3 bg-[#f6f6f7] border border-[#e1e3e5] rounded-md text-xs space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#616161] block mb-2">
              Pacing calculation preview
            </span>
            <div className="flex justify-between text-[#616161]">
              <span>Replenished units:</span>
              <span className="font-medium text-[#202223]">{units} units</span>
            </div>
            <div className="flex justify-between text-[#616161]">
              <span>Configured pacing multiplier:</span>
              <span className="font-medium text-[#202223]">{multiplier}x</span>
            </div>
            <div className="flex justify-between text-[#616161]">
              <span>Maximum safety capacity:</span>
              <span className="font-medium text-[#202223]">
                {theoreticalCapacity} alerts
              </span>
            </div>
            <div className="flex justify-between border-t border-[#e1e3e5] pt-1.5 font-medium text-[#202223]">
              <span>Target notification batch size:</span>
              <span className="text-[#008060] font-semibold font-mono">
                {effectiveBatch}{" "}
                {effectiveBatch === 1 ? "customer" : "customers"}
              </span>
            </div>
          </div>

          <button
            onClick={handleRunSimulation}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer"
          >
            Run test simulation
          </button>
        </div>

        {/* Dynamic Result Card */}
        {actionData?.success && (
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#008060] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#008060]" />
                Test run completed successfully
              </span>
              <span className="text-[10px] font-medium bg-[#e3f1df] text-[#008060] px-1.5 py-0.5 rounded">
                Batch #1 Dry Run
              </span>
            </div>
            <p className="text-xs text-[#616161] leading-relaxed">
              Dispatched{" "}
              <strong className="text-[#202223]">
                {actionData.actualDispatched} test alerts
              </strong>{" "}
              based on {actionData.units} restocked units and a{" "}
              {actionData.multiplier}x multiplier. Remaining waiting shoppers:{" "}
              <strong className="text-[#202223]">
                {actionData.remainingWaiting}
              </strong>
              .
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
