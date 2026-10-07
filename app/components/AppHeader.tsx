import React from "react";
import { RestockPingLogo } from "./RestockPingLogo";

import { openThemeEditor } from "../utils/themeDeepLink";

interface AppHeaderProps {
  currentPageTitle: string;
  shop?: string;
  statusText?: string;
  onThemeDeepLink?: () => void;
  actions?: React.ReactNode;
}

export function AppHeader({
  currentPageTitle,
  shop,
  statusText = "Webhook Listener Active",
  onThemeDeepLink,
  actions,
}: AppHeaderProps) {
  function handleThemeDeepLink() {
    if (onThemeDeepLink) {
      onThemeDeepLink();
      return;
    }
    const targetShop =
      shop ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("shop") || ""
        : "");
    openThemeEditor(targetShop);
  }

  return (
    <header className="flex-none px-6 py-4 bg-white border-b border-zinc-200/80">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RestockPingLogo className="w-5 h-5 text-emerald-600" />
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
              RestockPing
            </h1>
            <span className="text-zinc-300">/</span>
            <span className="text-sm font-medium text-zinc-500">
              {currentPageTitle}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-sans font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <button
            type="button"
            onClick={handleThemeDeepLink}
            className="px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-all shadow-xs cursor-pointer border-0"
          >
            Add to Theme Editor
          </button>
        </div>
      </div>
    </header>
  );
}
