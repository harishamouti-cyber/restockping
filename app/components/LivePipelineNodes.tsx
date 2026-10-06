import React from "react";

export function LivePipelineNodes({ pendingCount = 0 }: { pendingCount: number }) {
  return (
    <div className="p-6 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-900">
            Automated Restock Journey
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time journey from customer signup to completed purchase
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          All Systems Running Smoothly
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
        {/* Step 1 */}
        <div className="p-4 bg-zinc-50/70 border border-zinc-200/70 rounded-xl flex flex-col justify-between relative group hover:bg-white hover:border-zinc-300 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-zinc-400 font-semibold">STEP 01</span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded whitespace-nowrap">
                Active on Store
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-900 mb-1">Storefront Signup Form</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Captures customer signups without slowing down your store or shifting your layout.
            </p>
          </div>
          {/* Subtle Desktop Flow Chevron */}
          <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-zinc-200 items-center justify-center text-zinc-400 shadow-xs pointer-events-none group-hover:text-zinc-600 transition-colors">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4 bg-zinc-50/70 border border-zinc-200/70 rounded-xl flex flex-col justify-between relative group hover:bg-white hover:border-zinc-300 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-zinc-400 font-semibold">STEP 02</span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded whitespace-nowrap">
                Instant Sync
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-900 mb-1">Instant Stock Detection</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Detects stock changes the moment you update inventory in your Shopify admin.
            </p>
          </div>
          {/* Subtle Desktop Flow Chevron */}
          <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-zinc-200 items-center justify-center text-zinc-400 shadow-xs pointer-events-none group-hover:text-zinc-600 transition-colors">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-4 bg-zinc-50/70 border border-zinc-200/70 rounded-xl flex flex-col justify-between relative group hover:bg-white hover:border-zinc-300 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-zinc-400 font-semibold">STEP 03</span>
              <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                {pendingCount} in Queue
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-900 mb-1">Smart Batch Alerts</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Notifies customers in small batches so items don't sell out before shoppers can buy.
            </p>
          </div>
          {/* Subtle Desktop Flow Chevron */}
          <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-zinc-200 items-center justify-center text-zinc-400 shadow-xs pointer-events-none group-hover:text-zinc-600 transition-colors">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>

        {/* Step 4 */}
        <div className="p-4 bg-zinc-50/70 border border-zinc-200/70 rounded-xl flex flex-col justify-between relative group hover:bg-white hover:border-zinc-300 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-zinc-400 font-semibold">STEP 04</span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded whitespace-nowrap">
                1-Click Checkout
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-900 mb-1">Direct Checkout Link</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Takes shoppers straight to checkout with their item already in the cart.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
