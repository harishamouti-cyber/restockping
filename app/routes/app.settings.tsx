import React, { useState, useEffect, useRef } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendRestockNotificationEmail } from "../services/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const defaultBrand = shop.replace(".myshopify.com", "");
  const formattedBrand = defaultBrand.charAt(0).toUpperCase() + defaultBrand.slice(1);

  const settingsRecord = await db.restockSettings.findUnique({ where: { shop } });

  const settings = {
    storeDisplayName: settingsRecord?.storeDisplayName || formattedBrand,
    dripBatchMultiplier: settingsRecord?.dripBatchMultiplier ?? 2.5,
    dripIntervalMinutes: settingsRecord?.dripIntervalMinutes ?? 120,
    minRestockThreshold: settingsRecord?.minRestockThreshold ?? 1,
    accentColor: settingsRecord?.accentColor ?? "#805100",
    senderName: settingsRecord?.senderName ?? "Fulfillment Center",
    emailSubjectTemplate: settingsRecord?.emailSubjectTemplate ?? "Back in Stock: {{product_title}} is ready to ship",
    emailHeadline: settingsRecord?.emailHeadline ?? "Your item is back in stock",
    emailBodyText: settingsRecord?.emailBodyText ?? "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    emailButtonText: settingsRecord?.emailButtonText ?? "Claim in 1-Click Checkout →",
  };

  // Fetch real product with a live Shopify CDN image from the store catalog
  let sampleProduct = {
    title: "The Out of Stock Snowboard",
    variantTitle: "Standard Edition",
    price: 885.95,
    variantId: "gid://shopify/ProductVariant/123456789",
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1.png",
  };

  try {
    const response = await admin.graphql(`
      query GetSampleProduct {
        products(first: 1) {
          nodes {
            title
            featuredImage {
              url
            }
            variants(first: 1) {
              nodes {
                id
                title
                price
                image {
                  url
                }
              }
            }
          }
        }
      }
    `);
    const data = await response.json();
    const node = data.data?.products?.nodes?.[0];
    if (node) {
      const variantNode = node.variants?.nodes?.[0];
      sampleProduct = {
        title: node.title,
        variantTitle: variantNode?.title || "Standard Edition",
        price: parseFloat(variantNode?.price || "885.95"),
        variantId: variantNode?.id || "gid://shopify/ProductVariant/123456789",
        imageUrl: variantNode?.image?.url || node.featuredImage?.url || sampleProduct.imageUrl,
      };
    }
  } catch (err) {
    console.warn("[Settings] Catalog sample query error:", err);
  }

  return json({
    settings,
    shop,
    sampleProduct,
    defaultRecipient: "harishamouti@gmail.com",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SEND_TEST_EMAIL") {
    const targetEmail = String(formData.get("testEmail") || "").trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      return json({ success: false, error: "Please enter a valid email address." }, { status: 400 });
    }

    try {
      await sendRestockNotificationEmail({
        to: targetEmail,
        shop: session.shop,
        storeDisplayName: String(formData.get("storeDisplayName") || ""),
        productTitle: String(formData.get("productTitle") || "The Out of Stock Snowboard"),
        variantTitle: String(formData.get("variantTitle") || "Standard Edition"),
        price: parseFloat(String(formData.get("price")) || "0"),
        variantId: String(formData.get("variantId") || "gid://shopify/ProductVariant/123456789"),
        productImageUrl: String(formData.get("productImageUrl") || ""),
        senderName: String(formData.get("senderName") || "Restock Alerts"),
        headline: String(formData.get("emailHeadline") || "Your item is back in stock"),
        bodyText: String(formData.get("emailBodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out."),
        buttonText: String(formData.get("emailButtonText") || "Claim in 1-Click Checkout →"),
        buttonColor: String(formData.get("accentColor") || "#805100"),
        subjectTemplate: String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship"),
      });
      return json({ success: true, message: `Test email sent to ${targetEmail} with live product photography!` });
    } catch (err: any) {
      console.error("[Test Send Error]:", err);
      return json({ success: false, error: `Delivery failed: ${err.message}` }, { status: 400 });
    }
  }

  // Save Settings
  const storeDisplayName = String(formData.get("storeDisplayName") || "").trim();
  const dripBatchMultiplier = parseFloat(String(formData.get("dripBatchMultiplier")) || "2.5") || 2.5;
  const dripIntervalMinutes = parseInt(String(formData.get("dripIntervalMinutes")) || "120", 10) || 120;
  const minRestockThreshold = parseInt(String(formData.get("minRestockThreshold")) || "1", 10) || 1;
  const accentColor = String(formData.get("accentColor") || "#805100");
  const senderName = String(formData.get("senderName") || "Fulfillment Center");
  const emailSubjectTemplate = String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship");
  const emailHeadline = String(formData.get("emailHeadline") || "Your item is back in stock");
  const emailBodyText = String(formData.get("emailBodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out.");
  const emailButtonText = String(formData.get("emailButtonText") || "Claim in 1-Click Checkout →");

  await db.restockSettings.upsert({
    where: { shop: session.shop },
    update: {
      storeDisplayName,
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
      storeDisplayName,
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
  const { settings, shop, sampleProduct, defaultRecipient } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [formState, setFormState] = useState(settings);
  const [testEmail, setTestEmail] = useState(defaultRecipient);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [isDirty, setIsDirty] = useState(false);
  const [activeField, setActiveField] = useState<string>("emailSubjectTemplate");

  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

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
    setFormState((prev: any) => {
      const next = { ...prev, [field]: value };
      setIsDirty(JSON.stringify(next) !== JSON.stringify(settings));
      return next;
    });
  };

  const insertVariable = (variable: string) => {
    const targetKey = activeField in formState ? activeField : "emailSubjectTemplate";
    const element = inputRefs.current[targetKey];

    if (element && typeof element.selectionStart === "number") {
      const start = element.selectionStart;
      const end = element.selectionEnd ?? start;
      const text = String(formState[targetKey as keyof typeof formState] || "");
      const nextText = text.substring(0, start) + variable + text.substring(end);
      handleChange(targetKey, nextText);
      setTimeout(() => {
        element.focus();
        element.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      const currentVal = String(formState[targetKey as keyof typeof formState] || "");
      handleChange(targetKey, `${currentVal} ${variable}`.trim());
    }
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.append("intent", "SAVE_SETTINGS");
    Object.entries(formState).forEach(([k, v]) => fd.append(k, String(v)));
    submit(fd, { method: "POST" });
    setIsDirty(false);
  };

  const handleDiscard = () => {
    setFormState(settings);
    setIsDirty(false);
  };

  const handleSendTest = () => {
    const fd = new FormData();
    fd.append("intent", "SEND_TEST_EMAIL");
    fd.append("testEmail", testEmail);
    fd.append("storeDisplayName", formState.storeDisplayName);
    fd.append("senderName", formState.senderName);
    fd.append("emailSubjectTemplate", formState.emailSubjectTemplate);
    fd.append("emailHeadline", formState.emailHeadline);
    fd.append("emailBodyText", formState.emailBodyText);
    fd.append("emailButtonText", formState.emailButtonText);
    fd.append("accentColor", formState.accentColor);
    // Real catalog product parameters
    fd.append("productTitle", sampleProduct.title);
    fd.append("variantTitle", sampleProduct.variantTitle);
    fd.append("price", sampleProduct.price.toString());
    fd.append("variantId", sampleProduct.variantId);
    fd.append("productImageUrl", sampleProduct.imageUrl);
    submit(fd, { method: "POST" });
  };

  const isSendingTest =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SEND_TEST_EMAIL";

  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SAVE_SETTINGS";

  const displayBrand =
    formState.storeDisplayName?.trim() || shop.replace(".myshopify.com", "");

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

      <main className="max-w-[1240px] mx-auto px-4 py-4 space-y-3.5">
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

        {/* Verification Action Banner */}
        <div className="bg-white border border-[#e1e3e5] rounded-xl px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#008060]" />
            <span className="text-xs font-semibold text-[#202223]">Delivery Verification:</span>
            <span className="text-xs text-[#616161]">Send a real email with live catalog photography to your inbox</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-[#d2d5d8] rounded-md w-64 focus:outline-none focus:border-[#008060] text-[#202223]"
              placeholder="Your email address"
            />
            <button
              type="button"
              onClick={handleSendTest}
              disabled={isSendingTest}
              className="px-3.5 py-1 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {isSendingTest ? "Sending..." : "Send Test Email"}
            </button>
          </div>
        </div>

        {/* 2-Column Split: Controls vs Sticky WYSIWYG Device Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          {/* Left Column: Form Controls */}
          <div className="lg:col-span-6 space-y-3.5">
            {/* Card 1: Email Content */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3.5">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Restock Email Content</span>
                <p className="text-[11px] text-[#6d7175]">Customize the transactional alert sent to shoppers when inventory replenishes.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Sender Name</label>
                  <input
                    ref={(el) => (inputRefs.current.senderName = el)}
                    type="text"
                    value={formState.senderName}
                    onFocus={() => setActiveField("senderName")}
                    onChange={(e) => handleChange("senderName", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Store Brand Name</label>
                  <input
                    ref={(el) => (inputRefs.current.storeDisplayName = el)}
                    type="text"
                    value={formState.storeDisplayName}
                    placeholder="e.g. MyStore"
                    onFocus={() => setActiveField("storeDisplayName")}
                    onChange={(e) => handleChange("storeDisplayName", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#202223]">Subject Line</label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#8c9196]">Insert:</span>
                    <button
                      type="button"
                      onClick={() => insertVariable("{{product_title}}")}
                      className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                    >
                      + Product
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable("{{price}}")}
                      className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                    >
                      + Price
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable("{{store}}")}
                      className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                    >
                      + Store
                    </button>
                  </div>
                </div>
                <input
                  ref={(el) => (inputRefs.current.emailSubjectTemplate = el)}
                  type="text"
                  value={formState.emailSubjectTemplate}
                  onFocus={() => setActiveField("emailSubjectTemplate")}
                  onChange={(e) => handleChange("emailSubjectTemplate", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
                <span className="text-[10px] text-[#8c9196] mt-0.5 block">
                  Variables will be replaced dynamically with live product and store details.
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Email Headline</label>
                <input
                  ref={(el) => (inputRefs.current.emailHeadline = el)}
                  type="text"
                  value={formState.emailHeadline}
                  onFocus={() => setActiveField("emailHeadline")}
                  onChange={(e) => handleChange("emailHeadline", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Body Text</label>
                <textarea
                  ref={(el) => (inputRefs.current.emailBodyText = el)}
                  rows={3}
                  value={formState.emailBodyText}
                  onFocus={() => setActiveField("emailBodyText")}
                  onChange={(e) => handleChange("emailBodyText", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Button Text</label>
                  <input
                    ref={(el) => (inputRefs.current.emailButtonText = el)}
                    type="text"
                    value={formState.emailButtonText}
                    onFocus={() => setActiveField("emailButtonText")}
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
                      className="w-8 h-8 rounded border border-[#d2d5d8] p-0.5 cursor-pointer bg-white shrink-0"
                    />
                    <input
                      type="text"
                      value={formState.accentColor}
                      onChange={(e) => handleChange("accentColor", e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono uppercase bg-white border border-[#d2d5d8] rounded-md text-[#202223]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Pacing & Dispatch Rules */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Pacing & Dispatch Rules</span>
                <p className="text-[11px] text-[#6d7175]">Control restock alert cohorts to prevent flash-crowd overselling.</p>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
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

          {/* Right Column: Sticky Live Customer Email Preview */}
          <div className="lg:col-span-6 sticky top-4 self-start space-y-2">
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs font-semibold text-[#202223] block">Live Customer Email Preview</span>
                  <span className="text-[11px] text-[#8c9196]">Rendering live catalog product & photograph</span>
                </div>
                {/* Segmented Device Switcher */}
                <div className="inline-flex rounded-lg bg-[#f1f2f4] p-0.5 border border-[#e1e3e5]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("desktop")}
                    className={`px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                      previewMode === "desktop" ? "bg-white text-[#202223] shadow-xs font-semibold" : "text-[#616161]"
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("mobile")}
                    className={`px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                      previewMode === "mobile" ? "bg-white text-[#202223] shadow-xs font-semibold" : "text-[#616161]"
                    }`}
                  >
                    Mobile
                  </button>
                </div>
              </div>

              {/* Responsive Container / Mobile Phone Bezel */}
              <div
                className={`w-full transition-all duration-300 flex justify-center ${
                  previewMode === "mobile"
                    ? "max-w-[340px] p-2.5 bg-slate-900 rounded-[32px] shadow-xl border-4 border-slate-700"
                    : "max-w-[500px]"
                }`}
              >
                {/* Simulated Email Card */}
                <div className="w-full bg-white border border-[#e1e3e5] rounded-lg p-5 shadow-xs space-y-3.5">
                  {previewMode === "mobile" && (
                    <div className="w-16 h-1 bg-slate-300 rounded-full mx-auto -mt-2 mb-2" />
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e3f1df] text-[#008060] text-[10px] font-semibold uppercase rounded">
                    ● Restock Notice
                  </span>
                  <h3 className="text-base font-bold text-[#202223] leading-snug break-words">
                    {formState.emailHeadline || "Your item is back in stock"}
                  </h3>
                  <p className="text-xs text-[#6d7175] leading-relaxed break-words">
                    {formState.emailBodyText ||
                      "Good news! An item you requested is available again. Complete your order now before inventory runs out."}
                  </p>

                  {/* Real Product Card with True CDN Image */}
                  <div className="flex items-center gap-3 p-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl">
                    <img
                      src={sampleProduct.imageUrl}
                      alt={sampleProduct.title}
                      className="w-16 h-16 rounded-lg object-cover border border-[#e5e7eb] bg-white shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-[#111827] block truncate">
                        {sampleProduct.title}
                      </span>
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px] text-[#4b5563] font-medium">
                        {sampleProduct.variantTitle}
                      </span>
                      <span className="text-xs font-bold text-[#111827] block mt-1">
                        ${sampleProduct.price.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{ backgroundColor: formState.accentColor || "#805100" }}
                    className="w-full py-2.5 text-xs font-semibold text-white text-center rounded-md cursor-default shadow-xs break-words transition-colors"
                  >
                    {formState.emailButtonText || "Claim in 1-Click Checkout →"}
                  </div>
                  <div className="text-[10px] text-center text-[#8c9196] -mt-1">
                    Inventory is reserved on a first-come, first-served basis.
                  </div>

                  <div className="text-center pt-2 border-t border-[#f1f2f4]">
                    <span className="text-[10px] text-[#8c9196]">
                      Delivered automatically on behalf of{" "}
                      <strong>{displayBrand}</strong> via RestockPing
                    </span>
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
