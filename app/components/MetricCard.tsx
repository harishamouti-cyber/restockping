import React from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  badgeText: string;
  badgeTone?: "neutral" | "success" | "attention";
  description: string;
  icon: React.ReactNode;
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
    neutral: "text-zinc-600 bg-zinc-100 border-zinc-200",
    success: "text-emerald-700 bg-emerald-50 border-emerald-200/60 font-mono",
    attention: "text-amber-700 bg-amber-50 border-amber-200/60 font-mono",
  }[badgeTone];

  return (
    <div className="p-5 bg-white border border-zinc-200/80 rounded-xl shadow-xs relative overflow-hidden group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-wider font-medium text-zinc-400">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border ${badgeClasses}`}>
            {badgeText}
          </span>
          <div className="text-zinc-400 flex items-center justify-center">
            {icon}
          </div>
        </div>
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950 tabular-nums">
        {value}
      </div>
      <p className="text-xs text-zinc-400 mt-2 leading-normal">
        {description}
      </p>
    </div>
  );
}
