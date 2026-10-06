import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { ContextualSaveBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { AppHeader } from "../components/AppHeader";
import { ColorPickerInput } from "../components/ColorPickerInput";
import { ToggleSwitch } from "../components/ToggleSwitch";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await db.restockSettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      senderName: "Fulfillment Center",
      senderEmail: "alerts@restockping.com",
      accentColor: "#008060",
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
      minRestockThreshold: 1,
      emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    },
  });

  return json({ settings, shop });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const senderName = String(formData.get("senderName") || "Fulfillment Center").trim();
  const senderEmail = String(formData.get("senderEmail") || "").trim();
  const replyToEmail = String(formData.get("replyToEmail") || "").trim();
  const accentColor = String(formData.get("accentColor") || "#008060").trim();
  const dripBatchMultiplier = parseFloat(String(formData.get("dripBatchMultiplier") || "2.5")) || 2.5;
  const dripIntervalMinutes = parseInt(String(formData.get("dripIntervalMinutes") || "120"), 10) || 120;
  const minRestockThreshold = parseInt(String(formData.get("minRestockThreshold") || "1"), 10) || 1;
  const incentiveDiscountCode = String(formData.get("incentiveDiscountCode") || "").trim();
  const emailSubjectTemplate = String(
    formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship"
  ).trim();
  const enableWebPush = formData.get("enableWebPush") === "true";

  const updatedSettings = await db.restockSettings.upsert({
    where: { shop },
    update: {
      senderName,
      senderEmail,
      replyToEmail,
      accentColor,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      incentiveDiscountCode,
      emailSubjectTemplate,
      enableWebPush,
    },
    create: {
      shop,
      senderName,
      senderEmail,
      replyToEmail,
      accentColor,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      incentiveDiscountCode,
      emailSubjectTemplate,
      enableWebPush,
    },
  });

  return json({ success: true, settings: updatedSettings });
}

