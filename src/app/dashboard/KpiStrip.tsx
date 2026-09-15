export type KpiStat = {
  label: string;
  value: number | string;
  hint: string;
  accent?: boolean;
};

/** Compact KPI strip: small numbers, one row, no oversized cards. */
export function KpiStrip({ stats }: { stats: KpiStat[] }) {
  return (
    <dl
      aria-label="Publishing overview"
      className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0">
          <dd
            className={
              stat.accent
                ? "text-2xl leading-none font-semibold tracking-tight text-primary tabular-nums"
                : "text-2xl leading-none font-semibold tracking-tight tabular-nums"
            }
          >
            {stat.value}
          </dd>
          <dt className="mt-1 truncate text-[13px] leading-5 text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="mt-0.5 truncate text-xs text-muted-foreground">
            {stat.hint}
          </dd>
        </div>
      ))}
    </dl>
  );
}
