import React from "react";

export function LivePipelineNodes({ pendingCount = 0 }: { pendingCount: number }) {
  const steps = [
    {
      num: "01",
      badge: "Active on Store",
      badgeClass: "text-[#1a5c2e] bg-[#e3f1df] border-[#c1e5ba]",
      title: "Storefront Signup Box",
      desc: "Captures shopper interest cleanly without slowing down your store pages.",
    },
    {
      num: "02",
      badge: "Instant Sync",
      badgeClass: "text-[#1a5c2e] bg-[#e3f1df] border-[#c1e5ba]",
      title: "Inventory Detection",
      desc: "Detects stock additions the instant you adjust inventory in Shopify.",
    },
    {
      num: "03",
      badge: `${pendingCount} Waiting`,
      badgeClass: pendingCount > 0 
        ? "text-[#1a5c2e] bg-[#e3f1df] border-[#c1e5ba]" 
        : "text-[#616161] bg-[#f1f1f1] border-[#e1e3e5]",
      title: "Paced Group Alerts",
      desc: "Notifies customers in balanced batches so items don't sell out instantly.",
    },
    {
      num: "04",
      badge: "1-Click Checkout",
      badgeClass: "text-[#1a5c2e] bg-[#e3f1df] border-[#c1e5ba]",
      title: "Direct Checkout Link",
      desc: "Sends shoppers straight to checkout with their item already pre-filled.",
    },
  ];

  return (
    <div className="p-5 bg-white border border-[#e1e3e5] rounded-xl shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#303030]">
            How a Restock Turns into a Sale
          </h2>
          <p className="text-xs text-[#616161] mt-0.5">
            The automated journey from customer signup to completed purchase
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e3f1df] text-[#1a5c2e] border border-[#c1e5ba]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          All Systems Working
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((step) => (
          <div
            key={step.num}
            className="p-3.5 bg-[#fafafa] border border-[#e1e3e5] rounded-lg flex flex-col justify-between hover:bg-white hover:border-[#c9cccf] transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-[#616161]">
                  STEP {step.num}
                </span>
                <span className={`text-[10px] font-medium border px-2 py-0.5 rounded-full ${step.badgeClass}`}>
                  {step.badge}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-[#303030] mb-1">{step.title}</h4>
              <p className="text-xs text-[#616161] leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