export default function SettingsPage() {
  const { settings, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [senderName, setSenderName] = useState(settings.senderName);
  const [senderEmail, setSenderEmail] = useState(settings.senderEmail || "");
  const [replyToEmail, setReplyToEmail] = useState(settings.replyToEmail || "");
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [dripMultiplier, setDripMultiplier] = useState(String(settings.dripBatchMultiplier));
  const [dripInterval, setDripInterval] = useState(String(settings.dripIntervalMinutes));
  const [minThreshold, setMinThreshold] = useState(String(settings.minRestockThreshold));
  const [discountCode, setDiscountCode] = useState(settings.incentiveDiscountCode || "");
  const [subjectTemplate, setSubjectTemplate] = useState(settings.emailSubjectTemplate);
  const [enableWebPush, setEnableWebPush] = useState(settings.enableWebPush);

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const dirty =
      senderName !== settings.senderName ||
      senderEmail !== (settings.senderEmail || "") ||
      replyToEmail !== (settings.replyToEmail || "") ||
      accentColor !== settings.accentColor ||
      dripMultiplier !== String(settings.dripBatchMultiplier) ||
      dripInterval !== String(settings.dripIntervalMinutes) ||
      minThreshold !== String(settings.minRestockThreshold) ||
      discountCode !== (settings.incentiveDiscountCode || "") ||
      subjectTemplate !== settings.emailSubjectTemplate ||
      enableWebPush !== settings.enableWebPush;

    setIsDirty(dirty);
  }, [
    senderName,
    senderEmail,
    replyToEmail,
    accentColor,
    dripMultiplier,
    dripInterval,
    minThreshold,
    discountCode,
    subjectTemplate,
    enableWebPush,
    settings,
  ]);

  function handleReset() {
    setSenderName(settings.senderName);
    setSenderEmail(settings.senderEmail || "");
    setReplyToEmail(settings.replyToEmail || "");
    setAccentColor(settings.accentColor);
    setDripMultiplier(String(settings.dripBatchMultiplier));
    setDripInterval(String(settings.dripIntervalMinutes));
    setMinThreshold(String(settings.minRestockThreshold));
    setDiscountCode(settings.incentiveDiscountCode || "");
    setSubjectTemplate(settings.emailSubjectTemplate);
    setEnableWebPush(settings.enableWebPush);
    setIsDirty(false);
  }

  function handleSubmit() {
    const formData = new FormData();
    formData.append("senderName", senderName);
    formData.append("senderEmail", senderEmail);
    formData.append("replyToEmail", replyToEmail);
    formData.append("accentColor", accentColor);
    formData.append("dripBatchMultiplier", dripMultiplier);
    formData.append("dripIntervalMinutes", dripInterval);
    formData.append("minRestockThreshold", minThreshold);
    formData.append("incentiveDiscountCode", discountCode);
    formData.append("emailSubjectTemplate", subjectTemplate);
    formData.append("enableWebPush", enableWebPush ? "true" : "false");

    submit(formData, { method: "post" });
    setIsDirty(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 flex flex-col font-sans">
      <AppHeader
        currentPageTitle="Settings"
        shop={shop}
        actions={
          isDirty ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg shadow-xs cursor-pointer transition-colors"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          ) : undefined
        }
      />

      {/* Polaris App Bridge Native Contextual Save Bar */}
      {isDirty && (
        <ContextualSaveBar
          saveAction={{
            onAction: handleSubmit,
            loading: isSaving,
            disabled: false,
          }}
          discardAction={{
            onAction: handleReset,
          }}
        />
      )}

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
        {actionData?.success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
            <span>✓ Configuration successfully updated and synchronized across dispatch queues.</span>
          </div>
        )}

        {/* Section 1: FIFO Anti-Burnout Pacing Engine */}
        <section className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              FIFO Anti-Burnout Pacing Engine
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Control how many alerts are released relative to restocked inventory to protect conversion rate and avoid flash sell-out burnouts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Drip Batch Multiplier</label>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="10.0"
                value={dripMultiplier}
                onChange={(e) => setDripMultiplier(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
              <span className="text-[11px] text-zinc-400 block">
                Formula: Batch 1 = Units × {dripMultiplier}x
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Cohort Interval (Minutes)</label>
              <input
                type="number"
                step="5"
                min="15"
                max="1440"
                value={dripInterval}
                onChange={(e) => setDripInterval(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
              <span className="text-[11px] text-zinc-400 block">
                Cooldown window between batches
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Min Restock Threshold</label>
              <input
                type="number"
                step="1"
                min="1"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
              <span className="text-[11px] text-zinc-400 block">
                Ignore single returned items below this
              </span>
            </div>
          </div>
        </section>

        {/* Section 2: 1-Click Checkout Permalinks & Theme Accent */}
        <section className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              1-Click Checkout & Storefront Accent
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Bypasses PDP re-navigation. Automatically pre-loads variant, customer email, and discount code directly into Shopify checkout.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Incentive Discount Code</label>
              <input
                type="text"
                placeholder="e.g. RESTOCK10"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="w-full max-w-sm px-3 py-2 text-xs font-mono uppercase bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
              <span className="text-[11px] text-zinc-400 block">
                Attached to the 1-click cart permalink URL (?discount=CODE)
              </span>
            </div>

            <ColorPickerInput
              label="Theme Accent Color"
              value={accentColor}
              onChange={setAccentColor}
              description="Controls storefront button, badges, and focus rings in the Dawn/OS 2.0 theme block"
            />
          </div>
        </section>

        {/* Section 3: Notification Delivery & Push Alerts */}
        <section className="bg-white border border-zinc-200/80 rounded-xl shadow-xs p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              Notification Delivery & Identity
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configure sender attribution and customer-facing restock email subject templates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Sender Name</label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Sender Email</label>
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="orders@yourstore.com"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Reply-To Email</label>
              <input
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="support@yourstore.com"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-zinc-700">Email Subject Template</label>
            <input
              type="text"
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
            <span className="text-[11px] text-zinc-400 block">
              Supported template variables: &#123;&#123;product_title&#125;&#125; and &#123;&#123;variant_title&#125;&#125;
            </span>
          </div>

          <div className="pt-2">
            <ToggleSwitch
              label="Browser Web Push Alerts"
              description="Permits zero-SMS-cost native browser push alerts on supported mobile and desktop browsers."
              checked={enableWebPush}
              onChange={setEnableWebPush}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
