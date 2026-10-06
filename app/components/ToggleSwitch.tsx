import React from "react";

interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <div className="flex items-start justify-between p-4 bg-zinc-50/50 border border-zinc-200/80 rounded-xl">
      <div>
        <span className="text-xs font-semibold text-zinc-900 block">{label}</span>
        {description && (
          <span className="text-xs text-zinc-500 block mt-0.5 leading-relaxed">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? "bg-emerald-600" : "bg-zinc-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
