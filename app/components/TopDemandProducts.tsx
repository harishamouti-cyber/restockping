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
    <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] font-medium text-[#202223] block">
            Top requested products
          </span>
          <span className="text-[11px] text-[#8c9196]">
            Sold-out products with active customer interest
          </span>
        </div>
        <button
          onClick={() => navigate("/app/subscribers")}
          className="text-xs font-medium text-[#008060] hover:underline cursor-pointer"
        >
          View all →
        </button>
      </div>

      {products.length === 0 ? (
        <div className="py-5 px-3 text-center flex flex-col items-center justify-center border border-dashed border-[#d2d5d8] rounded bg-[#f6f6f7]">
          <span className="text-xs font-medium text-[#202223]">All products in stock</span>
          <p className="text-[11px] text-[#8c9196] max-w-xs mt-0.5 leading-normal">
            No active customer waitlist requests. When shoppers opt into sold-out items, they will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e1e3e5] text-[#616161] text-[11px] font-medium">
                <th className="pb-1.5 font-normal">Product</th>
                <th className="pb-1.5 font-normal">Price</th>
                <th className="pb-1.5 font-normal">Waiting</th>
                <th className="pb-1.5 font-normal">Revenue</th>
                <th className="pb-1.5 font-normal text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f2f4]">
              {products.map((item) => (
                <tr key={item.variantId} className="hover:bg-[#f6f6f7] transition-colors">
                  <td className="py-2 pr-2">
                    <span className="font-medium text-[#202223] block truncate max-w-[180px]">{item.productTitle}</span>
                    <span className="text-[#8c9196] text-[10px]">{item.variantTitle}</span>
                  </td>
                  <td className="py-2 text-[#202223] tabular-nums font-normal">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="py-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[#f1f2f4] text-[#202223]">
                      {item.subscribersCount}
                    </span>
                  </td>
                  <td className="py-2 font-medium text-[#202223] tabular-nums">
                    ${item.totalDemand.toFixed(2)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => navigate(`/app/subscribers?q=${encodeURIComponent(item.productTitle)}`)}
                      className="px-2 py-0.5 text-xs text-[#202223] bg-white border border-[#d2d5d8] rounded hover:bg-[#f6f6f7] cursor-pointer"
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
