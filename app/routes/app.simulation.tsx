import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { triggerFifoRestockDispatch } from "../services/restockDispatcher.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const settings = await db.restockSettings.findUnique({ where: { shop } });
    const pendingCount = await db.restockSubscription.count({
      where: { shop, status: "PENDING" },
    });

    const url = new URL(request.url);
    const targetVariantId = url.searchParams.get("variantId");

    let prefilledInventoryItemId = "inv_sample_987";
    if (targetVariantId) {
      const matchingSub = await db.restockSubscription.findFirst({
        where: { shop, variantId: targetVariantId },
      });
      if (matchingSub) {
        prefilledInventoryItemId = matchingSub.inventoryItemId;
      }
    }

    return json({
      shop,
      settings,
      pendingCount,
      prefilledInventoryItemId,
    });
  } catch (err) {
    console.error("[app.simulation loader error]:", err);
    return json({
      shop,
      settings: null,
      pendingCount: 0,
      prefilledInventoryItemId: "inv_sample_987",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "run_simulation") {
    const inventoryItemId = String(formData.get("inventoryItemId") || "inv_sample_987").trim();
    const availableUnits = parseInt(String(formData.get("availableUnits") || "2"), 10) || 2;

    const dispatchResult = await triggerFifoRestockDispatch({
      shop,
      inventoryItemId,
      availableUnits,
    });

    return json({
      success: true,
      simulationResult: dispatchResult,
    });
  }

  return json({ ok: true });
}

export default function SimulationLabPage() {
  const { settings, pendingCount, prefilledInventoryItemId } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRunning = navigation.state === "submitting";

  const [availableUnits, setAvailableUnits] = useState("4");
  const [inventoryItemId, setInventoryItemId] = useState(
    prefilledInventoryItemId || "inv_sample_987"
  );

  function handleRunSimulation() {
    const formData = new FormData();
    formData.append("intent", "run_simulation");
    formData.append("availableUnits", availableUnits);
    formData.append("inventoryItemId", inventoryItemId);
    submit(formData, { method: "post" });
  }

  const multiplier = settings?.dripBatchMultiplier ?? 2.5;
  const units = Number(availableUnits) || 0;
  const calculatedBatchSize = Math.round(units * multiplier);

  const simResult =
    actionData && "simulationResult" in actionData
      ? actionData.simulationResult
      : null;

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-16 font-sans text-[#202223] antialiased">
      <ui-title-bar title="Alert Simulator" />

      <main className="max-w-[1000px] mx-auto px-4 py-4 space-y-4">
        {/* Simulation Setup Card */}
        <div className="p-4 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#202223]">
              Smart restock pacing test run
            </h2>
            <p className="text-xs text-[#616161] mt-0.5">
              Simulate inventory replenishment to test batch pacing, pause intervals, and 1-Click checkout links without sending live messages to real shoppers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-[#f1f2f4]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#202223] block">
                Restocked units to simulate
              </label>
              <input
                type="number"
                min="1"
                value={availableUnits}
                onChange={(e) => setAvailableUnits(e.target.value)}
                className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
              />
              <span className="text-[11px] text-[#616161] block">
                Simulated units replenished in warehouse
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#202223] block">
                Inventory Item ID
              </label>
              <input
                type="text"
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
              />
              <span className="text-[11px] text-[#616161] block">
                Shoppers waiting to be notified: <strong className="text-[#202223] font-medium">{pendingCount}</strong>
              </span>
            </div>
          </div>

          {/* Clean Polaris Formula Summary Box */}
          <div className="p-3 bg-[#f6f6f7] border border-[#e1e3e5] rounded-md space-y-1.5 text-xs">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#616161]">
              Pacing calculation preview
            </div>
            <div className="flex items-center justify-between text-[#616161]">
              <span>Replenished units:</span>
              <span className="text-[#202223] font-medium">{units} units</span>
            </div>
            <div className="flex items-center justify-between text-[#616161]">
              <span>Configured multiplier:</span>
              <span className="text-[#202223] font-medium">{multiplier}x</span>
            </div>
            <div className="flex items-center justify-between border-t border-[#e1e3e5] pt-1.5 font-medium text-[#202223]">
              <span>Target notification batch size:</span>
              <span className="text-[#008060] font-semibold">{calculatedBatchSize} customers</span>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={isRunning}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md shadow-[0_1px_0_rgba(0,0,0,0.05)] transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRunning ? "Running test..." : "Run test simulation"}
            </button>
          </div>
        </div>

        {/* Live Simulation Results */}
        {simResult && (
          <div className="p-4 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#008060]" />
                <span className="text-xs font-semibold text-[#202223]">
                  Test run completed successfully
                </span>
              </div>
              <span className="text-[11px] font-medium text-[#008060] bg-[#e3f1df] px-2 py-0.5 rounded">
                Batch #{simResult.batchId}
              </span>
            </div>

            <p className="text-xs text-[#616161] leading-relaxed">
              Dispatched <strong>{simResult.targetAlerts} test alerts</strong> based on {simResult.availableUnits} restocked units and a {simResult.multiplier}x multiplier.
              Remaining waiting shoppers: <strong>{simResult.remainingPending}</strong>.
            </p>

            {simResult.permalinksGenerated?.length > 0 && (
              <div className="pt-2 border-t border-[#f1f2f4]">
                <span className="text-xs font-semibold text-[#202223] block mb-1.5">
                  Generated 1-Click Checkout Permalinks:
                </span>
                <ul className="space-y-1.5 text-xs">
                  {simResult.permalinksGenerated.map((link: string, idx: number) => (
                    <li key={idx} className="flex items-center justify-between p-2 bg-[#f6f6f7] border border-[#e1e3e5] rounded-md">
                      <span className="text-[#616161] truncate max-w-md font-mono text-[11px]">
                        {link}
                      </span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 text-[11px] font-medium text-[#005bd3] hover:underline shrink-0"
                      >
                        Open cart →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
