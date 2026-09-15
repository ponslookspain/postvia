export type OutcomeSegment = {
  label: string;
  value: number;
  /** Stroke color class for the SVG arc. */
  className: string;
  /** Fill color class for the legend dot. */
  dotClassName: string;
};

/**
 * Outcome distribution as a dependency-free SVG donut.
 * Segments use stroke-dasharray on stacked circles; the legend list
 * beside it is the accessible equivalent of the graphic.
 */
export function OutcomeDonut({ segments }: { segments: OutcomeSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to show yet — publish your first post.
      </p>
    );
  }
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const arcs = segments.flatMap((segment) => {
    if (segment.value === 0) return [];
    return [{ segment, length: (segment.value / total) * circumference }];
  });
  const offsets = arcs.map((_, index) =>
    arcs.slice(0, index).reduce((sum, arc) => sum + arc.length, 0)
  );
  return (
    <div className="flex items-center gap-5">
      <svg
        viewBox="0 0 128 128"
        className="size-32 shrink-0"
        role="img"
        aria-label={`Post outcomes: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}.`}
      >
        <circle
          cx={64}
          cy={64}
          r={radius}
          fill="none"
          strokeWidth={18}
          className="stroke-muted"
        />
        {arcs.map((arc, index) => (
          <circle
            key={arc.segment.label}
            cx={64}
            cy={64}
            r={radius}
            fill="none"
            strokeWidth={18}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-(offsets[index] ?? 0)}
            strokeLinecap="butt"
            transform="rotate(-90 64 64)"
            className={arc.segment.className}
            stroke="currentColor"
          />
        ))}
        <text
          x={64}
          y={60}
          textAnchor="middle"
          className="fill-foreground text-2xl font-semibold tabular-nums"
        >
          {total}
        </text>
        <text
          x={64}
          y={78}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          posts
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {segments.map((segment) => (
          <li
            key={segment.label}
            className="flex items-center gap-2 text-sm"
          >
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${segment.dotClassName}`}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {segment.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {segment.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
