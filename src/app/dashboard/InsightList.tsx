import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import type { Insight } from "@/lib/dashboard-analytics";

/**
 * Operational insights: failures, expiries, quota, schedule.
 * Plain rows with an action link where one exists — no invented
 * engagement data, everything links to a real surface.
 */
export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {insights.map((insight) => (
        <li
          key={insight.text}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
        >
          <p className="flex min-w-0 items-center gap-2 text-sm">
            {insight.variant === "attention" && (
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-destructive"
              />
            )}
            <span className="min-w-0">{insight.text}</span>
          </p>
          {insight.href && (
            <Link
              href={insight.href}
              className="shrink-0 rounded-sm text-[13px] font-medium text-primary transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Review
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
