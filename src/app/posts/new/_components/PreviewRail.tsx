"use client";

import { FileTextIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ComposerPreviewModel } from "@/lib/composer-previews";
import { PreviewAccordionItem } from "./PreviewAccordionItem";
import type { DraftMedia } from "./types";

export type RailItem = {
  model: ComposerPreviewModel;
  identityLabel: string;
  identityUsername: string;
  customText: string | undefined;
  hasOverride: boolean;
};

/**
 * Read-only preview rail as a single-open accordion: collapsed rows
 * carry identity, remaining budget and blocking-error state, and one
 * row at a time expands to the full platform mock. Rail height stays
 * bounded no matter how many channels are selected, so the page keeps
 * one normal document scrollbar and the composer is never buried.
 * No scroll container lives inside this component. Customize actions
 * expand the matching editor in the center workspace instead of
 * editing in place.
 */
export function PreviewRail({
  items,
  userName,
  media,
  disabled,
  expandedId,
  onToggleExpand,
  onCustomize,
}: {
  items: RailItem[];
  userName: string;
  media: DraftMedia[];
  disabled: boolean;
  expandedId: string | null;
  onToggleExpand: (accountId: string) => void;
  onCustomize: (accountId: string) => void;
}) {
  return (
    <section
      aria-label="Preview"
      className="flex min-w-0 flex-col rounded-2xl border border-border bg-muted/40 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">Preview</h2>
        {items.length > 0 && (
          <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {items.length} selected
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>No previews yet</EmptyTitle>
            <EmptyDescription>
              Select a channel to see how your post will look.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {items.map((item) => (
            <PreviewAccordionItem
              key={item.model.accountId}
              item={item}
              userName={userName}
              media={media}
              disabled={disabled}
              expanded={expandedId === item.model.accountId}
              onToggle={() => onToggleExpand(item.model.accountId)}
              onCustomize={onCustomize}
            />
          ))}
        </div>
      )}
    </section>
  );
}
