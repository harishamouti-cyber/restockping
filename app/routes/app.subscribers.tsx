import React, { useState, useTransition } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useSearchParams, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { SubscribersIndexTable } from "../components/SubscribersIndexTable";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || "ALL";
  const queryParam = url.searchParams.get("q") || "";

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

    const [subscribers, totalCount, pendingCount, dispatchedCount, convertedCount] = await Promise.all([
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
    ]);

    return json({
      subscribers: subscribers || [],
      totalCount: totalCount || 0,
      pendingCount: pendingCount || 0,
      dispatchedCount: dispatchedCount || 0,
      convertedCount: convertedCount || 0,
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
      statusParam,
      queryParam,
      shop: session.shop,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "BULK_DELETE") {
    const ids = JSON.parse(String(formData.get("ids") || "[]"));
    if (ids.length > 0) {
      await db.restockSubscription.deleteMany({
        where: { shop: session.shop, id: { in: ids } },
      });
    }
    return json({ success: true, count: ids.length });
  }

  if (intent === "DISPATCH_SINGLE") {
    const id = String(formData.get("id"));
    await db.restockSubscription.update({
      where: { id },
      data: { status: "DISPATCHED", dispatchedAt: new Date() },
    });
    return json({ success: true });
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
    statusParam,
    queryParam,
    shop,
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(queryParam);
  const [, startTransition] = useTransition();

  const showToast = (message: string) => {
    try {
      if (typeof window !== "undefined" && (window as any).shopify?.toast?.show) {
        (window as any).shopify.toast.show(message);
      }
    } catch {
      // Fallback
    }
  };

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

  const handleBulkDelete = (ids: string[]) => {
    submit(
      { intent: "BULK_DELETE", ids: JSON.stringify(ids) },
      { method: "POST" }
    );
    showToast(`${ids.length} customer(s) removed`);
  };

  const handleDispatchSingle = (id: string) => {
    submit({ intent: "DISPATCH_SINGLE", id }, { method: "POST" });
    showToast("Alert sent to customer");
  };

  const handleCopyPermalink = (sub: any) => {
    const cleanVariantId = String(sub.variantId || "").replace(/\D/g, "");
    const url = `https://${shop}/cart/${cleanVariantId}:1?checkout[email]=${encodeURIComponent(
      sub.customerEmail || ""
    )}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    showToast("1-Click checkout link copied to clipboard");
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
        <button
          onClick={() =>
            window.open(
              `https://${shop}/admin/themes/current/editor?template=product`,
              "_blank"
            )
          }
        >
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
            <div className="text-[22px] font-semibold text-[#202223] leading-7 tracking-[-0.02em] font-sans tabular-nums mt-1">
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
            <div className="text-[22px] font-semibold text-[#202223] leading-7 tracking-[-0.02em] font-sans tabular-nums mt-1">
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
            <div className="text-[22px] font-semibold text-[#202223] leading-7 tracking-[-0.02em] font-sans tabular-nums mt-1">
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

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
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
          </div>

          {/* Table or Empty State */}
          {subscribers.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center bg-white">
              <div className="w-10 h-10 rounded-full bg-[#f1f2f4] flex items-center justify-center text-[#8c9196] mb-2.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              {queryParam || statusParam !== "ALL" ? (
                <>
                  <h3 className="text-xs font-semibold text-[#202223]">No customers match your filters</h3>
                  <p className="text-[11px] text-[#8c9196] max-w-sm mt-0.5 leading-normal">
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
                  <h3 className="text-xs font-semibold text-[#202223]">No waitlist customers yet</h3>
                  <p className="text-[11px] text-[#8c9196] max-w-sm mt-0.5 leading-normal">
                    Customer restock requests will appear here once visitors sign up for sold-out items on your live store.
                  </p>
                </>
              )}
            </div>
          ) : (
            <SubscribersIndexTable
              subscribers={subscribers}
              shop={shop}
              onDispatchSingle={handleDispatchSingle}
              onBulkDelete={handleBulkDelete}
              onCopyPermalink={handleCopyPermalink}
            />
          )}
        </div>
      </main>
    </div>
  );
}
