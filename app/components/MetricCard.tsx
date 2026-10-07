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
    neutral: "text-[#616161] bg-[#f1f1f1] border-[#e1e3e5]",
    success: "text-[#1a5c2e] bg-[#e3f1df] border-[#c1e5ba]",
    attention: "text-amber-700 bg-amber-50 border-amber-200/60",
  }[badgeTone];

  return (
    <div className="p-4 bg-white border border-[#e1e3e5] rounded-xl shadow-xs relative overflow-hidden group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#616161]">
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${badgeClasses}`}>
            {badgeText}
          </span>
          {icon && (
            <div className="text-zinc-400 flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-0.5 mt-1">
        <span className="text-[28px] font-semibold text-[#303030] tracking-[-0.03em] leading-8 tabular-nums font-sans">
          {value}
        </span>
      </div>
      <p className="text-xs text-[#616161] mt-2 leading-normal">
        {description}
      </p>
    </div>
  );
}
