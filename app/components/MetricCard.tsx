import React from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  badgeText: string;
  badgeTone?: "neutral" | "success" | "attention";
  description: string;
  icon?: React.ReactNode;
}

export function MetricCard({
  title,
  value,
  badgeText,
  badgeTone = "neutral",
  description,
  icon,
}: MetricCardProps) {
  const badgeClasses = {
    neutral: "text-[#616161] bg-[#f1f2f4]",
    success: "text-[#008060] bg-[#e3f1df]",
    attention: "text-amber-800 bg-amber-50",
  }[badgeTone];

  return (
    <div className="p-3.5 bg-white border border-[#e1e3e5] rounded-lg shadow-[0_1px_0_rgba(0,0,0,0.05)] flex flex-col justify-between min-h-[92px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-normal text-[#616161]">
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded ${badgeClasses}`}>
            {badgeText}
          </span>
          {icon && (
            <div className="text-zinc-400 flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
      </div>
      <div className="shopify-numeral mt-1">
        {value}
      </div>
      <div className="text-[11px] text-[#8c9196] mt-1 truncate">
        {description}
      </div>
    </div>
  );
}
