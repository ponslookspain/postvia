import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page container. One per page, directly inside AppShell's <main>.
 *
 * ```
 * 1440 / 1024 / 375 — same skeleton, fluid padding:
 * +--------------------------------------------------+
 * |  Sidebar |  PageContainer (left-aligned)          |
 * |          |  +----------------------+  +--------+  |
 * |          |  | PageHeader           |  | actions|  |
 * |          |  +----------------------+  +--------+  |
 * |          |  | section (rule list)               |  |
 * |          |  |----------------------------------|  |
 * |          |  | section (rule list)               |  |
 * +--------------------------------------------------+
 * ```
 *
 * Sizes mirror what pages already converge toward:
 * narrow 48rem — Billing, Settings and other single-column forms;
 * default 64rem — Dashboard, Posts, Accounts;
 * wide 76rem — Calendar, composers.
 */
export function PageContainer({
  size = "default",
  className,
  children,
}: {
  size?: "narrow" | "default" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="page-container"
      data-size={size}
      className={cn(
        "mx-auto w-full min-w-0 px-4 py-6 md:px-8 md:py-10",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-5xl",
        size === "wide" && "max-w-6xl",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Stack of major page sections. Replaces ad-hoc `flex flex-col gap-10`
 * wrappers so every page breathes on the same 2.5rem rhythm. The gap
 * lives in a class (not an inline style) so individual pages may pass
 * a denser `gap-*` via className without affecting other pages —
 * the default rendering is unchanged.
 */
export function PageSections({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="page-sections"
      className={cn("flex flex-col gap-[var(--section-gap)]", className)}
    >
      {children}
    </div>
  );
}
