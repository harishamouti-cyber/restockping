import React from "react";

export function LivePipelineNodes({ pendingCount = 0 }: { pendingCount: number }) {
  const steps = [
    {
      num: "01",
      badge: "Active on Store",
      badgeClass: "text-emerald-700 bg-emerald-50/80 ring-1 ring-inset ring-emerald-600/20",
      title: "Storefront Signup Form",
      desc: "Captures customer signups without slowing down your store or shifting layout.",
    },
    {
      num: "02",
      badge: "Instant Sync",
      badgeClass: "text-emerald-700 bg-emerald-50/80 ring-1 ring-inset ring-emerald-600/20",
      title: "Instant Stock Detection",
      desc: "Detects stock changes the moment you update inventory in your Shopify admin.",
    },
    {
      num: "03",
      badge: `${pendingCount} in Queue`,
      badgeClass: pendingCount > 0
        ? "text-emerald-700 bg-emerald-50/80 ring-1 ring-inset ring-emerald-600/20"
        : "text-zinc-600 bg-zinc-100/80 ring-1 ring-inset ring-zinc-300/60",
      title: "Smart Batch Alerts",
      desc: "Notifies customers in small batches so items don't sell out before shoppers can buy.",
    },
    {
      num: "04",
      badge: "1-Click Checkout",
      badgeClass: "text-emerald-700 bg-emerald-50/80 ring-1 ring-inset ring-emerald-600/20",
      title: "Direct Checkout Link",
      desc: "Takes shoppers straight to checkout with their item already pre-filled in the cart.",
    },
  ];

  return (
    <div className="bg-white border border-zinc-200/70 rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_1px_2px_-1px_rgba(0,0,0,0.02)] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-900">
            Automated Restock Journey
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time journey from customer signup to completed purchase
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium font-mono bg-emerald-50/80 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          All Systems Running Smoothly
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
        {steps.map((step) => (
          <div
            key={step.num}
            className="p-4 bg-zinc-50/70 border border-zinc-200/70 rounded-2xl flex flex-col justify-between hover:bg-white hover:border-zinc-300/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-zinc-400 font-semibold">
                  STEP {step.num}
                </span>
                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${step.badgeClass}`}>
                  {step.badge}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-zinc-900 mb-1">{step.title}</h4>
              <p className="text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
