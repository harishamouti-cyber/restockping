import React, { useState, useEffect, useRef } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendRestockNotificationEmail } from "../services/email.server";
import { getAllActiveCatalogProducts, type CatalogProductOption } from "../services/catalog.server";
import { sanitizeShopBrandName } from "../utils/brand";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settingsRecord, catalogProducts] = await Promise.all([
    db.restockSettings.findUnique({ where: { shop } }),
    getAllActiveCatalogProducts(admin),
  ]);

  const sanitizedDefault = sanitizeShopBrandName(shop);
  const activeSettings = settingsRecord || {
    storeDisplayName: sanitizedDefault,
    dripBatchMultiplier: 2.5,
    dripIntervalMinutes: 120,
    minRestockThreshold: 1,
    accentColor: "#008060",
    senderName: "Fulfillment Center",
    incentiveDiscountCode: "",
    emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    emailHeadline: "Your item is back in stock",
    emailBodyText: "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
    emailButtonText: "Claim In-Stock Item →",
    storefrontButtonText: "Notify Me When Available",
    storefrontSuccessMessage: "You're on the waitlist! We'll email you the moment stock returns.",
    storefrontButtonRadius: 6,
  };

  const isSampleCatalog =
    catalogProducts.length === 0 ||
    catalogProducts.some((p) => p.productId.includes("sample_"));

  const defaultPreview: CatalogProductOption = catalogProducts[0] || {
    productId: "sample_p1",
    variantId: "gid://shopify/ProductVariant/123456789",
    productTitle: "The Out of Stock Snowboard",
    variantTitle: "Standard Edition",
    price: 885.95,
    imageUrl: "",
  };

  return json({
    settings: {
      ...activeSettings,
      storeDisplayName: activeSettings.storeDisplayName || sanitizedDefault,
      incentiveDiscountCode: (activeSettings as any).incentiveDiscountCode || "",
      emailButtonText: activeSettings.emailButtonText || "Claim In-Stock Item →",
    },
    shop,
    previewItem: defaultPreview,
    catalogProducts,
    isSampleCatalog,
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
        productTitle: String(formData.get("previewProductTitle") || "The Out of Stock Snowboard"),
        variantTitle: String(formData.get("previewVariantTitle") || "Standard Edition"),
        price: parseFloat(String(formData.get("previewPrice")) || "885.95"),
        variantId: String(formData.get("previewVariantId") || "gid://shopify/ProductVariant/123456789"),
        productImageUrl: String(formData.get("previewImageUrl") || ""),
        senderName: String(formData.get("senderName") || "Restock Alerts"),
        headline: String(formData.get("emailHeadline") || "Your item is back in stock"),
        bodyText: String(formData.get("emailBodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out."),
        buttonText: String(formData.get("emailButtonText") || "Claim In-Stock Item →"),
        buttonColor: String(formData.get("accentColor") || "#008060"),
        subjectTemplate: String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship"),
        discountCode: String(formData.get("incentiveDiscountCode") || "").trim() || undefined,
      });
      return json({ success: true, message: `Test email with real store photography delivered to ${targetEmail}!` });
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
  const accentColor = String(formData.get("accentColor") || "#008060");
  const senderName = String(formData.get("senderName") || "Fulfillment Center");
  const incentiveDiscountCode = String(formData.get("incentiveDiscountCode") || "").trim().toUpperCase();
  const emailSubjectTemplate = String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship");
  const emailHeadline = String(formData.get("emailHeadline") || "Your item is back in stock");
  const emailBodyText = String(formData.get("emailBodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out.");
  const emailButtonText = String(formData.get("emailButtonText") || "Claim In-Stock Item →");
  const storefrontButtonText = String(formData.get("storefrontButtonText") || "Notify Me When Available");
  const storefrontSuccessMessage = String(formData.get("storefrontSuccessMessage") || "You're on the waitlist! We'll email you the moment stock returns.");
  const storefrontButtonRadius = parseInt(String(formData.get("storefrontButtonRadius")) || "6", 10);

  await db.restockSettings.upsert({
    where: { shop: session.shop },
    update: {
      storeDisplayName,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      accentColor,
      senderName,
      incentiveDiscountCode,
      emailSubjectTemplate,
      emailHeadline,
      emailBodyText,
      emailButtonText,
      storefrontButtonText,
      storefrontSuccessMessage,
      storefrontButtonRadius,
    },
    create: {
      shop: session.shop,
      storeDisplayName,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      accentColor,
      senderName,
      incentiveDiscountCode,
      emailSubjectTemplate,
      emailHeadline,
      emailBodyText,
      emailButtonText,
      storefrontButtonText,
      storefrontSuccessMessage,
      storefrontButtonRadius,
    },
  });

  return json({ success: true, message: "Settings saved successfully." });
};

export default function Settings() {
  const { settings, shop, previewItem, catalogProducts, isSampleCatalog, defaultRecipient } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [formState, setFormState] = useState(settings);
  const [testEmail, setTestEmail] = useState(defaultRecipient);
  const [selectedPreviewVariantId, setSelectedPreviewVariantId] = useState<string>(
    previewItem?.variantId || catalogProducts?.[0]?.variantId || ""
  );
  const [previewTab, setPreviewTab] = useState<"email" | "storefront">("email");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [simulatedPDPState, setSimulatedPDPState] = useState<"idle" | "subscribed">("idle");
  const [activeField, setActiveField] = useState<string>("emailSubjectTemplate");
  const [isDirty, setIsDirty] = useState(false);
  const [imgLoadError, setImgLoadError] = useState(false);

  useEffect(() => {
    setImgLoadError(false);
  }, [selectedPreviewVariantId]);

  const activePreviewItem: CatalogProductOption =
    (catalogProducts || []).find((p) => p.variantId === selectedPreviewVariantId) || previewItem;

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

  const insertVariableIntoField = (targetKey: string, variable: string) => {
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

  const renderVariableChips = (targetField: string) => (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-[#8c9196]">Insert:</span>
      <button
        type="button"
        onClick={() => insertVariableIntoField(targetField, "{{product_title}}")}
        className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer"
        title="Insert product title"
      >
        + Product
      </button>
      <button
        type="button"
        onClick={() => insertVariableIntoField(targetField, "{{price}}")}
        className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer"
        title="Insert product price"
      >
        + Price
      </button>
      <button
        type="button"
        onClick={() => insertVariableIntoField(targetField, "{{store}}")}
        className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer"
        title="Insert store name"
      >
        + Store
      </button>
    </div>
  );

  const insertVariableIntoActiveField = (variable: string) => {
    insertVariableIntoField(activeField || "emailSubjectTemplate", variable);
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
    fd.append("incentiveDiscountCode", formState.incentiveDiscountCode || "");
    fd.append("emailSubjectTemplate", formState.emailSubjectTemplate);
    fd.append("emailHeadline", formState.emailHeadline);
    fd.append("emailBodyText", formState.emailBodyText);
    fd.append("emailButtonText", formState.emailButtonText);
    fd.append("accentColor", formState.accentColor);
    // Real selected catalog product parameters
    fd.append("previewProductTitle", activePreviewItem.productTitle);
    fd.append("previewVariantTitle", activePreviewItem.variantTitle);
    fd.append("previewPrice", String(activePreviewItem.price));
    fd.append("previewVariantId", activePreviewItem.variantId);
    fd.append("previewImageUrl", activePreviewItem.imageUrl || "");
    submit(fd, { method: "POST" });
  };

  const isSendingTest =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SEND_TEST_EMAIL";

  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SAVE_SETTINGS";

  const displayBrand =
    formState.storeDisplayName?.trim() || sanitizeShopBrandName(shop);

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

        {/* 2-Column Split: Controls vs Sticky Live Device Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          {/* Left Column: Form Controls */}
          <div className="lg:col-span-6 space-y-3.5">
            {/* Card 1: Restock Email Copywriting */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3.5">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Restock Email Copywriting</span>
                <p className="text-[11px] text-[#6d7175]">
                  Customize the transactional alert sent to shoppers when inventory replenishes.
                </p>
              </div>

              {/* Contextual Token Bar Above Text Inputs */}
              <div className="bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#008060]" />
                  <span className="text-[11px] font-medium text-[#202223]">
                    Insert placeholder into active field:
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => insertVariableIntoActiveField("{{product_title}}")}
                    className="px-2 py-0.5 text-[10px] font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer shadow-2xs"
                    title="Insert {{product_title}}"
                  >
                    + Product Title
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariableIntoActiveField("{{price}}")}
                    className="px-2 py-0.5 text-[10px] font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer shadow-2xs"
                    title="Insert {{price}}"
                  >
                    + Product Price
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariableIntoActiveField("{{store}}")}
                    className="px-2 py-0.5 text-[10px] font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer shadow-2xs"
                    title="Insert {{store}}"
                  >
                    + Store Name
                  </button>
                </div>
              </div>

              {/* Sender Name & Brand Name */}
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
                    placeholder="e.g. RankPilot"
                    onFocus={() => setActiveField("storeDisplayName")}
                    onChange={(e) => handleChange("storeDisplayName", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                </div>
              </div>

              {/* Subject Line & Token Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#202223]">Subject Line</label>
                  {renderVariableChips("emailSubjectTemplate")}
                </div>
                <input
                  ref={(el) => (inputRefs.current.emailSubjectTemplate = el)}
                  type="text"
                  value={formState.emailSubjectTemplate}
                  onFocus={() => setActiveField("emailSubjectTemplate")}
                  onChange={(e) => handleChange("emailSubjectTemplate", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              {/* Headline & Token Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#202223]">Email Headline</label>
                  {renderVariableChips("emailHeadline")}
                </div>
                <input
                  ref={(el) => (inputRefs.current.emailHeadline = el)}
                  type="text"
                  value={formState.emailHeadline}
                  onFocus={() => setActiveField("emailHeadline")}
                  onChange={(e) => handleChange("emailHeadline", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              {/* Body Text & Token Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#202223]">Body Text</label>
                  {renderVariableChips("emailBodyText")}
                </div>
                <textarea
                  ref={(el) => (inputRefs.current.emailBodyText = el)}
                  rows={3}
                  value={formState.emailBodyText}
                  onFocus={() => setActiveField("emailBodyText")}
                  onChange={(e) => handleChange("emailBodyText", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223] leading-relaxed"
                />
              </div>

              {/* Button Text & Accent Color */}
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

              {/* Incentive Discount Code */}
              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">
                  Recovery Discount Code (Optional)
                </label>
                <input
                  ref={(el) => (inputRefs.current.incentiveDiscountCode = el)}
                  type="text"
                  value={formState.incentiveDiscountCode || ""}
                  placeholder="e.g. RESTOCK10"
                  onFocus={() => setActiveField("incentiveDiscountCode")}
                  onChange={(e) => handleChange("incentiveDiscountCode", e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
                <span className="text-[11px] text-[#6d7175] mt-1 block">
                  Auto-applied to the customer's direct checkout cart link to boost restock conversions.
                </span>
              </div>
            </div>

            {/* Card 2: Storefront PDP Button Controls */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3.5">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Storefront PDP Button & Form</span>
                <p className="text-[11px] text-[#6d7175]">
                  Configure the button shown on out-of-stock product pages.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Storefront Button Text</label>
                <input
                  ref={(el) => (inputRefs.current.storefrontButtonText = el)}
                  type="text"
                  value={formState.storefrontButtonText}
                  onFocus={() => setActiveField("storefrontButtonText")}
                  onChange={(e) => handleChange("storefrontButtonText", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Signup Success Message</label>
                <input
                  ref={(el) => (inputRefs.current.storefrontSuccessMessage = el)}
                  type="text"
                  value={formState.storefrontSuccessMessage}
                  onFocus={() => setActiveField("storefrontSuccessMessage")}
                  onChange={(e) => handleChange("storefrontSuccessMessage", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#202223] block mb-1">Button Corner Radius (px)</label>
                <input
                  ref={(el) => (inputRefs.current.storefrontButtonRadius = el as any)}
                  type="number"
                  min="0"
                  max="30"
                  value={formState.storefrontButtonRadius}
                  onFocus={() => setActiveField("storefrontButtonRadius")}
                  onChange={(e) => handleChange("storefrontButtonRadius", parseInt(e.target.value, 10) || 0)}
                  className="w-32 px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                />
              </div>
            </div>

            {/* Card 3: Inventory Pacing & Dispatch Rules */}
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-3">
              <div>
                <span className="text-xs font-semibold text-[#202223] block">Inventory Pacing & Dispatch Rules</span>
                <p className="text-[11px] text-[#6d7175]">Control restock alert cohorts and pacing intervals to prevent simultaneous store traffic spikes.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <span className="text-[11px] text-[#8c9196] mt-0.5 block">e.g. 2.5x restocked units.</span>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Cooldown Window (Min)</label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={formState.dripIntervalMinutes}
                    onChange={(e) => handleChange("dripIntervalMinutes", parseInt(e.target.value, 10) || 120)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                  <span className="text-[11px] text-[#8c9196] mt-0.5 block">Pause between cohorts.</span>
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
                  <span className="text-[11px] text-[#8c9196] mt-0.5 block">Threshold before alerts fire.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Live Device & Storefront Preview */}
          <div className="lg:col-span-6 sticky top-6 self-start z-10 space-y-2.5">
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col items-center">
              {/* Catalog Product Selection Bar */}
              <div className="w-full bg-[#f9fafb] border border-[#e1e3e5] rounded-lg p-2.5 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <label className="text-[11px] font-semibold text-[#616161] shrink-0">
                    Preview Product:
                  </label>
                  <select
                    value={selectedPreviewVariantId}
                    onChange={(e) => setSelectedPreviewVariantId(e.target.value)}
                    className="w-full sm:w-auto flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223] truncate"
                  >
                    {(catalogProducts || []).map((p) => (
                      <option key={p.variantId} value={p.variantId}>
                        {p.productTitle} — {p.variantTitle} (${p.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
                {isSampleCatalog && (
                  <span
                    className="text-[10px] font-semibold bg-[#fff4e5] text-[#b98900] px-2 py-0.5 rounded border border-[#f5b854] shrink-0"
                    title="Store catalog returned no products; displaying sample catalog"
                  >
                    Sample Data
                  </span>
                )}
              </div>

              <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3">
                {/* Primary Preview Mode Switcher */}
                <div className="inline-flex rounded-lg bg-[#f1f2f4] p-0.5 border border-[#e1e3e5]">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("email")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      previewTab === "email"
                        ? "bg-white text-[#202223] shadow-xs font-semibold"
                        : "text-[#616161] hover:text-[#202223]"
                    }`}
                  >
                    Email Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("storefront")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      previewTab === "storefront"
                        ? "bg-white text-[#202223] shadow-xs font-semibold"
                        : "text-[#616161] hover:text-[#202223]"
                    }`}
                  >
                    Storefront PDP
                  </button>
                </div>

                {previewTab === "email" ? (
                  /* Segmented Device Switcher */
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
                ) : (
                  <span className="text-[11px] text-[#008060] font-medium bg-[#e3f1df] px-2 py-0.5 rounded">
                    0.00 CLS Native Block
                  </span>
                )}
              </div>

              {previewTab === "email" ? (
                /* Customer Email Preview */
                <div
                  className={`w-full transition-all duration-300 flex justify-center ${
                    previewMode === "mobile"
                      ? "max-w-[340px] p-3 bg-[#18181b] rounded-[44px] shadow-2xl border-[3px] border-[#27272a] relative mx-auto"
                      : "max-w-[500px]"
                  }`}
                >
                  <div
                    className={`w-full bg-white border border-[#e1e3e5] p-5 shadow-xs space-y-3.5 ${
                      previewMode === "mobile" ? "rounded-[32px] overflow-hidden" : "rounded-lg"
                    }`}
                  >
                    {previewMode === "mobile" && (
                      <div className="flex items-center justify-center gap-1.5 -mt-2 mb-3">
                        <div className="w-12 h-1 bg-[#d4d4d8] rounded-full" />
                        <div className="w-1.5 h-1.5 bg-[#d4d4d8] rounded-full" />
                      </div>
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

                    {/* Clean Product Row with Aspect-Ratio Preserving Container & Deliberate No-Image State */}
                    <div className="flex items-center gap-3 p-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg">
                      <div className="w-16 h-22 bg-white border border-[#e5e7eb] rounded-lg flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                        {activePreviewItem.imageUrl && !imgLoadError ? (
                          <img
                            src={activePreviewItem.imageUrl}
                            alt={activePreviewItem.productTitle}
                            onError={() => setImgLoadError(true)}
                            className="max-w-full max-h-full object-contain block mx-auto"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <span className="text-sm text-[#9ca3af]">📷</span>
                            <span className="text-[9px] text-[#9ca3af] font-medium leading-tight mt-0.5">
                              No image
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-[#111827] block truncate">
                          {activePreviewItem.productTitle}
                        </span>
                        <span className="text-[11px] text-[#6b7280]">
                          {activePreviewItem.variantTitle} · <strong className="text-[#111827]">${activePreviewItem.price.toFixed(2)}</strong>
                        </span>
                      </div>
                    </div>

                    <div
                      style={{ backgroundColor: formState.accentColor || "#008060" }}
                      className="w-full py-2.5 text-xs font-semibold text-white text-center rounded-md cursor-default shadow-xs transition-colors"
                    >
                      {formState.emailButtonText || "Claim In-Stock Item →"}
                    </div>
                    {formState.incentiveDiscountCode && (
                      <div className="text-[11px] font-medium text-center text-[#008060] bg-[#e3f1df] py-1 px-2 rounded -mt-1">
                        Code <strong>{formState.incentiveDiscountCode}</strong> automatically applied at checkout!
                      </div>
                    )}
                    <div className="text-[10px] text-center text-[#8c9196] -mt-1">
                      Inventory is available on a first-come, first-served basis. Orders are not reserved until checkout is completed.
                    </div>

                    {/* Compliance Footer with Unsubscribe link */}
                    <div className="text-center pt-2 border-t border-[#f1f2f4]">
                      <span className="text-[10px] text-[#8c9196] block mb-1">
                        Delivered automatically on behalf of{" "}
                        <strong>{displayBrand}</strong> via RestockPing
                      </span>
                      <span className="text-[9px] text-[#9ca3af] underline cursor-pointer">
                        Unsubscribe from this restock notification
                      </span>
                    </div>

                    {previewMode === "mobile" && (
                      <div className="w-24 h-1 bg-[#e4e4e7] rounded-full mx-auto mt-2" />
                    )}
                  </div>
                </div>
              ) : (
                /* Storefront Dawn Theme PDP Card Preview */
                <div className="w-full max-w-[480px] bg-white border border-[#e1e3e5] rounded-xl p-5 shadow-xs space-y-4">
                  {/* Dawn Mock Header */}
                  <div className="border-b border-[#f1f2f4] pb-3">
                    <span className="text-[10px] font-medium text-[#6d7175]">
                      {displayBrand}
                    </span>
                    <h3 className="text-base font-bold text-[#111827] mt-0.5">
                      {activePreviewItem.productTitle}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-semibold text-[#111827]">
                        ${activePreviewItem.price.toFixed(2)}
                      </span>
                      <span className="px-2 py-0.5 bg-[#fef2f2] text-[#b91c1c] text-[10px] font-semibold rounded">
                        Sold out
                      </span>
                      <span className="text-[11px] text-[#6b7280]">
                        · {activePreviewItem.variantTitle}
                      </span>
                    </div>
                  </div>

                  {/* RestockPing Native Theme App Block */}
                  <div className="border border-[#e5e7eb] rounded-lg p-4 bg-[#fbfcfd] space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: formState.accentColor || "#008060" }}
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      />
                      <span className="text-xs font-semibold text-[#111827]">
                        Sold out? Get notified when back in stock
                      </span>
                    </div>

                    {simulatedPDPState === "idle" ? (
                      <div className="space-y-2">
                        <input
                          type="email"
                          disabled
                          placeholder="Enter your email address"
                          className="w-full px-3 py-2 text-xs bg-white border border-[#d2d5d8] rounded text-[#8c9196] cursor-not-allowed"
                        />
                        <button
                          type="button"
                          style={{
                            backgroundColor: formState.accentColor || "#008060",
                            borderRadius: `${formState.storefrontButtonRadius ?? 6}px`,
                          }}
                          className="w-full py-2.5 px-4 text-xs font-semibold text-white text-center cursor-default shadow-xs transition-all"
                        >
                          {formState.storefrontButtonText || "Notify Me When Available"}
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-[#e3f1df] border border-[#aee9d1] rounded-md text-xs text-[#008060] font-medium flex items-center gap-2">
                        <span className="font-bold text-sm">✓</span>
                        <span>{formState.storefrontSuccessMessage || "You're on the waitlist! We'll email you the moment stock returns."}</span>
                      </div>
                    )}

                    {/* Simulation Switcher */}
                    <div className="pt-2 border-t border-[#f1f2f4] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setSimulatedPDPState((s) => (s === "idle" ? "subscribed" : "idle"))
                        }
                        className="text-[11px] text-[#005bd3] hover:underline cursor-pointer font-medium"
                      >
                        {simulatedPDPState === "idle"
                          ? "Simulate customer signup →"
                          : "← Reset to default button"}
                      </button>
                      <span className="text-[10px] text-[#8c9196]">
                        Pre-allocated layout box
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
