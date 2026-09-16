import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Section system. Postvia pages read as a dispatch timetable: sections
 * are separated by quiet hairline rules, not by boxes. Reach for Card
 * only when controls act together (connect panel, preview, publish).
 * Never number sections — content here is parallel, not sequential.
 *
 * ```
 * | SectionHeader ("Up next" ............ "View all scheduled")
 * | ----------------------------------------------------------  <- rule
 * | rows / controls
 * ```
 */
export function Section({
  labelledBy,
  label,
  className,
  children,
}: {
  labelledBy?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={cn("min-w-0", className)}
    >
      {children}
    </section>
  );
}

/**
 * Single h2 contract for every section title: SectionHeader renders this
 * instead of duplicating the class string, so the title scale can never
 * drift. Zero visual change — same element, same classes.
 */
function SectionTitle({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn("text-lg leading-7 font-medium tracking-tight", className)}
    >
      {children}
    </h2>
  );
}

/**
 * Section title row: 18px medium title, 14px muted description,
 * trailing actions or meta. Left-aligned; actions wrap underneath
 * the title on 375px screens instead of squeezing beside it.
 */
export function SectionHeader({
  id,
  title,
  description,
  actions,
  meta,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SectionTitle id={id}>{title}</SectionTitle>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
          {meta}
          {actions}
        </div>
      </div>
      {description && (
        <p className="mt-1 max-w-[68ch] text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
