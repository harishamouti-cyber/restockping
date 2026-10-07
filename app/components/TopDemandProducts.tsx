import React from "react";
import { useNavigate } from "@remix-run/react";

export interface ProductDemand {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  subscribersCount: number;
  totalDemand: number;
}

export function TopDemandProducts({ products = [] }: { products: ProductDemand[] }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-zinc-200/70 rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_1px_2px_-1px_rgba(0,0,0,0.02)] relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-zinc-300/80 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-700">
            Top In-Demand Out-of-Stock SKUs
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Products with active shoppers waiting for restock notifications
          </p>
        </div>
        <button
          onClick={() => navigate("/app/subscribers")}
          className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline font-mono cursor-pointer"
        >
          View All Waitlists →
        </button>
      </div>

      {products.length === 0 ? (
        <div className="py-8 px-4 text-center flex flex-col items-center justify-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/40 mt-2">
          <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200/80 shadow-xs flex items-center justify-center text-emerald-600 mb-2.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-zinc-900">Queue is Clear</span>
          <p className="text-[11px] text-zinc-400 max-w-xs mt-0.5">
            All customer notifications have been delivered. New out-of-stock product signups will rank here automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-zinc-400 font-mono uppercase text-[10px]">
                <th className="pb-2 font-medium">Product / Variant</th>
                <th className="pb-2 font-medium">Unit Price</th>
                <th className="pb-2 font-medium">Waitlist Count</th>
                <th className="pb-2 font-medium">Potential Revenue</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {products.map((item) => (
                <tr key={item.variantId} className="group hover:bg-zinc-50/50 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-zinc-900 block">{item.productTitle}</span>
                    <span className="text-zinc-400 font-mono text-[11px] block">{item.variantTitle}</span>
                  </td>
                  <td className="py-3 font-mono text-zinc-600 tabular-nums">
                    ${Number(item.price || 0).toFixed(2)}
                  </td>
                  <td className="py-3 font-mono">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-zinc-100/80 text-zinc-600 ring-1 ring-inset ring-zinc-300/60 shadow-xs">
                      {item.subscribersCount} {item.subscribersCount === 1 ? "buyer" : "buyers"}
                    </span>
                  </td>
                  <td className="py-3 font-mono font-semibold text-zinc-900 tabular-nums">
                    ${Number(item.totalDemand || 0).toFixed(2)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => navigate(`/app/subscribers?q=${encodeURIComponent(item.productTitle)}`)}
                      className="px-2.5 py-1 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50 shadow-xs transition-colors cursor-pointer"
                    >
                      Manage Queue
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
