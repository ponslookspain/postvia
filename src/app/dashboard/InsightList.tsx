import Link from "next/link";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/dashboard-analytics";

/**
 * Two weights only: something broke (error tint) and something worth
 * knowing (warning tint). A heads-up must never look like a failure —
 * that is what makes a dashboard feel like it is nagging.
 */
export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {insights.map((insight) => {
        const problem = insight.variant === "problem";
        const Icon = problem ? TriangleAlertIcon : InfoIcon;
        return (
          <li
            key={insight.text}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3",
              problem
                ? "border-error-border/40 bg-error-accent"
                : "border-warning-border bg-warning-accent"
            )}
          >
            <p className="flex min-w-0 items-center gap-2.5 text-sm">
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0",
                  problem ? "text-error" : "text-warning"
                )}
              />
              <span className="min-w-0">{insight.text}</span>
            </p>
            {insight.href && (
              <Link
                href={insight.href}
                className={cn(
                  "shrink-0 rounded-sm text-label font-medium transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50",
                  problem ? "text-error-text" : "text-warning-text"
                )}
              >
                {insight.action ?? "Review"}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
