import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page title row. Left-aligned, one per page: 24px semibold title,
 * 14px muted description capped at 68ch, actions pinned right and
 * wrapping below on narrow screens. No eyebrows, no numbering —
 * the title itself carries the hierarchy.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className
      )}
    >
      <div className="min-w-0 flex-1 basis-48">
        <h1 className="text-2xl leading-8 font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-[68ch] text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
