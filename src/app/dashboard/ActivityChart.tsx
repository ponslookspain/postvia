import type { WeekBucket } from "@/lib/dashboard-analytics";

/**
 * Twelve-week publishing activity as dependency-free SVG bars.
 * One stacked bar per week (published / scheduled / failed) with a
 * legend, per-bar tooltips and a text summary for assistive tech.
 * No animation, no client JS.
 */
export function ActivityChart({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(
    1,
    ...weeks.map((week) => week.published + week.scheduled + week.failed)
  );
  const height = 160;
  const barWidth = 14;
  const gap = 10;
  const width = weeks.length * (barWidth + gap) + gap;
  const total = weeks.reduce(
    (sum, week) => sum + week.published + week.scheduled + week.failed,
    0
  );
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No publishing activity in the last 12 weeks yet.
      </p>
    );
  }
  const scale = (value: number) => (value / max) * (height - 24);
  return (
    <figure className="min-w-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height + 22}`}
          className="h-44 w-full min-w-[320px]"
          role="img"
          aria-label={`Publishing activity per week for the last ${weeks.length} weeks, ${total} posts in total.`}
        >
          <line
            x1={gap}
            x2={width - gap}
            y1={height - 20}
            y2={height - 20}
            className="stroke-border"
            strokeWidth={1}
          />
          {weeks.map((week, index) => {
            const failedHeight = scale(week.failed);
            const scheduledHeight = scale(week.scheduled);
            const publishedHeight = scale(week.published);
            const x = gap + index * (barWidth + gap);
            const base = height - 20;
            return (
              <g key={week.key}>
                <title>{`${week.label}: ${week.published} published, ${week.scheduled} scheduled, ${week.failed} failed`}</title>
                <rect
                  x={x}
                  y={base - publishedHeight}
                  width={barWidth}
                  height={Math.max(publishedHeight, 0)}
                  rx={3}
                  className="fill-primary"
                />
                <rect
                  x={x}
                  y={base - publishedHeight - scheduledHeight}
                  width={barWidth}
                  height={Math.max(scheduledHeight, 0)}
                  rx={3}
                  className="fill-muted-foreground/40"
                />
                {week.failed > 0 && (
                  <rect
                    x={x}
                    y={base - publishedHeight - scheduledHeight - failedHeight}
                    width={barWidth}
                    height={Math.max(failedHeight, 2)}
                    rx={3}
                    className="fill-error"
                  />
                )}
                {index % 3 === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-micro"
                  >
                    {week.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          Published
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-muted-foreground/40"
          />
          Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-error" />
          Failed
        </span>
      </figcaption>
    </figure>
  );
}
