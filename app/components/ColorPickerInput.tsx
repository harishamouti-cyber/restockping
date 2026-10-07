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
    <div className="space-y-1.5 font-sans">
      <label className="text-xs font-medium text-[#202223] block">{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded border border-[#c9cccf] p-0.5 cursor-pointer bg-white"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-24 px-2.5 py-1.5 text-xs uppercase text-[#202223] bg-white border border-[#c9cccf] rounded-md focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] outline-none transition-all"
          />
        </div>

        {/* Live Storefront Button Preview */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#8c9196]">Preview:</span>
          <span
            style={{ backgroundColor: value }}
            className="px-2.5 py-1 text-xs font-medium text-white rounded shadow-2xs select-none"
          >
            Notify Me When Available
          </span>
        </div>
      </div>
      <p className="text-[11px] text-[#616161] mt-0.5">{description}</p>
    </div>
  );
}
