import React from "react";

export function LivePipelineNodes({ pendingCount = 0 }: { pendingCount: number }) {
  const steps = [
    {
      num: "01",
      badge: "Active on Store",
      badgeClass: "text-emerald-700 bg-emerald-50 ring-emerald-500/20",
      title: "Storefront Signup Box",
      desc: "Captures shopper interest cleanly without slowing down your store pages.",
    },
    {
      num: "02",
      badge: "Instant Sync",
      badgeClass: "text-emerald-700 bg-emerald-50 ring-emerald-500/20",
      title: "Inventory Detection",
      desc: "Detects stock additions the instant you adjust inventory in Shopify.",
    },
    {
      num: "03",
      badge: `${pendingCount} Waiting`,
      badgeClass: pendingCount > 0 
        ? "text-emerald-700 bg-emerald-50 ring-emerald-500/20" 
        : "text-slate-600 bg-slate-100 ring-slate-200",
      title: "Paced Group Alerts",
      desc: "Notifies customers in balanced batches so items don't sell out instantly.",
    },
    {
      num: "04",
      badge: "1-Click Checkout",
      badgeClass: "text-emerald-700 bg-emerald-50 ring-emerald-500/20",
      title: "Direct Checkout Link",
      desc: "Sends shoppers straight to checkout with their item already pre-filled.",
    },
  ];

  return (
    <div className="p-6 bg-white border border-slate-200/70 rounded-2xl shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900">
            How a Restock Turns into a Sale
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            The automated journey from customer signup to completed purchase
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          All Systems Working
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        {steps.map((step) => (
          <div
            key={step.num}
            className="p-4 bg-slate-50/70 border border-slate-200/60 rounded-xl flex flex-col justify-between hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-mono text-slate-400 font-semibold">
                  STEP {step.num}
                </span>
                <span className={`text-[10px] font-medium ring-1 ring-inset px-2 py-0.5 rounded-full ${step.badgeClass}`}>
                  {step.badge}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-slate-900 mb-1">{step.title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
