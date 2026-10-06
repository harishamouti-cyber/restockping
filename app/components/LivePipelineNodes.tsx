import React from "react";

interface LivePipelineNodesProps {
  pendingCount?: number;
  className?: string;
}

export function LivePipelineNodes({ pendingCount = 0, className = "" }: LivePipelineNodesProps) {
  const nodes = [
    {
      step: "01",
      name: "Storefront Opt-In",
      tag: "Theme App Block",
      status: "Active & Listening",
      detail: "Captures shopper demand with zero Cumulative Layout Shift (CLS)",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      icon: (
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      step: "02",
      name: "Webhook Ingest",
      tag: "inventory_levels/update",
      status: "Sub-50ms Reactive",
      detail: "Instant telemetry ingestion upon Shopify warehouse inventory delta",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      icon: (
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
    },
    {
      step: "03",
      name: "Paced Cohort Alert",
      tag: "FIFO Drip Engine",
      status: pendingCount > 0 ? `${pendingCount} In Queue` : "Standby Queue",
      detail: "Mathematical drip pacing prevents storefront inventory burnout",
      badgeColor: pendingCount > 0 ? "bg-amber-50 text-amber-700 border-amber-200/60" : "bg-zinc-100 text-zinc-600 border-zinc-200",
      icon: (
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      step: "04",
      name: "1-Click Checkout",
      tag: "Cart Permalink",
      status: "Direct Purchase",
      detail: "Tokenized direct checkout link bypassing storefront navigation",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      icon: (
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className={`p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-zinc-900 tracking-tight uppercase">
              Autonomous Replenishment Pipeline
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              All Nodes Operational
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Interconnected diagnostic flow from storefront subscriber capture to 1-click cart checkout
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
        {nodes.map((node, i) => (
          <div
            key={node.step}
            className="p-3.5 bg-zinc-50/60 hover:bg-zinc-50 border border-zinc-200/80 rounded-lg transition-all relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white border border-zinc-200/80 flex items-center justify-center shadow-2xs">
                    {node.icon}
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 font-semibold">{node.step}</span>
                </div>
                <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border ${node.badgeColor}`}>
                  {node.status}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-zinc-900">{node.name}</h4>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{node.detail}</p>
            </div>
            <div className="mt-3 pt-2 border-t border-zinc-200/40 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span>{node.tag}</span>
              {i < nodes.length - 1 && (
                <span className="hidden md:inline text-zinc-300 font-mono">→</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
