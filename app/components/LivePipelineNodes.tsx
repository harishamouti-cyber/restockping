import React from "react";

export function LivePipelineNodes({ pendingCount = 0 }: { pendingCount: number }) {
  const steps = [
    {
      num: "01",
      badge: "Active",
      badgeColor: "bg-[#e3f1df] text-[#008060]",
      title: "Storefront signup box",
      desc: "Captures shopper interest without slowing down pages.",
    },
    {
      num: "02",
      badge: "Instant",
      badgeColor: "bg-[#e3f1df] text-[#008060]",
      title: "Inventory detection",
      desc: "Detects stock additions the instant you adjust Shopify.",
    },
    {
      num: "03",
      badge: `${pendingCount} waiting`,
      badgeColor: pendingCount > 0 ? "bg-[#e3f1df] text-[#008060]" : "bg-[#f1f2f4] text-[#616161]",
      title: "Paced group alerts",
      desc: "Notifies customers in safe, balanced batches.",
    },
    {
      num: "04",
      badge: "1-Click",
      badgeColor: "bg-[#e3f1df] text-[#008060]",
      title: "Direct checkout link",
      desc: "Sends shoppers straight to checkout with pre-filled items.",
    },
  ];

  return (
    <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#202223]">
          How restocks turn into sales
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#e3f1df] text-[#008060]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#008060]" />
          All systems operational
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        {steps.map((step) => (
          <div
            key={step.num}
            className="p-2.5 bg-[#f6f6f7] border border-[#e1e3e5] rounded flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-[#8c9196]">Step {step.num}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${step.badgeColor}`}>
                  {step.badge}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-[#202223] mb-0.5">{step.title}</h4>
              <p className="text-[11px] text-[#616161] leading-snug">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
