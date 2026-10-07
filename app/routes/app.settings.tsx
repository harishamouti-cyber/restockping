import React, { useState, useEffect } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { emitRestockFlowTrigger } from "../services/flowEmitter.server";
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
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "TEST_FLOW_TRIGGER") {
    const testEmail = String(formData.get("testEmail") || `merchant@${session.shop}`);
    try {
      await emitRestockFlowTrigger(admin, {
        customerEmail: testEmail,
        productTitle: "Sample Restocked Product",
        variantTitle: "Standard Edition",
        price: 49.99,
        variantId: "gid://shopify/ProductVariant/1234567890",
        productId: "gid://shopify/Product/1234567890",
        shop: session.shop,
      });
      return json({ success: true, message: `Test Flow trigger emitted for ${testEmail}` });
    } catch (err: any) {
      console.error("[Test Flow Trigger Error]:", err);
      return json(
        { success: false, error: err.message || "Failed to emit Shopify Flow trigger" },
        { status: 400 }
      );
    }
  }

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

  return json({ success: true, message: "Settings saved successfully" });
};

export default function SettingsPage() {
  const { settings, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [formState, setFormState] = useState(settings);
  const [isDirty, setIsDirty] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [isTesting, setIsTesting] = useState(false);

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
    showToast("Settings saved successfully");
  };

  const handleDiscard = () => {
    setFormState(settings);
    setIsDirty(false);
  };

  useEffect(() => {
    setFormState(settings);
    setIsDirty(false);
  }, [settings]);

  useEffect(() => {
    if (actionData) {
      setIsTesting(false);
      if ((actionData as any).message) {
        showToast((actionData as any).message);
      } else if ((actionData as any).error) {
        showToast((actionData as any).error);
      }
    }
  }, [actionData]);

  const handleTestTrigger = () => {
    const email = testEmail.trim() || `merchant@${shop}`;
    setIsTesting(true);
    const formData = new FormData();
    formData.append("intent", "TEST_FLOW_TRIGGER");
    formData.append("testEmail", email);
    submit(formData, { method: "POST" });
  };

  const storeHandle = shop.replace(".myshopify.com", "");
  const flowUrl = `https://admin.shopify.com/store/${storeHandle}/apps/flow`;

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-20 font-sans text-[#202223] antialiased">
      <ui-title-bar title="Settings" />

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

      <main className="max-w-[1000px] mx-auto px-4 py-4 space-y-4">
        {/* Unsaved Changes Banner */}
        {isDirty && (
          <div className="p-3 bg-[#fff5ea] border border-[#f5b854] rounded-lg flex items-center justify-between shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#b98900]" />
              <span className="text-xs font-medium text-[#202223]">
                You have unsaved changes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-2.5 py-1 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={navigation.state === "submitting"}
                className="px-3 py-1 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {navigation.state === "submitting" ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {/* Section 1: Email Delivery Engine (Shopify Flow Native) */}
        <div className="p-4 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#202223]">
                  Email Delivery Engine: Shopify Flow Native
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e3f1df] text-[#008060]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#008060]" />
                  Active
                </span>
              </div>
              <p className="text-xs text-[#616161] mt-1 max-w-2xl leading-relaxed">
                RestockPing automatically broadcasts restock events to Shopify Flow. You can route alerts through Shopify Email (10,000 free emails/month), Klaviyo, or Omnisend with zero third-party API keys required.
              </p>
            </div>
            <a
              href={flowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] hover:bg-[#f6f6f7] rounded-md transition-colors inline-flex items-center gap-1.5 shadow-2xs no-underline cursor-pointer"
            >
              <span>Manage in Shopify Flow</span>
              <svg className="w-3.5 h-3.5 text-[#616161]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Flow Trigger Payload Reference Grid */}
          <div className="p-3 bg-[#f6f6f7] border border-[#e1e3e5] rounded-md space-y-2">
            <div className="text-xs font-semibold text-[#202223]">
              Available Flow Trigger Parameters (<code className="text-[11px] font-mono text-[#005bd3]">customer_ready_for_restock_alert</code>)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2 bg-white border border-[#e1e3e5] rounded">
                <span className="text-[#202223] font-medium block">customer_email</span>
                <span className="text-[#616161] text-[10px]">Shopper email address</span>
              </div>
              <div className="p-2 bg-white border border-[#e1e3e5] rounded">
                <span className="text-[#202223] font-medium block">product_title</span>
                <span className="text-[#616161] text-[10px]">Restocked product title</span>
              </div>
              <div className="p-2 bg-white border border-[#e1e3e5] rounded">
                <span className="text-[#202223] font-medium block">variant_title</span>
                <span className="text-[#616161] text-[10px]">Restocked variant title</span>
              </div>
              <div className="p-2 bg-white border border-[#e1e3e5] rounded">
                <span className="text-[#202223] font-medium block">product_price</span>
                <span className="text-[#616161] text-[10px]">Formatted currency price</span>
              </div>
              <div className="p-2 bg-white border border-[#e1e3e5] rounded">
                <span className="text-[#202223] font-medium block">checkout_permalink</span>
                <span className="text-[#616161] text-[10px]">1-Click pre-filled cart link</span>
              </div>
              <div className="p-2 bg-white border border-[#e1e3e5] rounded">
                <span className="text-[#202223] font-medium block">product_id</span>
                <span className="text-[#616161] text-[10px]">Shopify Product ID</span>
              </div>
            </div>
          </div>

          {/* Test Flow Trigger Bar */}
          <div className="pt-2.5 border-t border-[#f1f2f4] flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-[#202223] block">
                Test trigger dispatch
              </span>
              <span className="text-[11px] text-[#616161]">
                Emit a sample event to verify your active Shopify Flow automation workflows.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={`merchant@${shop}`}
                className="px-2.5 py-1.5 text-xs bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none w-52 font-sans"
              />
              <button
                type="button"
                onClick={handleTestTrigger}
                disabled={isTesting || navigation.state === "submitting"}
                className="px-3 py-1.5 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] hover:bg-[#f6f6f7] rounded-md transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isTesting ? "Emitting..." : "Send test trigger"}
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Smart Alert Pacing */}
        <div className="p-4 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#202223]">
              Smart restock pacing
            </h2>
            <p className="text-xs text-[#616161] mt-0.5">
              Control how customer notifications are dispatched when inventory is replenished to prevent instant sell-outs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-[#f1f2f4]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#202223] block">
                Notification batch size multiplier
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={formState.dripBatchMultiplier}
                  onChange={(e) => handleChange("dripBatchMultiplier", parseFloat(e.target.value) || 2.5)}
                  className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
                />
              </div>
              <p className="text-[11px] text-[#616161] leading-relaxed">
                Number of customers alerted per unit restocked (e.g. 2.5x with 4 units notifies 10 customers).
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#202223] block">
                Pause between batches (minutes)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="5"
                  value={formState.dripIntervalMinutes}
                  onChange={(e) => handleChange("dripIntervalMinutes", parseInt(e.target.value, 10) || 120)}
                  className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
                />
              </div>
              <p className="text-[11px] text-[#616161] leading-relaxed">
                Cooldown period before notifying the next group of customers if items remain in stock.
              </p>
            </div>
          </div>

          <div className="max-w-md space-y-1 pt-1">
            <label className="text-xs font-medium text-[#202223] block">
              Minimum restock threshold (units)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={formState.minRestockThreshold}
              onChange={(e) => handleChange("minRestockThreshold", parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
            />
            <p className="text-[11px] text-[#616161] leading-relaxed">
              Minimum inventory required to trigger restock notifications.
            </p>
          </div>
        </div>

        {/* Section 3: Storefront & Customer Notifications */}
        <div className="p-4 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#202223]">
              Storefront & notification preferences
            </h2>
            <p className="text-xs text-[#616161] mt-0.5">
              Customize the appearance of storefront restock buttons and customer notification details.
            </p>
          </div>

          <div className="pt-1 border-t border-[#f1f2f4] space-y-4">
            <ColorPickerInput
              label="Button & badge accent color"
              value={formState.accentColor}
              onChange={(color) => handleChange("accentColor", color)}
              description='Color used for the "Notify Me When Available" storefront button and badges.'
            />

            <ToggleSwitch
              label="Browser web push notifications"
              description="Allow shoppers to opt into instant notifications directly in their desktop or mobile browser."
              checked={formState.enableWebPush}
              onChange={(checked) => handleChange("enableWebPush", checked)}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#202223] block">
                  Sender name
                </label>
                <input
                  type="text"
                  value={formState.senderName}
                  onChange={(e) => handleChange("senderName", e.target.value)}
                  className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
                />
                <p className="text-[11px] text-[#616161]">
                  Sender name displayed on customer restock emails.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#202223] block">
                  Email subject line
                </label>
                <input
                  type="text"
                  value={formState.emailSubjectTemplate}
                  onChange={(e) => handleChange("emailSubjectTemplate", e.target.value)}
                  className="w-full px-3 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all font-sans"
                />
                <p className="text-[11px] text-[#616161]">
                  Supports the <code className="bg-[#f1f2f4] px-1 py-0.5 rounded text-[#202223] text-[10px]">{"{{product_title}}"}</code> template placeholder.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
