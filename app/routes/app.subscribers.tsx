import React, { useState, useTransition, useEffect } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useSearchParams, useNavigate, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendRestockNotificationEmail } from "../services/email.server";
import { getLiveProductMedia, getVariantProductMedia, normalizeShopifyImageUrl } from "../services/catalog.server";
import { SubscribersIndexTable } from "../components/SubscribersIndexTable";
import { openThemeEditor } from "../utils/themeDeepLink";
import { generateCartPermalink } from "../utils/permalink";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || "ALL";
  const queryParam = url.searchParams.get("q") || "";
  const isExport = url.searchParams.get("export") === "csv";

  try {
    const whereClause: any = { shop: session.shop };
    if (statusParam !== "ALL") whereClause.status = statusParam;
    if (queryParam) {
      whereClause.OR = [
        { customerEmail: { contains: queryParam, mode: "insensitive" } },
        { productTitle: { contains: queryParam, mode: "insensitive" } },
        { variantTitle: { contains: queryParam, mode: "insensitive" } },
      ];
    }

    // Direct Supplier Demand CSV Export
    if (isExport) {
      const exportSubs = await db.restockSubscription.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
      });

      const escapeCsvCell = (val: unknown): string => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        "Customer Email",
        "Product Title",
        "Variant Title",
        "Variant ID",
        "Unit Price",
        "Status",
        "Date Registered",
        "Dispatched At",
        "Converted At",
      ];

      const csvRows = exportSubs.map((s) => [
        escapeCsvCell(s.customerEmail || "Anonymous"),
        escapeCsvCell(s.productTitle),
        escapeCsvCell(s.variantTitle),
        escapeCsvCell(s.variantId),
        escapeCsvCell(s.priceSnapshot),
        escapeCsvCell(s.status),
        escapeCsvCell(s.createdAt ? new Date(s.createdAt).toISOString() : ""),
        escapeCsvCell(s.dispatchedAt ? new Date(s.dispatchedAt).toISOString() : ""),
        escapeCsvCell(s.convertedAt ? new Date(s.convertedAt).toISOString() : ""),
      ].join(","));

      const csvContent = [headers.join(","), ...csvRows].join("\r\n");
      const dateTag = new Date().toISOString().slice(0, 10);
      const storeHandle = session.shop.replace(".myshopify.com", "");

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="restockping-demand-${storeHandle}-${dateTag}.csv"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const [subscribers, totalCount, pendingCount, dispatchedCount, convertedCount, settings] = await Promise.all([
      db.restockSubscription.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
      }),
      db.restockSubscription.count({ where: { shop: session.shop } }),
      db.restockSubscription.count({ where: { shop: session.shop, status: "PENDING" } }),
      db.restockSubscription.count({
        where: {
          shop: session.shop,
          status: { in: ["DISPATCHED", "CONVERTED"] },
        },
      }),
      db.restockSubscription.count({
        where: {
          shop: session.shop,
          status: "CONVERTED",
        },
      }),
      db.restockSettings.findUnique({ where: { shop: session.shop } }),
    ]);

    return json({
      subscribers: subscribers || [],
      totalCount: totalCount || 0,
      pendingCount: pendingCount || 0,
      dispatchedCount: dispatchedCount || 0,
      convertedCount: convertedCount || 0,
      incentiveDiscountCode: settings?.incentiveDiscountCode || null,
      statusParam,
      queryParam,
      shop: session.shop,
    });
  } catch (err) {
    console.error("[app.subscribers loader error]:", err);
    return json({
      subscribers: [],
      totalCount: 0,
      pendingCount: 0,
      dispatchedCount: 0,
      convertedCount: 0,
      incentiveDiscountCode: null,
      statusParam,
      queryParam,
      shop: session.shop,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const settings = await db.restockSettings.findUnique({ where: { shop: session.shop } });

  const resolveImageUrl = async (variantId: string, existingUrl?: string | null) => {
    if (existingUrl && existingUrl.startsWith("http")) return existingUrl;
    try {
      const media = await getLiveProductMedia(admin, variantId);
      return media?.imageUrl || existingUrl || null;
    } catch (err) {
      console.error("[Catalog Media Fetch Error]:", err);
      return existingUrl || null;
    }
  };

  if (intent === "BULK_DELETE") {
    const ids = JSON.parse(String(formData.get("ids") || "[]"));
    if (ids.length > 0) {
      await db.restockSubscription.deleteMany({
        where: { shop: session.shop, id: { in: ids } },
      });
    }
    return json({ success: true, count: ids.length, message: `${ids.length} customer(s) removed` });
  }

  if (intent === "DISPATCH_SINGLE") {
    const id = String(formData.get("id"));
    const subscriber = await db.restockSubscription.findFirst({
      where: { id, shop: session.shop },
    });

    if (!subscriber || !subscriber.customerEmail) {
      return json({ success: false, error: "Subscriber not found or does not belong to this store." }, { status: 404 });
    }

    try {
      // Atomically claim the subscription to prevent race conditions
      await db.restockSubscription.updateMany({
        where: { id, shop: session.shop, status: "PENDING" },
        data: { status: "QUEUED" },
      });

      let liveMedia = null;
      try {
        liveMedia = await getLiveProductMedia(admin, subscriber.variantId, subscriber.productId);
      } catch (err) {
        console.error("[Catalog Media Fetch Error in Single Dispatch]:", err);
      }

      const hasLiveMedia = Boolean(liveMedia && !liveMedia.isLookupFailed && liveMedia.productTitle);
      const resolvedTitle = hasLiveMedia ? liveMedia!.productTitle : subscriber.productTitle;
      const resolvedVariant = (hasLiveMedia && liveMedia!.variantTitle && liveMedia!.variantTitle !== "Default Title")
        ? liveMedia!.variantTitle
        : subscriber.variantTitle;
      const resolvedPrice = (hasLiveMedia && typeof liveMedia!.price === "number" && liveMedia!.price > 0)
        ? liveMedia!.price
        : (Number(subscriber.priceSnapshot) || 0);

      const rawImg = (hasLiveMedia && liveMedia?.imageUrl) || subscriber.productImageUrl || undefined;
      const normalizedImg = normalizeShopifyImageUrl(rawImg, session.shop);
      const finalImageUrl = normalizedImg.isValid ? normalizedImg.url : undefined;
      const imageLookupError = liveMedia?.imageLookupError || null;

      await sendRestockNotificationEmail({
        to: subscriber.customerEmail,
        shop: session.shop,
        storeDisplayName: settings?.storeDisplayName || undefined,
        productTitle: resolvedTitle,
        variantTitle: resolvedVariant,
        price: resolvedPrice,
        variantId: (hasLiveMedia && liveMedia?.variantId) || subscriber.variantId,
        productImageUrl: finalImageUrl,
        imageLookupError,
        senderName: settings?.senderName,
        subjectTemplate: settings?.emailSubjectTemplate,
        headlineText: settings?.emailHeadline,
        bodyText: settings?.emailBodyText,
        buttonText: settings?.emailButtonText,
        accentColor: settings?.accentColor,
        discountCode: settings?.incentiveDiscountCode || undefined,
        subscriptionId: subscriber.id,
      });

      await db.restockSubscription.updateMany({
        where: { id, shop: session.shop },
        data: {
          status: "DISPATCHED",
          dispatchedAt: new Date(),
          ...(finalImageUrl && !subscriber.productImageUrl ? { productImageUrl: finalImageUrl } : {}),
        },
      });

      return json({ success: true, message: `Alert email delivered to ${subscriber.customerEmail}!` });
    } catch (err: any) {
      console.error("[Single Dispatch Error]:", err);
      // Revert QUEUED state back to PENDING on error
      await db.restockSubscription.updateMany({
        where: { id, shop: session.shop, status: "QUEUED" },
        data: { status: "PENDING" },
      });
      return json({ success: false, error: `Delivery failed: ${err.message}` }, { status: 400 });
    }
  }

  if (intent === "BULK_DISPATCH") {
    const ids: string[] = JSON.parse(String(formData.get("ids") || "[]"));
    const subscribers = await db.restockSubscription.findMany({
      where: { id: { in: ids }, shop: session.shop, status: "PENDING" },
    });

    let deliveredCount = 0;
    let failedCount = 0;
    const liveMediaByVariant = new Map<string, any>();

    for (const sub of subscribers) {
      if (!sub.customerEmail) continue;

      // Atomically claim the subscription to prevent concurrent double-dispatch
      const claimResult = await db.restockSubscription.updateMany({
        where: { id: sub.id, shop: session.shop, status: "PENDING" },
        data: { status: "QUEUED" },
      });
      if (claimResult.count === 0) continue;

      try {
        let liveMedia = null;
        try {
          if (!liveMediaByVariant.has(sub.variantId)) {
            liveMediaByVariant.set(sub.variantId, await getLiveProductMedia(admin, sub.variantId, sub.productId));
          }
          liveMedia = liveMediaByVariant.get(sub.variantId);
        } catch (err) {
          console.error("[Catalog Media Fetch Error in Bulk Dispatch]:", err);
        }

        const hasLiveMedia = Boolean(liveMedia && !liveMedia.isLookupFailed && liveMedia.productTitle);
        const resolvedTitle = hasLiveMedia ? liveMedia!.productTitle : sub.productTitle;
        const resolvedVariant = (hasLiveMedia && liveMedia!.variantTitle && liveMedia!.variantTitle !== "Default Title")
          ? liveMedia!.variantTitle
          : sub.variantTitle;
        const resolvedPrice = (hasLiveMedia && typeof liveMedia!.price === "number" && liveMedia!.price > 0)
          ? liveMedia!.price
          : (Number(sub.priceSnapshot) || 0);

        const rawImg = (hasLiveMedia && liveMedia?.imageUrl) || sub.productImageUrl || undefined;
        const normalizedImg = normalizeShopifyImageUrl(rawImg, session.shop);
        const finalImageUrl = normalizedImg.isValid ? normalizedImg.url : undefined;
        const imageLookupError = liveMedia?.imageLookupError || null;

        await sendRestockNotificationEmail({
          to: sub.customerEmail,
          shop: session.shop,
          storeDisplayName: settings?.storeDisplayName || undefined,
          productTitle: resolvedTitle,
          variantTitle: resolvedVariant,
          price: resolvedPrice,
          variantId: (hasLiveMedia && liveMedia?.variantId) || sub.variantId,
          productImageUrl: finalImageUrl,
          imageLookupError,
          senderName: settings?.senderName,
          subjectTemplate: settings?.emailSubjectTemplate,
          headlineText: settings?.emailHeadline,
          bodyText: settings?.emailBodyText,
          buttonText: settings?.emailButtonText,
          accentColor: settings?.accentColor,
          discountCode: settings?.incentiveDiscountCode || undefined,
          subscriptionId: sub.id,
        });

        await db.restockSubscription.updateMany({
          where: { id: sub.id, shop: session.shop },
          data: {
            status: "DISPATCHED",
            dispatchedAt: new Date(),
            ...(finalImageUrl && !sub.productImageUrl ? { productImageUrl: finalImageUrl } : {}),
          },
        });

        deliveredCount++;
      } catch (err) {
        failedCount++;
        await db.restockSubscription.updateMany({
          where: { id: sub.id, shop: session.shop, status: "QUEUED" },
          data: { status: "PENDING" },
        });
      }
    }

    return json({
      success: deliveredCount > 0,
      message: `Dispatched ${deliveredCount} alert(s).${failedCount > 0 ? ` (${failedCount} failed)` : ""}`,
    });
  }

  return json({ success: false });
};

export default function SubscribersPage() {
  const {
    subscribers,
    totalCount,
    pendingCount,
    dispatchedCount,
    convertedCount,
    incentiveDiscountCode,
    statusParam,
    queryParam,
    shop,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const submit = useSubmit();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(queryParam);
  const [, startTransition] = useTransition();

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

  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    startTransition(() => {
      const next = new URLSearchParams(searchParams);
      if (val) next.set("q", val);
      else next.delete("q");
      setSearchParams(next);
    });
  };

  const handleStatusTab = (status: string) => {
    const next = new URLSearchParams(searchParams);
    if (status === "ALL") next.delete("status");
    else next.set("status", status);
    setSearchParams(next);
  };

  const handleClearFilters = () => {
    setSearchValue("");
    const next = new URLSearchParams();
    setSearchParams(next);
  };

  const handleExportCsv = () => {
    const next = new URLSearchParams(searchParams);
    next.set("export", "csv");
    const exportUrl = `/app/subscribers?${next.toString()}`;
    const link = document.createElement("a");
    link.href = exportUrl;
    link.setAttribute(
      "download",
      `restockping-demand-${shop.replace(".myshopify.com", "")}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Downloading Supplier Demand CSV...");
  };

  const handleBulkDelete = (ids: string[]) => {
    submit(
      { intent: "BULK_DELETE", ids: JSON.stringify(ids) },
      { method: "POST" }
    );
  };

  const handleBulkDispatch = (ids: string[]) => {
    submit(
      { intent: "BULK_DISPATCH", ids: JSON.stringify(ids) },
      { method: "POST" }
    );
    showToast(`Sending ${ids.length} alert email(s)...`);
  };

  const handleDispatchSingle = (id: string) => {
    submit({ intent: "DISPATCH_SINGLE", id }, { method: "POST" });
    showToast("Sending alert email...");
  };

  const handleCopyPermalink = (sub: any) => {
    const url = generateCartPermalink({
      shop,
      variantId: sub.variantId,
      customerEmail: sub.customerEmail,
      discountCode: incentiveDiscountCode || undefined,
    });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    showToast("Direct checkout link copied to clipboard");
  };

  const tabs = [
    { id: "ALL", label: `All (${totalCount})` },
    { id: "PENDING", label: `Waiting to notify (${pendingCount})` },
    { id: "DISPATCHED", label: `Alerts sent (${dispatchedCount})` },
    { id: "CONVERTED", label: `Orders placed (${convertedCount})` },
  ];

  return (
    <div className="min-h-screen bg-[#f1f2f4] pb-16 font-sans text-[#202223] antialiased">
      <ui-title-bar title="Waitlist Subscribers">
        <button variant="primary" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button onClick={() => openThemeEditor(shop)}>
          View in theme
        </button>
      </ui-title-bar>

      <main className="max-w-[1200px] mx-auto px-4 py-4 space-y-3">
        {/* Metric Bar: Exact 1:1 Shopify Analytics KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <span className="text-[13px] font-normal text-[#616161]">
              Total customers
            </span>
            <div className="shopify-numeral mt-1">
              {totalCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              All recorded storefront waitlist signups
            </div>
          </div>

          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <span className="text-[13px] font-normal text-[#616161]">
              Waiting to notify
            </span>
            <div className="shopify-numeral mt-1">
              {pendingCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              Shoppers awaiting restock alerts
            </div>
          </div>

          <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
            <span className="text-[13px] font-normal text-[#616161]">
              Alerts sent
            </span>
            <div className="shopify-numeral mt-1">
              {dispatchedCount}
            </div>
            <div className="text-[11px] text-[#8c9196] mt-1 truncate">
              Shoppers notified upon restock
            </div>
          </div>
        </div>

        {/* Filter Navigation Card with Seamless IndexTable Integration */}
        <div className="bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] overflow-hidden">
          {/* Tabs and Search Bar Header */}
          <div className="p-3 border-b border-[#e1e3e5] flex flex-wrap items-center justify-between gap-3">
            {/* Polaris Tabs */}
            <div className="flex flex-wrap items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleStatusTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    statusParam === tab.id
                      ? "bg-[#f1f2f4] text-[#202223] font-semibold"
                      : "text-[#616161] hover:text-[#202223] hover:bg-[#f6f6f7]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input & Quick Export Button */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#8c9196]">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search customers or products..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all placeholder-[#8c9196]"
                />
                {searchValue && (
                  <button
                    onClick={() => handleSearchChange("")}
                    className="absolute inset-y-0 right-0 pr-2 flex items-center text-[#8c9196] hover:text-[#202223] cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>

              <button
                onClick={handleExportCsv}
                title="Download Supplier Demand CSV"
                className="px-2.5 py-1.5 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5 shadow-2xs"
              >
                <svg className="w-3.5 h-3.5 text-[#616161]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Table or Actionable Empty State */}
          {subscribers.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center bg-white">
              <div className="w-12 h-12 rounded-full bg-[#f1f2f4] flex items-center justify-center text-[#8c9196] mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              {queryParam || statusParam !== "ALL" ? (
                <>
                  <h3 className="text-sm font-semibold text-[#202223]">No customers match your filters</h3>
                  <p className="text-xs text-[#8c9196] max-w-sm mt-1 leading-normal">
                    Try searching with different keywords or switch status tabs.
                  </p>
                  <button
                    onClick={handleClearFilters}
                    className="mt-3 px-3 py-1.5 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors cursor-pointer shadow-2xs"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-[#202223]">No waitlist customers yet</h3>
                  <p className="text-xs text-[#616161] max-w-sm mt-1 leading-normal">
                    Customer restock requests will appear here once visitors sign up for sold-out items on your storefront.
                  </p>
                  <div className="flex items-center gap-2.5 mt-4">
                    <button
                      onClick={() => openThemeEditor(shop)}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#008060] hover:bg-[#006e52] rounded-md transition-colors cursor-pointer shadow-xs"
                    >
                      Add button to theme
                    </button>
                    <button
                      onClick={() => navigate("/app/simulation")}
                      className="px-3 py-1.5 text-xs font-medium text-[#202223] bg-white border border-[#d2d5d8] rounded-md hover:bg-[#f6f6f7] transition-colors cursor-pointer"
                    >
                      Simulate alert
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <SubscribersIndexTable
              subscribers={subscribers}
              shop={shop}
              onDispatchSingle={handleDispatchSingle}
              onBulkDispatch={handleBulkDispatch}
              onBulkDelete={handleBulkDelete}
              onCopyPermalink={handleCopyPermalink}
            />
          )}
        </div>
      </main>
    </div>
  );
}
