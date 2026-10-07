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
    <div className="p-6 bg-white border border-slate-200/70 rounded-2xl shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-700">
            Top Requested Sold-Out Products
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Products with shoppers waiting for restock alerts
          </p>
        </div>
        <button
          onClick={() => navigate("/app/subscribers")}
          className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
        >
          View Full Waitlist →
        </button>
      </div>

      {products.length === 0 ? (
        <div className="py-10 px-4 text-center flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-2.5 shadow-xs">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-slate-900">All Products In Stock</span>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            There are currently no customer waitlist requests. When a shopper signs up for a sold-out item, it will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-mono uppercase text-[10px]">
                <th className="pb-2.5 font-medium">Product / Variant</th>
                <th className="pb-2.5 font-medium">Price</th>
                <th className="pb-2.5 font-medium">Shoppers Waiting</th>
                <th className="pb-2.5 font-medium">Potential Revenue</th>
                <th className="pb-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((item) => (
                <tr key={item.variantId} className="group hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-slate-900 block">{item.productTitle}</span>
                    <span className="text-slate-400 text-[11px] block">{item.variantTitle}</span>
                  </td>
                  <td className="py-3 font-mono text-slate-600 tabular-nums">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="py-3 font-mono">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                      {item.subscribersCount} {item.subscribersCount === 1 ? "customer" : "customers"}
                    </span>
                  </td>
                  <td className="py-3 font-mono font-semibold text-slate-900 tabular-nums">
                    ${item.totalDemand.toFixed(2)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => navigate(`/app/subscribers?q=${encodeURIComponent(item.productTitle)}`)}
                      className="px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-all cursor-pointer"
                    >
                      View Shoppers
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
