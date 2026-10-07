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
    <div className="p-5 bg-white border border-[#e1e3e5] rounded-xl shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#303030]">
            Top Requested Sold-Out Products
          </h3>
          <p className="text-xs text-[#616161] mt-0.5">
            Products with shoppers waiting for restock alerts
          </p>
        </div>
        <button
          onClick={() => navigate("/app/subscribers")}
          className="text-xs font-medium text-[#005bd3] hover:underline cursor-pointer"
        >
          View Full Waitlist →
        </button>
      </div>

      {products.length === 0 ? (
        <div className="py-8 px-4 text-center flex flex-col items-center justify-center border border-dashed border-[#e1e3e5] rounded-lg bg-[#fafafa]">
          <div className="w-8 h-8 rounded-full bg-[#e3f1df] border border-[#c1e5ba] flex items-center justify-center text-[#1a5c2e] mb-2 shadow-xs">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[#303030]">All Products In Stock</span>
          <p className="text-xs text-[#616161] max-w-sm mt-1">
            There are currently no customer waitlist requests. When a shopper signs up for a sold-out item, it will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e3e5] text-[#616161] uppercase text-[11px] font-medium tracking-wider">
                <th className="pb-2.5 font-medium">Product / Variant</th>
                <th className="pb-2.5 font-medium">Price</th>
                <th className="pb-2.5 font-medium">Shoppers Waiting</th>
                <th className="pb-2.5 font-medium">Potential Revenue</th>
                <th className="pb-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e3e5]">
              {products.map((item) => (
                <tr key={item.variantId} className="group hover:bg-[#f6f6f7] transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-[#303030] block">{item.productTitle}</span>
                    <span className="text-[#616161] text-[11px] block">{item.variantTitle}</span>
                  </td>
                  <td className="py-2.5 font-sans font-medium text-[#616161] tabular-nums">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="py-2.5 font-sans">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f1f1f1] text-[#303030] border border-[#e1e3e5]">
                      {item.subscribersCount} {item.subscribersCount === 1 ? "customer" : "customers"}
                    </span>
                  </td>
                  <td className="py-2.5 font-sans font-semibold text-[#303030] tabular-nums">
                    ${item.totalDemand.toFixed(2)}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => navigate(`/app/subscribers?q=${encodeURIComponent(item.productTitle)}`)}
                      className="px-2.5 py-1 text-xs font-medium text-[#303030] bg-white border border-[#c9cccf] rounded-lg hover:bg-[#f6f6f7] shadow-xs transition-all cursor-pointer"
                    >
                      View
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
