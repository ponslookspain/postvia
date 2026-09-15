"use client";

import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { remainingCharacters } from "@/lib/composer-previews";
import { PreviewCard } from "./PreviewCard";
import type { RailItem } from "./PreviewRail";
import type { DraftMedia } from "./types";

/**
 * One accordion row in the preview rail. Collapsed it carries identity,
 * remaining budget and blocking-error state; expanded it shows the full
 * read-only platform mock. Expansion is always user-initiated, so the
 * chevron rotation is the only motion on this element.
 */
export function PreviewAccordionItem({
  item,
  userName,
  media,
  disabled,
  expanded,
  onToggle,
  onCustomize,
}: {
  item: RailItem;
  userName: string;
  media: DraftMedia[];
  disabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCustomize: (accountId: string) => void;
}) {
  const { model } = item;
  const errorCount = model.validation.errors.length;
  const remaining = remainingCharacters(model.text, model.maxLength);
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`preview-panel-${model.accountId}`}
        id={`preview-header-${model.accountId}`}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Avatar size="sm" className="size-6 shrink-0">
          <AvatarFallback className="bg-muted">
            <PlatformIcon platform={model.platform} className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{item.identityLabel}</span>{" "}
          <span className="text-muted-foreground tabular-nums">
            @{item.identityUsername}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {errorCount > 0 && (
            <Badge variant="destructive" className="tabular-nums">
              {errorCount} {errorCount === 1 ? "issue" : "issues"}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {remaining} left
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              expanded && "rotate-180"
            )}
          />
        </span>
      </button>
      {expanded && (
        <div
          id={`preview-panel-${model.accountId}`}
          role="region"
          aria-labelledby={`preview-header-${model.accountId}`}
          className="border-t border-border p-3"
        >
          <PreviewCard
            model={model}
            userName={userName}
            media={media}
            customText={item.customText}
            customDescription={undefined}
            hasOverride={item.hasOverride}
            overrideSettings={{}}
            isCustomizing={false}
            disabled={disabled}
            onCustomize={() => onCustomize(model.accountId)}
          />
        </div>
      )}
    </div>
  );
}
