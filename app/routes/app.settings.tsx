import React, { useState, useEffect, useRef } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation, useRouteError } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendRestockNotificationEmail } from "../services/email.server";
import { fetchCatalogProductsWithStatus, getLiveProductMedia, type CatalogProductOption } from "../services/catalog.server";
import { sanitizeShopBrandName, isRawDevBrand } from "../utils/brand";
import { renderEmailCopy, type TemplateVariables } from "../utils/emailTemplate";
import { encryptCredential } from "../services/crypto.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shop = "";
  try {
    const { admin, session } = await authenticate.admin(request);
    shop = session.shop;
    const url = new URL(request.url);
    const productSearch = url.searchParams.get("productSearch") || "";

    const [settingsRecord, catalogResult, waitlistSample] = await Promise.all([
      db.restockSettings.findUnique({ where: { shop } }).catch((err) => {
        console.error("[Settings Loader DB Error - Settings]:", err?.message || err);
        return null;
      }),
      fetchCatalogProductsWithStatus(admin, productSearch || undefined, 50).catch((err) => {
        console.error("[Settings Loader Catalog Query Error]:", err?.message || err);
        return {
          products: [],
          error: `Catalog query exception: ${err?.message || String(err)}`,
          errorType: "API_ERROR" as const,
        };
      }),
      db.restockSubscription.findFirst({
        where: { shop },
        orderBy: { createdAt: "desc" },
      }).catch((err) => {
        console.error("[Settings Loader DB Error - Waitlist]:", err?.message || err);
        return null;
      }),
    ]);

    const sanitizedDefault = sanitizeShopBrandName(shop);

    // Brand sanitization logic:
    // If settingsRecord has a storeDisplayName that is empty or contains raw dev suffixes/hashes,
    // sanitize it into clean title case (e.g. "RankPilot")
    let effectiveStoreDisplayName = sanitizedDefault;
    if (settingsRecord?.storeDisplayName && !isRawDevBrand(settingsRecord.storeDisplayName, shop)) {
      effectiveStoreDisplayName = settingsRecord.storeDisplayName.trim();
    }

    const activeSettings = {
      storeDisplayName: effectiveStoreDisplayName,
      dripBatchMultiplier: settingsRecord?.dripBatchMultiplier ?? 2.5,
      dripIntervalMinutes: settingsRecord?.dripIntervalMinutes ?? 120,
      minRestockThreshold: settingsRecord?.minRestockThreshold ?? 1,
      accentColor: settingsRecord?.accentColor || "#008060",
      senderName: settingsRecord?.senderName || "Fulfillment Center",
      incentiveDiscountCode: settingsRecord?.incentiveDiscountCode || "",
      emailSubjectTemplate: settingsRecord?.emailSubjectTemplate || "Back in Stock: {{product_title}} is ready to ship",
      emailHeadline: settingsRecord?.emailHeadline || "Your item is back in stock",
      emailBodyText: settingsRecord?.emailBodyText || "Good news! An item you requested is available again. Complete your order now before inventory runs out.",
      emailButtonText: settingsRecord?.emailButtonText || "Claim In-Stock Item →",
      storefrontButtonText: settingsRecord?.storefrontButtonText || "Notify Me When Available",
      storefrontSuccessMessage: settingsRecord?.storefrontSuccessMessage || "You're on the waitlist! We'll email you the moment stock returns.",
      storefrontButtonRadius: settingsRecord?.storefrontButtonRadius ?? 6,
      emailDeliveryMode: settingsRecord?.emailDeliveryMode || "APP_MANAGED",
      replyToEmail: settingsRecord?.replyToEmail || "",
      customSmtpHost: settingsRecord?.customSmtpHost || "",
      customSmtpPort: settingsRecord?.customSmtpPort ?? 587,
      customSmtpUser: settingsRecord?.customSmtpUser || "",
      hasCustomSmtpPass: Boolean(settingsRecord?.customSmtpEncryptedPass),
    };

    const hasRealCatalogProducts = catalogResult.products.length > 0;
    const isWaitlistFallback = !hasRealCatalogProducts && Boolean(waitlistSample);

    let catalogProducts: CatalogProductOption[] = catalogResult.products;
    if (isWaitlistFallback && waitlistSample) {
      catalogProducts = [
        {
          productId: waitlistSample.productId,
          variantId: waitlistSample.variantId,
          productTitle: waitlistSample.productTitle || "Waitlist Item",
          variantTitle: waitlistSample.variantTitle || "Default Title",
          price: Number(waitlistSample.priceSnapshot) || 0,
          imageUrl: waitlistSample.productImageUrl || "",
        },
      ];
    }

    const isSampleCatalog = catalogProducts.length === 0;

    // Set default selected item to the first product with a valid image (e.g. snowboard)
    const defaultPreview: CatalogProductOption =
      catalogProducts.find((product) => Boolean(product.imageUrl && product.imageUrl.trim())) ||
      catalogProducts[0] || {
        productId: "",
        variantId: "",
        productTitle: "No Shopify products available",
        variantTitle: "Add a product to preview its real image",
        price: 0,
        imageUrl: "",
      };

    return json({
      settings: activeSettings,
      shop,
      previewItem: defaultPreview,
      catalogProducts,
      hasRealCatalogProducts,
      catalogError: catalogResult.error,
      catalogErrorType: catalogResult.errorType,
      isWaitlistFallback,
      isSampleCatalog,
      productSearch,
      defaultRecipient: "",
      loaderError: null,
    });
  } catch (loaderErr: any) {
    if (loaderErr instanceof Response) {
      throw loaderErr;
    }
    console.error("[Settings Loader Unexpected Error]:", loaderErr?.message || loaderErr);
    const sanitizedDefault = sanitizeShopBrandName(shop || "Store");
    return json({
      settings: {
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
        emailDeliveryMode: "APP_MANAGED",
        replyToEmail: "",
        customSmtpHost: "",
        customSmtpPort: 587,
        customSmtpUser: "",
        hasCustomSmtpPass: false,
      },
      shop: shop || "unknown.myshopify.com",
      previewItem: {
        productId: "",
        variantId: "",
        productTitle: "No Shopify products available",
        variantTitle: "Add a product to preview its real image",
        price: 0,
        imageUrl: "",
      },
      catalogProducts: [],
      hasRealCatalogProducts: false,
      catalogError: "Database or Shopify session is currently recovering.",
      catalogErrorType: "API_ERROR" as const,
      isWaitlistFallback: false,
      isSampleCatalog: true,
      productSearch: "",
      defaultRecipient: "",
      loaderError: String(loaderErr?.message || "Unexpected loader error"),
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "SEND_TEST_EMAIL") {
      const targetEmail = String(formData.get("testEmail") || "").trim();
      if (!targetEmail || !targetEmail.includes("@")) {
        return json({ success: false, error: "Please enter a valid email address." }, { status: 400 });
      }

      try {
        const selectedVariantId = String(formData.get("previewVariantId") || "");
        const previewTitle = String(formData.get("previewProductTitle") || "");
        const previewVariantTitle = String(formData.get("previewVariantTitle") || "");
        const previewPrice = parseFloat(String(formData.get("previewPrice") || "0")) || 0;
        const previewImageUrl = String(formData.get("previewImageUrl") || "");

        // Look up live product details from Admin API
        const liveProduct = selectedVariantId ? await getLiveProductMedia(admin, selectedVariantId) : null;

        // Pass selected product data with safe fallback: never overwrite valid preview with dummy failure placeholders
        const hasLiveMedia = Boolean(liveProduct && !liveProduct.isLookupFailed && liveProduct.productTitle);
        const finalProductTitle = (hasLiveMedia ? liveProduct?.productTitle : previewTitle) || previewTitle || "Restocked Item";
        const finalVariantTitle = (hasLiveMedia ? liveProduct?.variantTitle : previewVariantTitle) || previewVariantTitle || "Default Title";
        const finalPrice = (hasLiveMedia && liveProduct?.price !== undefined) ? liveProduct.price : previewPrice;
        const finalVariantId = (hasLiveMedia && liveProduct?.variantId) ? liveProduct.variantId : selectedVariantId;
        const finalImageUrl = (hasLiveMedia && liveProduct?.imageUrl) ? liveProduct.imageUrl : (previewImageUrl || undefined);
        const imageLookupError = liveProduct?.imageLookupError;

        await sendRestockNotificationEmail({
          to: targetEmail,
          shop: session.shop,
          storeDisplayName: String(formData.get("storeDisplayName") || ""),
          productTitle: finalProductTitle,
          variantTitle: finalVariantTitle,
          price: finalPrice,
          variantId: finalVariantId,
          productImageUrl: finalImageUrl,
          imageLookupError,
          senderName: String(formData.get("senderName") || "Restock Alerts"),
          headline: String(formData.get("emailHeadline") || "Your item is back in stock"),
          bodyText: String(formData.get("emailBodyText") || "Good news! An item you requested is available again. Complete your order now before inventory runs out."),
          buttonText: String(formData.get("emailButtonText") || "Claim In-Stock Item →"),
          buttonColor: String(formData.get("accentColor") || "#008060"),
          subjectTemplate: String(formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship"),
          discountCode: String(formData.get("incentiveDiscountCode") || "").trim() || undefined,
          replyTo: String(formData.get("replyToEmail") || "").trim() || undefined,
          isTestPreview: true,
        });
        return json({
          success: true,
          message: `Test email preview for "${finalProductTitle}" (${finalVariantTitle}) sent to ${targetEmail}.`,
        });
      } catch (err: any) {
        console.error("[Test Send Error]:", err?.message || err);
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
  const emailDeliveryMode = String(formData.get("emailDeliveryMode") || "APP_MANAGED");
  const replyToEmail = String(formData.get("replyToEmail") || "").trim() || null;
  const customSmtpHost = String(formData.get("customSmtpHost") || "").trim() || null;
  const customSmtpPort = parseInt(String(formData.get("customSmtpPort") || "587"), 10) || 587;
  const customSmtpUser = String(formData.get("customSmtpUser") || "").trim() || null;
  const customSmtpPass = String(formData.get("customSmtpPass") || "").trim();

  let customSmtpEncryptedPass: string | undefined = undefined;
  if (customSmtpPass && customSmtpPass !== "••••••••") {
    customSmtpEncryptedPass = encryptCredential(customSmtpPass);
  }

  const updateData: any = {
    storeDisplayName,
    dripBatchMultiplier,
    dripIntervalMinutes,
    minRestockThreshold,
    accentColor,
    senderName,
    replyToEmail,
    emailDeliveryMode,
    customSmtpHost,
    customSmtpPort,
    customSmtpUser,
    incentiveDiscountCode,
    emailSubjectTemplate,
    emailHeadline,
    emailBodyText,
    emailButtonText,
    storefrontButtonText,
    storefrontSuccessMessage,
    storefrontButtonRadius,
  };

  if (customSmtpEncryptedPass !== undefined) {
    updateData.customSmtpEncryptedPass = customSmtpEncryptedPass;
  }

  await db.restockSettings.upsert({
    where: { shop: session.shop },
    update: updateData,
    create: {
      shop: session.shop,
      ...updateData,
      customSmtpEncryptedPass: customSmtpEncryptedPass || null,
    },
  });

  return json({ success: true, message: "Settings saved successfully." });
  } catch (actionErr: any) {
    if (actionErr instanceof Response) {
      throw actionErr;
    }
    console.error("[Settings Action Error]:", actionErr?.message || actionErr);
    return json(
      { success: false, error: `Action failed: ${actionErr?.message || "Please try again."}` },
      { status: 500 }
    );
  }
};

export default function Settings() {
  const {
    settings,
    shop,
    previewItem,
    catalogProducts,
    hasRealCatalogProducts,
    catalogError,
    catalogErrorType,
    isWaitlistFallback,
    isSampleCatalog,
    defaultRecipient,
    loaderError,
  } = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [formState, setFormState] = useState(settings || {});
  const [testEmail, setTestEmail] = useState(defaultRecipient || "");
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

  const fallbackPreview: CatalogProductOption = {
    productId: "",
    variantId: "",
    productTitle: "No Shopify products available",
    variantTitle: "Default Title",
    price: 0,
    imageUrl: "",
  };

  const activePreviewItem: CatalogProductOption =
    (catalogProducts || []).find((p: any) => p.variantId === selectedPreviewVariantId) ||
    previewItem ||
    fallbackPreview;

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
    } else if ((actionData as any)?.error) {
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
        onClick={() => insertVariableIntoField(targetField, "{{variant_title}}")}
        className="text-[10px] bg-[#f1f2f4] hover:bg-[#e4e5e7] text-[#202223] px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer"
        title="Insert variant title"
      >
        + Variant
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
    fd.append("replyToEmail", formState.replyToEmail || "");
    fd.append("emailDeliveryMode", formState.emailDeliveryMode || "APP_MANAGED");
    // Real selected catalog product parameters
    fd.append("previewProductTitle", activePreviewItem?.productTitle || "Product");
    fd.append("previewVariantTitle", activePreviewItem?.variantTitle || "Default Title");
    fd.append("previewPrice", String(Number(activePreviewItem?.price) || 0));
    fd.append("previewVariantId", activePreviewItem?.variantId || "");
    fd.append("previewImageUrl", activePreviewItem?.imageUrl || "");
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

  const renderedCopy = renderEmailCopy({
    subjectTemplate: formState.emailSubjectTemplate,
    headlineTemplate: formState.emailHeadline,
    bodyTemplate: formState.emailBodyText,
    variables: {
      product_title: activePreviewItem?.productTitle || "Product",
      variant_title: activePreviewItem?.variantTitle || "Default Title",
      price: Number(activePreviewItem?.price) || 0,
      store: displayBrand,
    },
  });

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
        {/* Diagnostic Loader Warning Banner */}
        {loaderError && (
          <div className="p-3 bg-[#fff4e5] border border-[#f5b854] rounded-lg flex items-center justify-between shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2">
              <span className="text-base text-[#b98900]">⚠️</span>
              <span className="text-xs font-medium text-[#202223]">
                <strong>Configuration Notice:</strong> Database or catalog connection is currently recovering. Safe defaults have been loaded.
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-2.5 py-1 text-xs font-semibold bg-white border border-[#d2d5d8] rounded text-[#202223] hover:bg-[#f6f6f7] transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

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
              disabled={isSendingTest || isSampleCatalog || !testEmail.includes("@")}
              title={
                isSampleCatalog
                  ? "Add active products in Shopify to send a test email"
                  : !testEmail.includes("@")
                  ? "Enter a valid email address to send a test email"
                  : "Send a test restock email"
              }
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
                    onClick={() => insertVariableIntoActiveField("{{variant_title}}")}
                    className="px-2 py-0.5 text-[10px] font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded hover:bg-[#e4e5e7] transition-colors cursor-pointer shadow-2xs"
                    title="Insert {{variant_title}}"
                  >
                    + Variant Title
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <div>
                  <label className="text-xs font-medium text-[#202223] block mb-1">Support Reply-To Email</label>
                  <input
                    ref={(el) => (inputRefs.current.replyToEmail = el)}
                    type="email"
                    value={formState.replyToEmail || ""}
                    placeholder="e.g. support@store.com"
                    onFocus={() => setActiveField("replyToEmail")}
                    onChange={(e) => handleChange("replyToEmail", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223]"
                  />
                </div>
              </div>

              {/* Delivery Infrastructure Mode (Truthful Sender Architecture) */}
              <div className="p-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-[#111827] block">Delivery Infrastructure</span>
                    <span className="text-[11px] text-[#6b7280]">
                      {formState.emailDeliveryMode === "CUSTOM_SMTP"
                        ? "Delivering via private custom SMTP server (AES-256 encrypted)."
                        : "Delivering via RestockPing high-reputation transactional delivery cluster."}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-[#374151] cursor-pointer">
                      <input
                        type="radio"
                        name="emailDeliveryModeRadio"
                        checked={formState.emailDeliveryMode !== "CUSTOM_SMTP"}
                        onChange={() => handleChange("emailDeliveryMode", "APP_MANAGED")}
                        className="text-[#008060] focus:ring-[#008060]"
                      />
                      App-Managed
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-[#374151] cursor-pointer">
                      <input
                        type="radio"
                        name="emailDeliveryModeRadio"
                        checked={formState.emailDeliveryMode === "CUSTOM_SMTP"}
                        onChange={() => handleChange("emailDeliveryMode", "CUSTOM_SMTP")}
                        className="text-[#008060] focus:ring-[#008060]"
                      />
                      Custom SMTP
                    </label>
                  </div>
                </div>

                {formState.emailDeliveryMode === "CUSTOM_SMTP" && (
                  <div className="pt-2 border-t border-[#e5e7eb] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[11px] font-medium text-[#374151] block mb-0.5">SMTP Host</label>
                      <input
                        type="text"
                        value={formState.customSmtpHost || ""}
                        placeholder="smtp.sendgrid.net"
                        onChange={(e) => handleChange("customSmtpHost", e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-[#d2d5d8] rounded focus:outline-none focus:border-[#008060]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[#374151] block mb-0.5">SMTP Port</label>
                      <input
                        type="number"
                        value={formState.customSmtpPort || 587}
                        onChange={(e) => handleChange("customSmtpPort", parseInt(e.target.value, 10) || 587)}
                        className="w-full px-2 py-1 text-xs bg-white border border-[#d2d5d8] rounded focus:outline-none focus:border-[#008060]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[#374151] block mb-0.5">SMTP Username</label>
                      <input
                        type="text"
                        value={formState.customSmtpUser || ""}
                        placeholder="apikey"
                        onChange={(e) => handleChange("customSmtpUser", e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-[#d2d5d8] rounded focus:outline-none focus:border-[#008060]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[#374151] block mb-0.5">
                        SMTP Password {formState.hasCustomSmtpPass ? "(Encrypted)" : ""}
                      </label>
                      <input
                        type="password"
                        placeholder={formState.hasCustomSmtpPass ? "••••••••" : "Password / Key"}
                        onChange={(e) => handleChange("customSmtpPass", e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-[#d2d5d8] rounded focus:outline-none focus:border-[#008060]"
                      />
                    </div>
                  </div>
                )}
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
              <div className="pt-2 border-t border-[#f1f2f4] flex items-center gap-1.5 text-[11px] text-[#6d7175]">
                <span className="text-[#008060] font-bold">ℹ</span>
                <span>
                  <strong>Stock Safety:</strong> Notifications do not reserve inventory. Customers complete purchases on a first-come, first-served basis at checkout.
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Live Device & Storefront Preview */}
          <div className="lg:col-span-6 sticky top-6 self-start z-10 space-y-2.5">
            <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col items-center">
              {/* Catalog Product Selection Bar */}
              <div className="w-full bg-[#f9fafb] border border-[#e1e3e5] rounded-lg p-2.5 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <label htmlFor="preview-product-select" className="text-[11px] font-semibold text-[#616161] shrink-0">
                    Preview Product:
                  </label>
                  <select
                    id="preview-product-select"
                    value={selectedPreviewVariantId}
                    onChange={(e) => {
                      setSelectedPreviewVariantId(e.target.value);
                      setImgLoadError(false);
                    }}
                    className="w-full sm:w-auto flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-[#d2d5d8] rounded-md focus:outline-none focus:border-[#008060] text-[#202223] truncate"
                  >
                    {((catalogProducts || []) as CatalogProductOption[]).map((p: CatalogProductOption) => (
                      <option key={p.variantId} value={p.variantId}>
                        {p.productTitle} — {p.variantTitle} (${(Number(p.price) || 0).toFixed(2)})
                      </option>
                    ))}
                    {catalogProducts.length === 0 && (
                      <option value="">
                        {catalogError ? `Catalog unavailable: ${catalogError}` : "No real Shopify products found"}
                      </option>
                    )}
                  </select>
                </div>
                {isWaitlistFallback ? (
                  <span
                    className="text-[10px] font-semibold bg-[#eef2ff] text-[#4f46e5] px-2 py-0.5 rounded border border-[#c7d2fe] shrink-0"
                    title="Using subscriber waitlist record because live catalog query was unavailable"
                  >
                    Waitlist Sample Preview
                  </span>
                ) : catalogError ? (
                  <span
                    className="text-[10px] font-semibold bg-[#fef2f2] text-[#991b1b] px-2 py-0.5 rounded border border-[#fecaca] shrink-0"
                    title={catalogError}
                  >
                    {catalogErrorType === "SCOPE_ERROR" ? "Scope Error" : "Catalog API Error"}
                  </span>
                ) : catalogProducts.length === 0 ? (
                  <span
                    className="text-[10px] font-semibold bg-[#fff4e5] text-[#b98900] px-2 py-0.5 rounded border border-[#f5b854] shrink-0"
                    title="No real Shopify catalog products are available to preview"
                  >
                    No catalog products
                  </span>
                ) : null}
              </div>

              {/* Informative Error / Empty State Banners */}
              {catalogError ? (
                <div className="w-full py-3 px-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg mb-3 text-left">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#991b1b]">
                    <span>⚠️</span>
                    <span>
                      {catalogErrorType === "SCOPE_ERROR"
                        ? "Shopify Permission Notice (read_products scope required)"
                        : "Shopify Catalog Query Notice"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7f1d1d] mt-1 leading-relaxed">
                    {catalogError}
                  </p>
                  {isWaitlistFallback && (
                    <p className="text-[11px] text-[#4338ca] font-medium mt-1.5 bg-[#eef2ff] px-2 py-1 rounded border border-[#c7d2fe]">
                      ✓ Loaded real product details from your subscriber waitlist so you can preview templates and send test emails.
                    </p>
                  )}
                </div>
              ) : catalogProducts.length === 0 ? (
                <div className="w-full text-center py-4 px-3 bg-[#fffbf2] border border-[#f5b854] rounded-lg mb-3">
                  <p className="text-xs font-semibold text-[#8a6116]">No active products found in store catalog</p>
                  <p className="text-[11px] text-[#6d7175] mt-0.5">
                    Add or activate products in your Shopify admin to preview restock alert layouts and send test emails.
                  </p>
                </div>
              ) : (!activePreviewItem.imageUrl || imgLoadError) ? (
                <div className="w-full text-[11px] bg-[#fff8e5] border border-[#f1d58a] rounded-md px-2.5 py-2 mb-3 flex items-center justify-between">
                  <span className="text-[#8a6116]">
                    {imgLoadError
                      ? "Product image lookup failed (Shopify API error or inaccessible image CDN URL)."
                      : "No product image uploaded in store catalog for this item."}
                  </span>
                  <span className="text-[10px] font-semibold text-[#b98900] uppercase tracking-wider bg-white/70 px-1.5 py-0.5 rounded border border-[#f1d58a]">
                    {imgLoadError ? "Lookup Error" : "No Photo"}
                  </span>
                </div>
              ) : null}

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

                    {/* Active Email Subject Bar */}
                    <div className="border-b border-[#f1f2f4] pb-2.5 mb-2.5">
                      <div className="flex items-center justify-between text-[10px] text-[#8c9196] mb-1">
                        <span className="font-semibold uppercase tracking-wider">Email Subject</span>
                        <span>{displayBrand}</span>
                      </div>
                      <div className="text-xs font-semibold text-[#202223] break-words">
                        {renderedCopy.subject}
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e3f1df] text-[#008060] text-[10px] font-semibold uppercase rounded">
                      ● Restock Notice
                    </span>
                    <h3 className="text-base font-bold text-[#202223] leading-snug break-words">
                      {renderedCopy.headline || "Your item is back in stock"}
                    </h3>
                    <p className="text-xs text-[#6d7175] leading-relaxed break-words whitespace-pre-line">
                      {renderedCopy.bodyText ||
                        "Good news! An item you requested is available again. Complete your order now before inventory runs out."}
                    </p>

                    {/* Responsive Product Media Frame with Proportional Containment */}
                    <div className="flex items-center gap-3.5 p-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl">
                      <div className="w-20 h-24 sm:w-24 sm:h-28 bg-white border border-[#e5e7eb] rounded-lg flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-2xs">
                        {activePreviewItem.imageUrl && !imgLoadError ? (
                          <img
                            src={activePreviewItem.imageUrl}
                            alt={activePreviewItem.productTitle}
                            onError={() => setImgLoadError(true)}
                            style={{ objectFit: "contain" }}
                            className="w-full h-full object-contain block mx-auto transition-transform duration-200"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-2">
                            <span className="text-xl text-[#9ca3af]">
                              {imgLoadError ? "⚠️" : "📷"}
                            </span>
                            <span className="text-[9px] text-[#9ca3af] font-semibold uppercase tracking-tight mt-1">
                              {imgLoadError ? "Lookup Error" : "No image"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="text-sm font-semibold text-[#111827] block truncate">
                          {activePreviewItem.productTitle}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-[#6b7280]">
                            {activePreviewItem.variantTitle}
                          </span>
                          <span className="text-xs font-bold text-[#111827]">
                            ${(Number(activePreviewItem?.price) || 0).toFixed(2)}
                          </span>
                        </div>
                        {activePreviewItem.imageUrl && !imgLoadError ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#008060] font-medium bg-[#e3f1df] px-1.5 py-0.5 rounded">
                            ✓ Shopify CDN (width=300)
                          </span>
                        ) : imgLoadError ? (
                          <span className="text-[10px] text-[#b91c1c] font-medium block">
                            ⚠️ Product image lookup failed (Shopify API error)
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#6b7280] italic block">
                            No product image uploaded in store catalog
                          </span>
                        )}
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
                  {/* Dawn Mock Header with Product Visual */}
                  <div className="border-b border-[#f1f2f4] pb-4 flex gap-4 items-start">
                    <div className="w-20 h-24 sm:w-24 sm:h-28 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-2xs">
                      {activePreviewItem.imageUrl && !imgLoadError ? (
                        <img
                          src={activePreviewItem.imageUrl}
                          alt={activePreviewItem.productTitle}
                          onError={() => setImgLoadError(true)}
                          style={{ objectFit: "contain" }}
                          className="w-full h-full object-contain block mx-auto"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-2">
                          <span className="text-xl text-[#9ca3af]">📷</span>
                          <span className="text-[9px] text-[#9ca3af] font-semibold uppercase tracking-tight mt-1">
                            No image
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-medium text-[#6d7175] uppercase tracking-wide block">
                        {displayBrand}
                      </span>
                      <h3 className="text-base font-bold text-[#111827] mt-0.5 leading-snug break-words">
                        {activePreviewItem.productTitle}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-[#111827]">
                          ${(Number(activePreviewItem?.price) || 0).toFixed(2)}
                        </span>
                        <span className="px-2 py-0.5 bg-[#fef2f2] text-[#b91c1c] text-[10px] font-semibold rounded">
                          Sold out
                        </span>
                        <span className="text-[11px] text-[#6b7280]">
                          · {activePreviewItem.variantTitle}
                        </span>
                      </div>
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

export function ErrorBoundary() {
  const error = useRouteError();
  const rawMsg =
    error instanceof Error
      ? error.message
      : (error as any)?.data?.message || (error as any)?.message || String(error || "An unexpected error occurred in Settings.");

  const sanitizedMessage = rawMsg
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, "[REDACTED_EMAIL]")
    .replace(/shpat_[a-zA-Z0-9]+/g, "[REDACTED_TOKEN]")
    .replace(/secret=[^&\s]+/gi, "secret=[REDACTED]")
    .replace(/signature=[^&\s]+/gi, "signature=[REDACTED]");

  console.error("[Settings Route ErrorBoundary Caught]:", {
    type: error instanceof Error ? error.name : typeof error,
    message: sanitizedMessage,
  });

  return (
    <div className="min-h-screen bg-[#f1f2f4] p-6 font-sans text-[#202223] antialiased">
      <div className="max-w-[760px] mx-auto bg-white border border-[#e1e3e5] rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 text-[#d72c0d]">
          <span className="text-xl">⚠️</span>
          <h2 className="text-base font-bold">RestockPing Settings Notice</h2>
        </div>
        <p className="text-xs text-[#6d7175] leading-relaxed">
          The settings interface encountered an issue connecting to Shopify Admin or the database. All subscriber waitlists, alert queues, and existing configurations remain intact.
        </p>
        <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-xs text-[#991b1b] font-mono break-words">
          {sanitizedMessage}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            Reload Settings
          </button>
          <a
            href="/app"
            className="px-4 py-2 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors"
          >
            Return to Overview
          </a>
        </div>
      </div>
    </div>
  );
}
