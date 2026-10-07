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
    <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-3">
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
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-zinc-400">
                  No active waitlist requests recorded.
                </td>
              </tr>
            ) : (
              products.map((item) => (
                <tr key={item.variantId} className="group hover:bg-zinc-50/50 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-zinc-900 block">{item.productTitle}</span>
                    <span className="text-zinc-400 font-mono text-[11px] block">{item.variantTitle}</span>
                  </td>
                  <td className="py-3 font-mono text-zinc-600 tabular-nums">
                    ${Number(item.price || 0).toFixed(2)}
                  </td>
                  <td className="py-3 font-mono">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
