import React, { useState, useEffect } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ColorPickerInput } from "../components/ColorPickerInput";
import { ToggleSwitch } from "../components/ToggleSwitch";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const settings = (await db.restockSettings.findUnique({
      where: { shop: session.shop },
    })) || {
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
      minRestockThreshold: 1,
      accentColor: "#008060",
      enableWebPush: false,
      senderName: "Fulfillment Center",
      emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    };

    return json({ settings, shop: session.shop });
  } catch (err) {
    console.error("[app.settings loader error]:", err);
    return json({
      settings: {
        dripBatchMultiplier: 2.5,
        dripIntervalMinutes: 120,
        minRestockThreshold: 1,
        accentColor: "#008060",
        enableWebPush: false,
        senderName: "Fulfillment Center",
        emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
      },
      shop: session.shop,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const dripBatchMultiplier = parseFloat(String(formData.get("dripBatchMultiplier") || "2.5")) || 2.5;
  const dripIntervalMinutes = parseInt(String(formData.get("dripIntervalMinutes") || "120"), 10) || 120;
  const minRestockThreshold = parseInt(String(formData.get("minRestockThreshold") || "1"), 10) || 1;
  const accentColor = String(formData.get("accentColor") || "#008060");
  const enableWebPush = formData.get("enableWebPush") === "true";
  const senderName = String(formData.get("senderName") || "Fulfillment Center");
  const emailSubjectTemplate = String(
    formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship"
  );

  await db.restockSettings.upsert({
    where: { shop: session.shop },
    update: {
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      accentColor,
      enableWebPush,
      senderName,
      emailSubjectTemplate,
    },
    create: {
      shop: session.shop,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      accentColor,
      enableWebPush,
      senderName,
      emailSubjectTemplate,
    },
  });

  return json({ success: true });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [formState, setFormState] = useState(settings);
  const [isDirty, setIsDirty] = useState(false);

  const showToast = (message: string) => {
    try {
      if (typeof window !== "undefined" && (window as any).shopify?.toast?.show) {
        (window as any).shopify.toast.show(message);
      }
    } catch {
      // Fallback
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormState((prev) => {
      const next = { ...prev, [field]: value };
      setIsDirty(JSON.stringify(next) !== JSON.stringify(settings));
      return next;
    });
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("dripBatchMultiplier", String(formState.dripBatchMultiplier));
    formData.append("dripIntervalMinutes", String(formState.dripIntervalMinutes));
    formData.append("minRestockThreshold", String(formState.minRestockThreshold));
    formData.append("accentColor", formState.accentColor);
    formData.append("enableWebPush", formState.enableWebPush ? "true" : "false");
    formData.append("senderName", formState.senderName);
    formData.append("emailSubjectTemplate", formState.emailSubjectTemplate);

    submit(formData, { method: "POST" });
    setIsDirty(false);
    showToast("Configuration saved successfully");
  };

  const handleDiscard = () => {
    setFormState(settings);
    setIsDirty(false);
  };

  useEffect(() => {
    setFormState(settings);
    setIsDirty(false);
  }, [settings]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-zinc-900">
      <ui-title-bar title="Dispatch & Branding Settings" />

      {isDirty && (
        <ui-save-bar id="settings-save-bar">
          <button variant="primary" onClick={handleSave}>
            Save
          </button>
          <button onClick={handleDiscard}>
            Discard
          </button>
        </ui-save-bar>
      )}

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {isDirty && (
          <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center justify-between shadow-xs">
            <span className="text-xs font-medium text-emerald-900">
              You have unsaved configuration changes.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={navigation.state === "submitting"}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {navigation.state === "submitting" ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Pacing Settings Card */}
        <div className="p-6 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              FIFO Anti-Burnout Pacing Engine
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Control multiplier ratio and evaluation cooldown window to prevent catalog stockout shocks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-700 block mb-1">
                Drip Batch Multiplier
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={formState.dripBatchMultiplier}
                onChange={(e) => handleChange("dripBatchMultiplier", parseFloat(e.target.value) || 2.5)}
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-mono"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">
                Default 2.5x of restocked units (e.g. 4 restocked = 10 notified)
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 block mb-1">
                Cohort Cooldown Window (Minutes)
              </label>
              <input
                type="number"
                step="1"
                min="5"
                value={formState.dripIntervalMinutes}
                onChange={(e) => handleChange("dripIntervalMinutes", parseInt(e.target.value, 10) || 120)}
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-mono"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">
                Delay before evaluating remaining stock for next cohort
              </span>
            </div>
          </div>
        </div>

        {/* Branding & Visuals Card */}
        <div className="p-6 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Storefront Branding & Notification Preferences
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configure brand colors and notification channel preferences.
            </p>
          </div>

          <ColorPickerInput
            label="Theme Accent Color"
            value={formState.accentColor}
            onChange={(color) => handleChange("accentColor", color)}
            description="Controls Storefront App Block button and status indicators"
          />

          <ToggleSwitch
            label="Browser Web Push Alerts"
            description="Enable zero-SMS-cost native browser push alerts on supported mobile and desktop browsers."
            checked={formState.enableWebPush}
            onChange={(checked) => handleChange("enableWebPush", checked)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
            <div>
              <label className="text-xs font-medium text-zinc-700 block mb-1">Sender Name</label>
              <input
                type="text"
                value={formState.senderName}
                onChange={(e) => handleChange("senderName", e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-sans"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">Used in restock dispatch notifications</span>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 block mb-1">Email Subject Template</label>
              <input
                type="text"
                value={formState.emailSubjectTemplate}
                onChange={(e) => handleChange("emailSubjectTemplate", e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-sans"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">Supports `&#123;&#123;product_title&#125;&#125;` placeholder</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
