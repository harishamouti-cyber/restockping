import React, { useState, useTransition } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useSearchParams } from "@remix-run/react";
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

    const [subscribers, totalCount, pendingCount, dispatchedCount] = await Promise.all([
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
    ]);

    return json({
      subscribers: subscribers || [],
      totalCount: totalCount || 0,
      pendingCount: pendingCount || 0,
      dispatchedCount: dispatchedCount || 0,
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
    statusParam,
    queryParam,
    shop,
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
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
    { id: "ALL", label: "All Customers" },
    { id: "PENDING", label: "Waiting to Notify" },
    { id: "DISPATCHED", label: "Alerts Sent" },
    { id: "CONVERTED", label: "Orders Placed" },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-zinc-900">
      <ui-title-bar title="Waitlist Subscribers" />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Metric Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 font-sans">Total Customers</span>
            <div className="text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums mt-1 font-sans">
              {totalCount}
            </div>
            <p className="text-xs text-zinc-400 mt-1">All recorded storefront signups</p>
          </div>
          <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 font-sans">Waiting to Notify</span>
            <div className="text-3xl font-semibold tracking-tight text-amber-600 tabular-nums mt-1 font-sans">
              {pendingCount}
            </div>
            <p className="text-xs text-zinc-400 mt-1">Shoppers waiting for restock alerts</p>
          </div>
          <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 font-sans">Alerts Sent & Ordered</span>
            <div className="text-3xl font-semibold tracking-tight text-emerald-600 tabular-nums mt-1 font-sans">
              {dispatchedCount}
            </div>
            <p className="text-xs text-zinc-400 mt-1">Alerts successfully sent to customers</p>
          </div>
        </div>

        {/* Filter Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleStatusTab(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  statusParam === tab.id
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-72">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by email or product..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-sans"
            />
          </div>
        </div>

        {/* Data Grid Card or Empty State */}
        {subscribers.length === 0 ? (
          <div className="p-12 bg-white border border-dashed border-zinc-300 rounded-xl text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center mx-auto text-zinc-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-900">No Waitlist Customers Found</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Customer restock requests will appear here once visitors sign up for sold-out items on your live store.
            </p>
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
      </main>
    </div>
  );
}
