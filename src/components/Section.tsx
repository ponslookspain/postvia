import type { ReactNode } from "react";
import { cn } from "cn";

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
        <h2
          id={id}
          className="text-lg leading-7 font-medium tracking-tight"
        >
          {title}
        </h2>
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

/**
 * Ruled divider between timetable sections. Prefer this over spacing
 * alone when two lists follow each other.
 */
export function SectionRule({ className }: { className?: string }) {
  return (
    <hr
      aria-hidden="true"
      className={cn("border-t border-border", className)}
    />
  );
}

/**
 * Form section for Settings, Billing and other single-column forms:
 * title, one-line purpose, then fields. Keeps every form on the
 * same title/description/field rhythm.
 */
export function FormSection({
  labelledBy,
  title,
  description,
  className,
  children,
}: {
  labelledBy: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("min-w-0", className)}
    >
      <h2
        id={labelledBy}
        className="text-lg leading-7 font-medium tracking-tight"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-1 mb-4 max-w-[68ch] text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      )}
      <div className="min-w-0">{children}</div>
    </section>
  );
}
