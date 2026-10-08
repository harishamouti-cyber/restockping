import React, { useState, useEffect, useRef } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendRestockNotificationEmail } from "../services/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settingsRecord = await db.restockSettings.findUnique({ where: { shop } });

  const settings = {
    dripBatchMultiplier: settingsRecord?.dripBatchMultiplier ?? 2.5,
    dripIntervalMinutes: settingsRecord?.dripIntervalMinutes ?? 120,
    minRestockThreshold: settingsRecord?.minRestockThreshold ?? 1,
    accentColor: settingsRecord?.accentColor ?? "#008060",
    senderName: settingsRecord?.senderName ?? "RestockPing Alerts",
    emailSubjectTemplate: settingsRecord?.emailSubjectTemplate ?? "Back in Stock: {{product_title}} is ready to ship",
    emailHeadline: settingsRecord?.emailHeadline ?? "Your item is back in stock",
    emailBodyText: settingsRecord?.emailBodyText ?? "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    emailButtonText: settingsRecord?.emailButtonText ?? "Claim in 1-Click Checkout →",
  };

  return json({
    settings,
    shop,
    defaultRecipient: "harishamouti@gmail.com",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SEND_TEST_EMAIL") {
    const targetEmail = String(formData.get("testEmail") || "").trim();
    const senderName = String(formData.get("senderName") || "Restock Alerts");
    const subjectTemplate = String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}}");
    const headlineText = String(formData.get("emailHeadline") || formData.get("headlineText") || "Your item is back in stock");
    const bodyText = String(formData.get("emailBodyText") || formData.get("bodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out.");
    const buttonText = String(formData.get("emailButtonText") || formData.get("buttonText") || "Claim in 1-Click Checkout →");
    const accentColor = String(formData.get("accentColor") || "#008060");

    if (!targetEmail || !targetEmail.includes("@")) {
      return json({ success: false, error: "Please enter a valid email address." }, { status: 400 });
    }

    try {
      await sendRestockNotificationEmail({
        to: targetEmail,
        shop: session.shop,
        productTitle: "The Out of Stock Snowboard (Test Delivery)",
        variantTitle: "Standard Edition",
        price: 885.95,
        variantId: "gid://shopify/ProductVariant/123456789",
        productImageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1.png",
        senderName,
        subjectTemplate,
        headlineText,
        bodyText,
        buttonText,
        accentColor,
      });

      return json({ success: true, message: `Test email delivered to ${targetEmail}!` });
    } catch (err: any) {
      console.error("[Test Send Error]:", err);
      return json(
        {
          success: false,
          error: `Delivery failed: ${err.message}`,
        },
        { status: 400 }
      );
    }
  }

  // Save Settings Intent
  const dripBatchMultiplier = parseFloat(String(formData.get("dripBatchMultiplier")) || "2.5") || 2.5;
  const dripIntervalMinutes = parseInt(String(formData.get("dripIntervalMinutes")) || "120", 10) || 120;
  const minRestockThreshold = parseInt(String(formData.get("minRestockThreshold")) || "1", 10) || 1;
  const accentColor = String(formData.get("accentColor") || "#008060");
  const senderName = String(formData.get("senderName") || "Restock Alerts");
  const emailSubjectTemplate = String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship");
  const emailHeadline = String(formData.get("emailHeadline") || "Your item is back in stock");
  const emailBodyText = String(formData.get("emailBodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out.");
  const emailButtonText = String(formData.get("emailButtonText") || "Claim in 1-Click Checkout →");

  await db.restockSettings.upsert({
    where: { shop: session.shop },
    update: {
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      accentColor,
      senderName,
      emailSubjectTemplate,
      emailHeadline,
      emailBodyText,
      emailButtonText,
    },
    create: {
      shop: session.shop,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      accentColor,
      senderName,
      emailSubjectTemplate,
      emailHeadline,
      emailBodyText,
      emailButtonText,
    },
  });

  return json({ success: true, message: "Settings saved successfully." });
};

