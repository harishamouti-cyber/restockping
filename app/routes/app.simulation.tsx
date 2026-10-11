import React, { useState, useEffect } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getAllActiveCatalogProducts, getLiveProductMedia, type CatalogProductOption } from "../services/catalog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const [settingsRecord, pendingSubscribers, catalogProducts] = await Promise.all([
      db.restockSettings.findUnique({ where: { shop } }),
      db.restockSubscription.findMany({
        where: { shop, status: "PENDING" },
      }),
      getAllActiveCatalogProducts(admin),
    ]);

    const settings = settingsRecord || {
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
    };

    // Aggregate pending count by variantId from real database records
    const waitingCounts = new Map<string, number>();
    for (const sub of pendingSubscribers) {
      const current = waitingCounts.get(sub.variantId) || 0;
      waitingCounts.set(sub.variantId, current + 1);
    }

    // Build selectable catalog list with real DB count attached if available
    const availableCatalogVariants = catalogProducts.map((p) => ({
      ...p,
      actualWaitingCount: waitingCounts.get(p.variantId) || 0,
    }));

    return json({
      settings,
      availableCatalogVariants,
      totalPendingInDb: pendingSubscribers.length,
      shop,
    });
  } catch (err) {
    console.error("[app.simulation loader error]:", err);
    return json({
      settings: {
        dripBatchMultiplier: 2.5,
        dripIntervalMinutes: 120,
      },
      availableCatalogVariants: [] as (CatalogProductOption & { actualWaitingCount: number })[],
      totalPendingInDb: 0,
      shop,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "CREATE_SAMPLE_SUBSCRIBERS") {
    try {
      const media = await getLiveProductMedia(admin);
      const productTitle = media?.productTitle || "The Out of Stock Snowboard";
      const variantTitle = media?.variantTitle || "Standard Edition";
      const variantId = media?.variantId || "gid://shopify/ProductVariant/sample_snowboard";
      const productId = media?.productId || "gid://shopify/Product/sample_snowboard";
      const price = media?.price || 885.95;
      const imageUrl = media?.imageUrl || "";

      const sampleShoppers = [
        `alex_${Math.floor(100 + Math.random() * 900)}@example.com`,
        `morgan_${Math.floor(100 + Math.random() * 900)}@example.com`,
        `taylor_${Math.floor(100 + Math.random() * 900)}@example.com`,
      ];

      for (const email of sampleShoppers) {
        await db.restockSubscription.create({
          data: {
            shop: session.shop,
            productId,
            variantId,
            inventoryItemId: "inv_sample_01",
            productTitle,
            variantTitle,
            priceSnapshot: price,
            customerEmail: email,
            productImageUrl: imageUrl || undefined,
            status: "PENDING",
          },
        });
      }

      return json({
        success: true,
        sampleCreated: true,
        message: "Created 3 sample waitlist shoppers in database for live testing!",
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 400 });
    }
  }

  // Simulation Run Calculation
  const units = Math.max(1, parseInt(String(formData.get("units") || "4"), 10));
  const multiplier = parseFloat(String(formData.get("multiplier") || "2.5")) || 2.5;
  const simulatedWaitingShoppers = Math.max(
    1,
    parseInt(String(formData.get("simulatedWaitingShoppers") || "25"), 10)
  );
  const productTitle = String(formData.get("productTitle") || "Target Product");
  const variantTitle = String(formData.get("variantTitle") || "Default Variant");
  const cooldownMinutes = parseInt(String(formData.get("cooldownMinutes") || "120"), 10);

  const theoreticalCapacity = Math.round(units * multiplier);
  const effectiveBatch = Math.min(theoreticalCapacity, simulatedWaitingShoppers);
  const remainingWaiting = Math.max(0, simulatedWaitingShoppers - effectiveBatch);

  return json({
    success: true,
    simulationCompleted: true,
    productTitle,
    variantTitle,
    units,
    multiplier,
    simulatedWaitingShoppers,
    theoreticalCapacity,
    effectiveBatch,
    remainingWaiting,
    cooldownMinutes,
  });
};

export default function AlertSimulator() {
  const { settings, availableCatalogVariants, totalPendingInDb } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [units, setUnits] = useState(4);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    availableCatalogVariants[0]?.variantId || ""
  );

  const selectedProduct =
    availableCatalogVariants.find((v) => v.variantId === selectedVariantId) ||
    availableCatalogVariants[0];

  // Initialize simulated shoppers based on actual waiting count if any exist, otherwise default to 25
  const initialWaiting =
    selectedProduct?.actualWaitingCount && selectedProduct.actualWaitingCount > 0
      ? selectedProduct.actualWaitingCount
      : 25;

  const [simulatedWaitingShoppers, setSimulatedWaitingShoppers] = useState<number>(initialWaiting);

  // Update simulated queue whenever variant selection changes if variant has real pending shoppers
  useEffect(() => {
    if (selectedProduct?.actualWaitingCount && selectedProduct.actualWaitingCount > 0) {
      setSimulatedWaitingShoppers(selectedProduct.actualWaitingCount);
    }
  }, [selectedVariantId]);

  const multiplier = Number(settings.dripBatchMultiplier) || 2.5;
  const cooldownMinutes = Number(settings.dripIntervalMinutes) || 120;

  // Real-time calculation preview
  const liveTheoreticalCapacity = Math.round(units * multiplier);
  const liveEffectiveBatch = Math.min(liveTheoreticalCapacity, simulatedWaitingShoppers);
  const liveRemainingWaiting = Math.max(0, simulatedWaitingShoppers - liveEffectiveBatch);

  const showToast = (message: string, isError = false) => {
    try {
      if (typeof window !== "undefined" && (window as any).shopify?.toast?.show) {
        (window as any).shopify.toast.show(message, isError ? { isError: true } : undefined);
      }
    } catch {}
  };

  useEffect(() => {
    if (actionData?.success && (actionData as any).message) {
      showToast((actionData as any).message);
    } else if (actionData && !(actionData as any).success && (actionData as any).error) {
      showToast((actionData as any).error, true);
    }
  }, [actionData]);

  const handleRunSimulation = () => {
    submit(
      {
        units: units.toString(),
        multiplier: multiplier.toString(),
        simulatedWaitingShoppers: simulatedWaitingShoppers.toString(),
        productTitle: selectedProduct?.productTitle || "Product",
        variantTitle: selectedProduct?.variantTitle || "Default Title",
        cooldownMinutes: cooldownMinutes.toString(),
      },
      { method: "POST" }
    );
  };

  const handleCreateSampleShoppers = () => {
    submit({ intent: "CREATE_SAMPLE_SUBSCRIBERS" }, { method: "POST" });
  };

  const isRunning =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") !== "CREATE_SAMPLE_SUBSCRIBERS";

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-16 font-sans text-[#202223] antialiased">
      <ui-title-bar title="Alert Simulator">
        <button onClick={handleCreateSampleShoppers}>
          Add 3 Sample Shoppers
        </button>
      </ui-title-bar>

      <main className="max-w-[960px] mx-auto px-4 py-4 space-y-3.5">
        {/* Main Test Run Card */}
        <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#202223]">
                Restock alert pacing sandbox
              </h2>
              <p className="text-xs text-[#616161] mt-0.5">
                Simulate warehouse restocks on any catalog product to test notification batch sizes, queue progression, and cooldown intervals without emailing live customers.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#e3f1df] text-[#008060]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#008060]" />
              {multiplier}x Cohort Pacing Active
            </span>
          </div>

          {/* Policy Explanation Banner */}
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#0f172a]">
                Understanding Pacing Multipliers & Inventory Policy:
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-[#475569] leading-relaxed">
              <div className="p-2.5 bg-white rounded border border-[#e2e8f0]">
                <strong className="text-[#0f172a] block mb-1">
                  Paced Cohort Mode ({multiplier > 1 ? `${multiplier}x` : "> 1.0x"} ratio)
                </strong>
                Notifies a cohort larger than physical stock ({units} units × {multiplier}x = {liveTheoreticalCapacity} alerts). This anticipates that ~{Math.round(100 / Math.max(1, multiplier))}% of notified shoppers will complete checkout. Ideal for fast stock clearing.
              </div>
              <div className="p-2.5 bg-white rounded border border-[#e2e8f0]">
                <strong className="text-[#0f172a] block mb-1">
                  Strict 1:1 Conservative Policy (1.0x ratio)
                </strong>
                Dispatches exactly 1 alert per physical item (e.g. 4 units = 4 alerts). Zero chance of notifying more customers than available units. Ideal for high-demand, limited-edition products.
              </div>
            </div>
            <p className="text-[10px] text-[#64748b] pt-1 border-t border-[#e2e8f0]">
              * <em>Important:</em> Shopify processes orders on a first-come, first-served basis at checkout. RestockPing does not reserve inventory or hold customer carts.
            </p>
          </div>

          {/* Interactive Input Form */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Control 1: Catalog Product Selection */}
            <div className="md:col-span-1">
              <label className="text-xs font-medium text-[#202223] block mb-1">
                Target catalog product
              </label>
              {availableCatalogVariants.length > 0 ? (
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                >
                  {availableCatalogVariants.map((v) => (
                    <option key={v.variantId} value={v.variantId}>
                      {v.productTitle} - {v.variantTitle} {v.actualWaitingCount > 0 ? `(${v.actualWaitingCount} in DB)` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value="The Out of Stock Snowboard"
                  className="w-full px-2.5 py-1.5 text-xs bg-[#f6f6f7] border border-[#d2d5d8] rounded-md text-[#616161]"
                />
              )}
              <span className="text-[11px] text-[#8c9196] mt-1 block truncate">
                {selectedProduct ? `${selectedProduct.productTitle} · $${selectedProduct.price.toFixed(2)}` : "Select an item"}
              </span>
            </div>

            {/* Control 2: Restock Units Input */}
            <div>
              <label className="text-xs font-medium text-[#202223] block mb-1">
                Replenished units to simulate
              </label>
              <input
                type="number"
                min="1"
                value={units}
                onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
              />
              <span className="text-[11px] text-[#8c9196] mt-1 block">
                Warehouse units added to inventory
              </span>
            </div>

            {/* Control 3: Simulated Waiting Shoppers */}
            <div>
              <label className="text-xs font-medium text-[#202223] block mb-1">
                Simulated waiting shoppers
              </label>
              <input
                type="number"
                min="1"
                value={simulatedWaitingShoppers}
                onChange={(e) =>
                  setSimulatedWaitingShoppers(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
              />
              <span className="text-[11px] text-[#8c9196] mt-1 block">
                {selectedProduct?.actualWaitingCount && selectedProduct.actualWaitingCount > 0
                  ? `${selectedProduct.actualWaitingCount} real pending shopper(s) registered in store`
                  : "Simulate arbitrary waitlist volume to test cohort math"}
              </span>
            </div>
          </div>

          {/* Synchronized Live Pacing Calculation Preview */}
          <div className="p-3.5 bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-[#e1e3e5] pb-1.5">
              <span className="text-[11px] font-semibold text-[#616161]">
                Live pacing calculation preview
              </span>
              <span className="text-[11px] text-[#616161]">
                Cooldown interval: <strong className="text-[#202223]">{cooldownMinutes} minutes</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-2 bg-white rounded border border-[#e1e3e5]">
                <span className="text-[10px] text-[#8c9196] block">Restocked Units</span>
                <span className="text-sm font-semibold text-[#202223]">{units}</span>
              </div>
              <div className="p-2 bg-white rounded border border-[#e1e3e5]">
                <span className="text-[10px] text-[#8c9196] block">Pacing Multiplier</span>
                <span className="text-sm font-semibold text-[#202223]">{multiplier}x</span>
              </div>
              <div className="p-2 bg-white rounded border border-[#e1e3e5]">
                <span className="text-[10px] text-[#8c9196] block">Target Alert Cohort</span>
                <span className="text-sm font-semibold text-[#202223]">{liveTheoreticalCapacity} alerts</span>
              </div>
              <div className="p-2 bg-[#e3f1df] rounded border border-[#aee9d1]">
                <span className="text-[10px] text-[#008060] block font-medium">Batch #1 Dispatched</span>
                <span className="text-sm font-bold text-[#008060]">{liveEffectiveBatch} shoppers</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#e1e3e5] flex flex-wrap items-center justify-between text-[11px] text-[#616161]">
              <span>
                Simulated Queue: <strong className="text-[#202223]">{simulatedWaitingShoppers} shoppers</strong>
              </span>
              <span>
                Remaining Paused for Cooldown: <strong className="text-[#202223]">{liveRemainingWaiting} shoppers</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={isRunning}
              className="px-4 py-2 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isRunning ? "Calculating..." : "Run test simulation"}
            </button>
            <span className="text-[11px] text-[#8c9196]">
              Dry-run only · No customer emails are sent during simulation
            </span>
          </div>
        </div>

        {/* Comprehensive Success Summary Card */}
        {actionData?.success && (actionData as any).simulationCompleted && (
          <div className="p-4 bg-white border border-[#008060] rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#008060] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#008060]" />
                Simulation Run Completed Successfully
              </span>
              <span className="text-[11px] font-semibold bg-[#e3f1df] text-[#008060] px-2 py-0.5 rounded">
                Batch #1 Dry Run Verified
              </span>
            </div>

            <div className="p-3 bg-[#f0f9f4] border border-[#d1f0df] rounded-lg space-y-1.5 text-xs text-[#202223] leading-relaxed">
              <p>
                <strong>{(actionData as any).effectiveBatch}</strong> of{" "}
                <strong>{(actionData as any).simulatedWaitingShoppers}</strong> waiting shoppers would receive restock alerts in the first notification batch for{" "}
                <em>{(actionData as any).productTitle}</em> ({(actionData as any).variantTitle}).
              </p>
              <p className="text-[#616161]">
                Applied <strong>{(actionData as any).multiplier}x</strong> pacing multiplier to{" "}
                <strong>{(actionData as any).units}</strong> restocked warehouse units (Target cohort:{" "}
                {(actionData as any).theoreticalCapacity} alert capacity).
              </p>
              <p className="text-[#616161]">
                <strong>{(actionData as any).remainingWaiting}</strong> shoppers remain paused and queued for the{" "}
                <strong>{(actionData as any).cooldownMinutes}</strong>-minute cooldown window before Batch #2 triggers, spacing out demand cohorts and preventing simultaneous checkout traffic surges.
              </p>
            </div>

            {/* Visual Cohort Split Bar */}
            <div>
              <div className="flex justify-between text-[11px] text-[#616161] mb-1">
                <span>
                  Batch #1: {(actionData as any).effectiveBatch} (
                  {Math.round(
                    ((actionData as any).effectiveBatch /
                      (actionData as any).simulatedWaitingShoppers) *
                      100
                  )}
                  %)
                </span>
                <span>
                  Paused Queue: {(actionData as any).remainingWaiting} (
                  {Math.round(
                    ((actionData as any).remainingWaiting /
                      (actionData as any).simulatedWaitingShoppers) *
                      100
                  )}
                  %)
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#f1f2f4] rounded-full overflow-hidden flex">
                <div
                  style={{
                    width: `${Math.round(
                      ((actionData as any).effectiveBatch /
                        (actionData as any).simulatedWaitingShoppers) *
                        100
                    )}%`,
                  }}
                  className="bg-[#008060] h-full"
                />
                <div
                  style={{
                    width: `${Math.round(
                      ((actionData as any).remainingWaiting /
                        (actionData as any).simulatedWaitingShoppers) *
                        100
                    )}%`,
                  }}
                  className="bg-[#d2d5d8] h-full"
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
