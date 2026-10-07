import React from "react";

export type StatusTone = "emerald" | "amber" | "rose" | "zinc" | "blue";

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({
  label,
  tone = "emerald",
  pulse = true,
  className = "",
}: StatusBadgeProps) {
  const toneStyles: Record<StatusTone, { bg: string; text: string; border: string; dot: string }> = {
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200/60",
      dot: "bg-emerald-500",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200/60",
      dot: "bg-amber-500",
    },
    rose: {
      bg: "bg-rose-50",
      text: "text-rose-700",
      border: "border-rose-200/60",
      dot: "bg-rose-500",
    },
    zinc: {
      bg: "bg-zinc-50",
      text: "text-zinc-600",
      border: "border-zinc-200",
      dot: "bg-zinc-400",
    },
    blue: {
      bg: "bg-sky-50",
      text: "text-sky-700",
      border: "border-sky-200/60",
      dot: "bg-sky-500",
    },
  };

  const current = toneStyles[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-sans font-medium border ${current.bg} ${current.text} ${current.border} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${current.dot} ${pulse ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}