export default function Settings() {
  const { settings, defaultRecipient, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [formState, setFormState] = useState(settings);
  const [testEmail, setTestEmail] = useState(defaultRecipient);
  const [isDirty, setIsDirty] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const subjectInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, isError = false) => {
    try {
      if (typeof window !== "undefined" && (window as any).shopify?.toast?.show) {
        (window as any).shopify.toast.show(message, isError ? { isError: true } : undefined);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (actionData?.success && (actionData as any).message) {
      showToast((actionData as any).message);
    } else if (actionData?.error) {
      showToast((actionData as any).error, true);
    }
  }, [actionData]);

  const handleChange = (field: string, value: any) => {
    setFormState((prev) => {
      const next = { ...prev, [field]: value };
      setIsDirty(true);
      return next;
    });
  };

  const insertVariable = (variable: string) => {
    if (subjectInputRef.current) {
      const input = subjectInputRef.current;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const text = input.value;
      const nextText = text.substring(0, start) + variable + text.substring(end);
      handleChange("emailSubjectTemplate", nextText);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      handleChange(
        "emailSubjectTemplate",
        `${formState.emailSubjectTemplate} ${variable}`.trim()
      );
    }
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.append("intent", "SAVE_SETTINGS");
    fd.append("dripBatchMultiplier", String(formState.dripBatchMultiplier));
    fd.append("dripIntervalMinutes", String(formState.dripIntervalMinutes || 120));
    fd.append("minRestockThreshold", String(formState.minRestockThreshold));
    fd.append("accentColor", formState.accentColor);
    fd.append("senderName", formState.senderName);
    fd.append("emailSubjectTemplate", formState.emailSubjectTemplate);
    fd.append("emailHeadline", formState.emailHeadline);
    fd.append("emailBodyText", formState.emailBodyText);
    fd.append("emailButtonText", formState.emailButtonText);
    submit(fd, { method: "POST" });
    setIsDirty(false);
  };

  const handleDiscard = () => {
    setFormState(settings);
    setIsDirty(false);
  };

  const handleSendTestEmail = () => {
    const fd = new FormData();
    fd.append("intent", "SEND_TEST_EMAIL");
    fd.append("testEmail", testEmail);
    fd.append("senderName", formState.senderName);
    fd.append("emailSubjectTemplate", formState.emailSubjectTemplate);
    fd.append("emailHeadline", formState.emailHeadline);
    fd.append("emailBodyText", formState.emailBodyText);
    fd.append("emailButtonText", formState.emailButtonText);
    fd.append("accentColor", formState.accentColor);
    submit(fd, { method: "POST" });
  };

  const isSendingTest =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SEND_TEST_EMAIL";

  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SAVE_SETTINGS";

  const shopCleanName = shop.replace(".myshopify.com", "");

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-24 font-sans text-[#202223] antialiased">
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

      <main className="max-w-[1180px] mx-auto px-4 py-4 space-y-4">
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
                disabled={isSaving}
                className="px-3 py-1 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {/* Delivery Verification Bar */}
        <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#008060] shrink-0" />
            <span className="text-xs font-semibold text-[#202223]">Delivery Verification:</span>
            <span className="text-xs text-[#616161]">Send a real email to verify 1-Click checkout links in your inbox</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] w-64 text-[#202223]"
              placeholder="Your email address"
            />
            <button
              type="button"
              disabled={isSendingTest}
              onClick={handleSendTestEmail}
              className="px-3 py-1 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              {isSendingTest ? "Sending..." : "Send Test Email"}
            </button>
          </div>
        </div>

        {/* 2-Column Responsive Workspace: Controls (Left) vs Live Email Preview (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-6 space-y-4">
            {/* Card A: Restock Email Content */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3.5">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Restock Email Content</span>
                <span className="text-[11px] text-[#6d7175]">Customize the transactional alert sent to shoppers when inventory replenishes.</span>
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Sender Name</label>
                <input
                  type="text"
                  value={formState.senderName}
                  onChange={(e) => handleChange("senderName", e.target.value)}
                  placeholder="e.g. Store Name Alerts"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#202223]">Subject Line</label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#8c9196] mr-0.5">Insert:</span>
                    <button
                      type="button"
                      onClick={() => insertVariable("{{product_title}}")}
                      className="px-1.5 py-0.5 text-[10px] font-medium bg-[#f1f2f4] text-[#202223] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer"
                    >
                      + Product
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable("{{product_price}}")}
                      className="px-1.5 py-0.5 text-[10px] font-medium bg-[#f1f2f4] text-[#202223] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer"
                    >
                      + Price
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable("{{store_name}}")}
                      className="px-1.5 py-0.5 text-[10px] font-medium bg-[#f1f2f4] text-[#202223] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer"
                    >
                      + Store
                    </button>
                  </div>
                </div>
                <input
                  ref={subjectInputRef}
                  type="text"
                  value={formState.emailSubjectTemplate}
                  onChange={(e) => handleChange("emailSubjectTemplate", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
                <span className="text-[11px] text-[#8c9196] mt-0.5 block">
                  Variables will be replaced dynamically with product and store details.
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Email Headline</label>
                <input
                  type="text"
                  value={formState.emailHeadline}
                  onChange={(e) => handleChange("emailHeadline", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Body Text</label>
                <textarea
                  rows={3}
                  value={formState.emailBodyText}
                  onChange={(e) => handleChange("emailBodyText", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Button Text</label>
                  <input
                    type="text"
                    value={formState.emailButtonText}
                    onChange={(e) => handleChange("emailButtonText", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Button Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formState.accentColor}
                      onChange={(e) => handleChange("accentColor", e.target.value)}
                      className="w-8 h-8 rounded border border-[#d2d5d8] p-0.5 bg-white cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formState.accentColor}
                      onChange={(e) => handleChange("accentColor", e.target.value)}
                      className="w-full px-2 py-1 text-xs font-mono uppercase bg-white border border-[#d2d5d8] rounded-md text-[#202223]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card B: Pacing Configuration Card */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Pacing & Dispatch Rules</span>
                <span className="text-[11px] text-[#6d7175]">Control restock alert cohorts to prevent flash-crowd overselling.</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Pacing Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={formState.dripBatchMultiplier}
                    onChange={(e) => handleChange("dripBatchMultiplier", parseFloat(e.target.value) || 2.5)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                  <span className="text-[11px] text-[#8c9196] mt-0.5 block">e.g. 2.5x of restocked stock.</span>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Min Restock Units</label>
                  <input
                    type="number"
                    min="1"
                    value={formState.minRestockThreshold}
                    onChange={(e) => handleChange("minRestockThreshold", parseInt(e.target.value, 10) || 1)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                  <span className="text-[11px] text-[#8c9196] mt-0.5 block">Minimum units before alerts trigger.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Email Preview Column */}
          <div className="lg:col-span-6 sticky top-4">
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-[#202223] block">Live Customer Email Preview</span>
                  <span className="text-[11px] text-[#8c9196]">Real-time rendering of subscriber notifications</span>
                </div>
                <div className="flex items-center bg-[#f1f2f4] p-0.5 rounded-md border border-[#e1e3e5]">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice("desktop")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      previewDevice === "desktop"
                        ? "bg-white text-[#202223] shadow-2xs font-semibold"
                        : "text-[#616161] hover:text-[#202223]"
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice("mobile")}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      previewDevice === "mobile"
                        ? "bg-white text-[#202223] shadow-2xs font-semibold"
                        : "text-[#616161] hover:text-[#202223]"
                    }`}
                  >
                    Mobile
                  </button>
                </div>
              </div>

              {/* Rendered Preview Box */}
              <div className="border border-[#e1e3e5] rounded-lg bg-[#f6f6f7] p-4 sm:p-6 text-left min-h-[460px] flex items-center justify-center transition-all duration-200">
                <div
                  className={`mx-auto bg-white border border-[#e1e3e5] rounded-xl p-5 space-y-3.5 shadow-xs transition-all duration-200 ${
                    previewDevice === "mobile" ? "w-[340px] max-w-full" : "w-full max-w-[480px]"
                  }`}
                >
                  <span className="inline-block px-2 py-0.5 bg-[#e3f1df] text-[#008060] text-[10px] font-semibold uppercase tracking-wide rounded">
                    ● Restock Notice
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-[#202223] leading-snug break-words">
                    {formState.emailHeadline || "Your item is back in stock"}
                  </h3>
                  <p className="text-xs text-[#616161] leading-relaxed break-words">
                    {formState.emailBodyText ||
                      "Good news! An item you requested is available again. Complete your order now before inventory runs out."}
                  </p>

                  {/* Product Box with Live Photography */}
                  <div className="p-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg flex items-center gap-3">
                    <img
                      src="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1.png"
                      alt="The Out of Stock Snowboard"
                      className="w-14 h-14 rounded-md object-cover border border-[#e1e3e5] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-xs text-[#111827] block truncate">
                        The Out of Stock Snowboard
                      </span>
                      <span className="text-[11px] text-[#6b7280] block mt-0.5">
                        Standard Edition · <strong className="text-[#111827]">$885.95</strong>
                      </span>
                    </div>
                  </div>

                  <div
                    style={{ backgroundColor: formState.accentColor || "#008060" }}
                    className="w-full py-2.5 text-center text-xs font-semibold text-white rounded cursor-default shadow-xs break-words transition-colors"
                  >
                    {formState.emailButtonText || "Claim in 1-Click Checkout →"}
                  </div>
                  <div className="text-[10px] text-center text-[#8c9196] -mt-1">
                    Inventory is reserved on a first-come, first-served basis.
                  </div>

                  <div className="text-[11px] text-center text-[#8c9196] pt-2.5 border-t border-[#f1f2f4]">
                    Delivered automatically on behalf of <strong>{shopCleanName}</strong> via RestockPing
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
