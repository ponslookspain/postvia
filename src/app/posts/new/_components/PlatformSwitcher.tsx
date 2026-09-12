"use client";

import type { KeyboardEvent } from "react";
import type { Platform } from "@prisma/client";
import { cn } from "cn";
import { PlatformIcon } from "@/components/PlatformIcon";

export type PlatformTab = {
  platform: Platform;
  label: string;
  hint: string;
};

/**
 * Stage 2B: compact platform switcher. One tab per platform (never per
 * account), visible only for selected platforms. Pure presentation —
 * selection state stays in NewPostComposer.
 */
export function PlatformSwitcher({
  tabs,
  active,
  onSelect,
}: {
  tabs: PlatformTab[];
  active: Platform;
  onSelect: (platform: Platform) => void;
}) {
  if (tabs.length <= 1) return null;
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.platform === active);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;
    onSelect(next.platform);
    document.getElementById(`preview-tab-${next.platform}`)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label="Preview platform"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.platform === active;
        return (
          <button
            key={tab.platform}
            id={`preview-tab-${tab.platform}`}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(tab.platform)}
            className={cn(
              "flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-4 items-center justify-center [&_svg]:size-4"
            >
              <PlatformIcon platform={tab.platform} />
            </span>
            {tab.label}
            <span className="max-w-28 truncate text-xs text-muted-foreground">
              {tab.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
