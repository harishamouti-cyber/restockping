import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { generateCartPermalink } from "../utils/permalink";
import { AppHeader } from "../components/AppHeader";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const queryParam = url.searchParams.get("query") || "";

  // Always query database records for this shop
  const allSubscribers = await db.restockSubscription.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  const totalCount = allSubscribers.length;
  const pendingCount = allSubscribers.filter((s) => s.status === "PENDING").length;

  const settings = await db.restockSettings.findUnique({
    where: { shop },
  });

  // Apply in-memory filtering for search & status view
  let filtered = allSubscribers;
  if (statusParam && statusParam !== "ALL") {
    filtered = filtered.filter((s) => s.status === statusParam);
  }
  if (queryParam.trim()) {
    const q = queryParam.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        (s.customerEmail && s.customerEmail.toLowerCase().includes(q)) ||
        (s.productTitle && s.productTitle.toLowerCase().includes(q))
    );
  }

  return json({
    subscribers: filtered,
    totalCount,
    pendingCount,
    discountCode: settings?.incentiveDiscountCode || "RESTOCK10",
    shop,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const subscriberId = String(formData.get("id") || "");

  if (intent === "seed_sample_subscribers") {
    const sampleEmails = [
      "alex.morgan@example.com",
      "sarah.connor@example.com",
      "marcus.wright@example.com",
      "elena.rostova@example.com",
      "david.kim@example.com",
    ];

    const variantId = "48192837492";
    const inventoryItemId = "inv_sample_987";
    const productTitle = "Aerospace Titanium Chronograph";
    const variantTitle = "Matte Black / 42mm";
    const priceSnapshot = 249.0;

    for (let i = 0; i < sampleEmails.length; i++) {
      const email = sampleEmails[i];
      const createdAt = new Date(Date.now() - (sampleEmails.length - i) * 120000);

      await db.restockSubscription.create({
        data: {
          shop,
          customerEmail: email,
          productId: "prod_sample_123",
          variantId,
          inventoryItemId,
          productTitle,
          variantTitle,
          priceSnapshot,
          status: "PENDING",
          createdAt,
        },
      });
    }

    return json({ ok: true, message: "5 sample waitlist subscribers seeded." });
  }

  if (intent === "dispatch_manual" && subscriberId) {
    await db.restockSubscription.updateMany({
      where: { id: subscriberId, shop },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        dispatchBatch: 999,
      },
    });
    return json({ ok: true, message: "Subscriber marked as dispatched" });
  }

  if (intent === "delete" && subscriberId) {
    await db.restockSubscription.deleteMany({
      where: { id: subscriberId, shop },
    });
    return json({ ok: true, message: "Subscriber record deleted" });
  }

  return json({ ok: true });
}

function UsersIcon({ className = "w-5 h-5 text-zinc-600" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

export default function SubscribersPage() {
  const { subscribers, totalCount, pendingCount, discountCode, shop } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const [queryValue, setQueryValue] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  function handleStatusChange(status: string) {
    setSelectedStatus(status);
    submit({ status, query: queryValue }, { method: "get" });
  }

  function handleQueryChange(value: string) {
    setQueryValue(value);
    submit({ status: selectedStatus, query: value }, { method: "get" });
  }

  function handleSeedFiveSubscribers() {
    const fd = new FormData();
    fd.append("intent", "seed_sample_subscribers");
    submit(fd, { method: "post" });
  }

  function handleOpenStorefrontPreview() {
    navigate("/app?tab=storefront");
  }

  function handleManualDispatch(id: string) {
    submit({ intent: "dispatch_manual", id }, { method: "post" });
  }

  function handleDelete(id: string) {
    submit({ intent: "delete", id }, { method: "post" });
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 flex flex-col font-sans">
      <AppHeader currentPageTitle="Subscribers" shop={shop} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Metric Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <span className="text-xs font-mono uppercase text-zinc-400 font-medium">Total Registered</span>
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums mt-1">
              {totalCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">All recorded storefront opt-ins</p>
          </div>
          <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <span className="text-xs font-mono uppercase text-zinc-400 font-medium">Pending In FIFO Queue</span>
            <div className="text-2xl font-bold font-mono tracking-tight text-amber-600 tabular-nums mt-1">
              {pendingCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Awaiting restock alert cohorts</p>
          </div>
          <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs">
            <span className="text-xs font-mono uppercase text-zinc-400 font-medium">Dispatched & Converted</span>
            <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 tabular-nums mt-1">
              {totalCount - pendingCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Alerts successfully released</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {["ALL", "PENDING", "DISPATCHED", "CONVERTED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleStatusChange(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                  selectedStatus === st
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by email or product..."
              value={queryValue}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
            {totalCount > 0 && (
              <button
                type="button"
                onClick={handleSeedFiveSubscribers}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg transition-colors cursor-pointer"
              >
                + Seed 5 Test
              </button>
            )}
          </div>
        </div>

        {/* 21st.dev Empty State OR Table */}
        {subscribers.length === 0 ? (
          <div className="relative overflow-hidden p-12 border border-dashed border-zinc-300 rounded-2xl bg-zinc-50/40 text-center flex flex-col items-center justify-center">
            {/* Background Dot Matrix Pattern */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(#000 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />
            <div className="relative w-12 h-12 rounded-xl bg-white border border-zinc-200/80 shadow-xs flex items-center justify-center text-zinc-500 mb-4">
              <UsersIcon className="w-5 h-5 text-zinc-600" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
              No Waitlist Records Found
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mt-1 leading-relaxed">
              Shopper restock requests will automatically populate here once visitors opt into sold-out variants on your live storefront.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleOpenStorefrontPreview}
                className="px-3.5 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 shadow-xs transition-colors cursor-pointer"
              >
                Preview Storefront Trigger
              </button>
              <button
                type="button"
                onClick={handleSeedFiveSubscribers}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                Simulate 5 Test Subscribers
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200/80 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-mono uppercase tracking-wider text-[11px]">
                    <th className="px-4 py-3 font-semibold">Customer Email</th>
                    <th className="px-4 py-3 font-semibold">Product / Variant</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Batch</th>
                    <th className="px-4 py-3 font-semibold">Subscribed Date</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60">
                  {subscribers.map((sub) => {
                    const permalink = generateCartPermalink({
                      shop,
                      variantId: sub.variantId,
                      customerEmail: sub.customerEmail,
                      discountCode,
                    });

                    return (
                      <tr key={sub.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-medium text-zinc-900 font-mono">
                          {sub.customerEmail || "Anonymous"}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-zinc-900">{sub.productTitle}</div>
                          <div className="text-zinc-500 text-[11px]">
                            {sub.variantTitle} &bull; ${sub.priceSnapshot.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                              sub.status === "PENDING"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : sub.status === "DISPATCHED"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : sub.status === "CONVERTED"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-zinc-50 text-zinc-700 border border-zinc-200"
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-zinc-500">
                          {sub.dispatchBatch > 0 ? `#${sub.dispatchBatch}` : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-zinc-500">
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {sub.status === "PENDING" && (
                              <button
                                type="button"
                                onClick={() => handleManualDispatch(sub.id)}
                                className="px-2 py-1 text-[11px] font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded"
                              >
                                Dispatch
                              </button>
                            )}
                            <a
                              href={permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 text-[11px] font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded no-underline"
                            >
                              Permalink
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDelete(sub.id)}
                              className="px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 bg-white border border-zinc-200 rounded"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
