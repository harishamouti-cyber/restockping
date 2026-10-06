import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { triggerFifoRestockDispatch } from "../services/restockDispatcher.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

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
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-zinc-900">
      <TitleBar title="FIFO Queue Simulation & Diagnostics" />

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Diagnostic Simulator Container */}
        <div className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              FIFO Mathematical Queue Dry Run
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Simulate warehouse replenishment events to verify batch multipliers, pacing windows, and 1-Click checkout links without altering live catalog stock.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Restocked Available Units</label>
              <input
                type="number"
                min="1"
                value={availableUnits}
                onChange={(e) => setAvailableUnits(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
              />
              <span className="text-[11px] text-zinc-400 block">
                Simulated units delivered to warehouse
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Inventory Item ID</label>
              <input
                type="text"
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
              />
              <span className="text-[11px] text-zinc-400 block">
                Current active pending in queue: <strong className="text-zinc-700 font-mono">{pendingCount}</strong>
              </span>
            </div>
          </div>

          {/* High-Contrast Monospaced Diagnostic Panel */}
          <div className="p-4 bg-zinc-900 text-zinc-100 rounded-xl font-mono text-xs space-y-2 border border-zinc-800">
            <div className="text-zinc-400">// FIFO Mathematical Queue Output</div>
            <div className="flex justify-between">
              <span>Replenished Units:</span>
              <span className="text-emerald-400 font-bold">{units} units</span>
            </div>
            <div className="flex justify-between">
              <span>Configured Multiplier:</span>
              <span>{multiplier}x</span>
            </div>
            <div className="flex justify-between border-t border-zinc-800 pt-2 font-semibold">
              <span>Target Cohort Dispatch Size:</span>
              <span className="text-emerald-400">{calculatedBatchSize} subscribers</span>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={isRunning}
              className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-all shadow-xs cursor-pointer border-0"
            >
              {isRunning ? "Simulating Queue..." : "Execute FIFO Dry Run"}
            </button>
          </div>
        </div>

        {/* Live Simulation Results */}
        {simResult && (
          <div className="p-5 bg-emerald-50 border border-emerald-200/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900">
                ✓ Simulation Execution Complete: {simResult.dispatchedCount} Dispatches Processed
              </span>
              <span className="text-xs font-mono text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                Batch #{simResult.batchId}
              </span>
            </div>
            <p className="text-xs text-emerald-800">
              Formula Execution: min(round({simResult.availableUnits} units × {simResult.multiplier}),{" "}
              {simResult.targetAlerts + simResult.remainingPending} pending) = <strong>{simResult.targetAlerts} alerts</strong>.
              Remaining in queue: <strong>{simResult.remainingPending}</strong>.
            </p>
            {simResult.permalinksGenerated?.length > 0 && (
              <div className="pt-2 border-t border-emerald-200">
                <span className="text-xs font-semibold text-emerald-900 block mb-1">
                  Generated 1-Click Permalinks:
                </span>
                <ul className="space-y-1 text-[11px] font-mono text-emerald-800">
                  {simResult.permalinksGenerated.map((link: string, idx: number) => (
                    <li key={idx} className="truncate">
                      <a href={link} target="_blank" rel="noreferrer" className="underline hover:text-emerald-950">
                        {link}
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
