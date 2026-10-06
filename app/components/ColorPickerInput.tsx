import React from "react";

interface ColorPickerInputProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  description?: string;
}

export function ColorPickerInput({
  label,
  value,
  onChange,
  description = "Controls storefront button and badge highlights",
}: ColorPickerInputProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-700 block">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded-lg border border-zinc-200 p-0.5 cursor-pointer bg-white"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 px-3 py-1.5 text-xs font-mono uppercase bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
        />
        <span className="text-xs text-zinc-400">{description}</span>
      </div>
    </div>
  );
}
