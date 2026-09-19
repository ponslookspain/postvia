# Dashboard Performance Baseline

First real performance evidence for the dashboard/analytics path (previously:
none — see analytics scalability audit). Instrumentation is permanent and
gated; this document records the baseline measured on 2026-09-18.

## Scope

Measured: all 10 reads inside `getDashboard()` (`src/lib/dashboard.ts`),
total `getDashboard()` duration, and pure JS view-model assembly
(`buildDashboardViewModel`). No UI, contract, or query-shape changes were
made to obtain these numbers — the only production change is a
result-transparent `timeQuery` wrapper plus an opt-in diagnostic emit.

Query keys (`src/lib/dashboard-timing.ts`):

`dashboard.q1.statusGroups`, `dashboard.q2.recentPosts`,
`dashboard.q3.attentionPosts`, `dashboard.q4.upcomingPosts`,
`dashboard.q5.accounts`, `dashboard.q6.effective`, `dashboard.q7.usage`,
`dashboard.q8.targetStats`, `dashboard.q9.recentActivity`,
`dashboard.q10.accountPulse`, plus `dashboard.total` and
`dashboard.viewModel`.

## Environment

- Database: isolated Neon **development** branch (`neondb`, pooled
  `eu-central-1` endpoint) — the designated local-dev branch per
  `docs/database.md`. Never production (14 pre-existing users/17 posts;
  counts verified identical before and after).
- Runner: `scripts/dashboard-benchmark.ts` with `ALLOW_DASHBOARD_BENCHMARK=1`
  (refuses `VERCEL_ENV=production` and `postvia.online` hosts).
- Network: app → pooled Neon over the internet. Round-trip latency is
  therefore part of every number below; server-side execution is separated
  out only in the EXPLAIN section.

## Dataset

Synthetic Scale-like users (direct Prisma inserts, bypassing entitlement
gates — labelled synthetic because 5k–10k posts / 8 accounts exceed the
Free limit of 15 posts + 1 account and Growth limit of 300 posts +
5 accounts; Scale is unlimited). All rows deleted after the run
(verified: 0 leftover).

| Scenario | Posts | PostTargets | Accounts | createdAt spread |
| -------- | ----: | ----------: | -------: | ---------------- |
| small    |   100 |         150 |        2 | 112 days |
| medium   | 1,000 |       1,500 |        5 | 120 days |
| large    | 5,000 |       7,500 |        8 | 140 days |
| stress   | 10,000 |     15,000 |        8 | 140 days |

Methodology: 1 warmup + 7 measured `getDashboard()` runs per scenario
(`n=8` recorded — the warmup/cold run is included, so **p95 == max** and
max reflects cold connection setup, not steady state; **p50 is the
steady-state number**). Scenario E (Q2 with `q="bench-post"` text search)
ran 7 extra times per scenario. EXPLAIN ran once each on large/stress.

## Query baseline (ms)

### Total `getDashboard()`

| Scenario | min | p50 | p95 (= max, cold) | mean |
| -------- | --: | --: | ----------------: | ---: |
| small    | 252 | 285 |               842 |  365 |
| medium   | 176 | 209 |               283 |  230 |
| large    | 169 | 281 |               434 |  271 |
| stress   | 176 | 216 |               487 |  247 |

**Total does not grow with data: 100 → 10,000 posts (100×) leaves p50
flat in the 209–285 ms band.** All scenarios are dominated by pooled-DB
round trips, not by execution.

### Per-query p50 (ms)

| Query | Small | Medium | Large | Stress |
| ----- | ----: | -----: | ----: | -----: |
| q1 statusGroups | 74 | 39 | 42 | 50 |
| q2 recentPosts (take 5 + include) | 176 | 174 | 167 | 174 |
| q3 attentionPosts (take 5 + include) | 193 | 176 | 148 | 165 |
| q4 upcomingPosts (take 3 + include) | 274 | 183 | 156 | 154 |
| q5 accounts | 72 | 42 | 44 | 50 |
| q6 effective (subscription lookups) | 73 | 46 | 49 | 48 |
| q7 usage fan-out | 76 | 74 | 75 | 77 |
| q8 targetStats (groupBy platform,status) | 73 | 45 | 71 | 111 |
| q9 recentActivity (unbounded window read) | 73 | 110 | 165 | 213 |
| q10 accountPulse (groupBy + max) | 74 | 48 | 69 | 113 |
| viewModel (pure JS) | 0.5 | 0.7 | 1.6 | 2.7 |

Observations:

- Q2/Q3/Q4 (the `take 3–5` + `targets.socialAccount + media` includes) are
  the slowest in absolute terms (~150–275 ms) but **flat across data
  volume** — cost is fixed join/include overhead per tiny result set.
- Q9 is the **only query that scales with data** (73 → 110 → 165 →
  213 ms p50 for ~60 → 600 → 3,000 → 6,000 window rows). Growth is
  sub-linear and the absolute value at 6k rows (213 ms, mostly transfer
  + RTT) is not a bottleneck.
- Q8/Q10 grow mildly with target count (73→111 ms / 74→113 ms at
  150→15,000 targets) — measurable but small.
- Q7 usage fan-out is flat (~75 ms): monthly counts + ledger lookups stay
  cheap.
- JS view-model assembly (`bucketWeeks`, `summarizePlatforms`, maps) is
  0.5–2.7 ms — in-memory aggregation is **not** a cost center.
- Scenario E: Q2 with ILIKE text search matches Q2 without search within
  noise (small 170 vs 176 ms; stress 186 vs 174 ms p50). No text-search
  cliff at these volumes.

## EXPLAIN findings (Q8/Q9/Q10)

**Important: these are APPROXIMATE plans, not exact Prisma query plans.**
They are hand-written SQL with the same tables, filters, grouping, and
ordering as the Prisma queries (see `explainApproximate()` in
`scripts/dashboard-benchmark.ts`), executed as
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on the isolated dev database.
Prisma's exact SQL bytes were not captured.

| Query | Dataset | Exec time | Planning | Top node | Scans | Index? | Actual rows | Shared hit blocks |
| ----- | ------- | --------: | -------: | -------- | ----- | ------ | ----------: | ----------------: |
| q8 approx | large (7.5k targets) | 14.4 ms | 0.32 ms | Aggregate | Index Scan | yes | 16 groups | 15,744 |
| q9 approx | large (3k window rows) | 2.5 ms | 0.16 ms | Sort | Index Scan | yes | 3,000 | 700 |
| q10 approx | large (7.5k targets) | 14.6 ms | 0.24 ms | Aggregate | Index Scan | yes | 8 groups | 15,744 |
| q8 approx | stress (15k targets) | 29.6 ms | 0.25 ms | Aggregate | Index Scan | yes | 16 groups | 31,476 |
| q9 approx | stress (6k window rows) | 5.1 ms | 0.10 ms | Sort | Index Scan | yes | 6,000 | 1,382 |
| q10 approx | stress (15k targets) | 30.7 ms | 0.27 ms | Aggregate | Index Scan | yes | 8 groups | 31,476 |

Findings:

- **Every plan uses Index Scan; zero sequential scans.** The suspected
  `PostTarget` join gap did not materialize as a plan problem at 15k
  targets (server-side execution ~30 ms).
- DB server-side execution (≤ 31 ms) is a small fraction of the
  Prisma-measured duration (Q8 stress p50 111 ms) — the remainder is
  pooled-network RTT + client overhead, which no index or aggregate table
  can remove.
- Group cardinalities confirm the audit: 16 targetStats groups, 8 pulse
  groups — result sizes never grow with data.

## Instrumentation overhead (before/after)

- Wrapper micro-benchmark (20k iterations, no DB): **388 ns per call** —
  ~0.0002% of a typical 150 ms query. Not a performance problem.
- `DASHBOARD_QUERY_TIMING` defaults to off: production emits zero extra
  logs; measurement itself is two clock reads per query.
- Correctness: wrapper returns the identical value reference and rethrows
  the identical error (covered by `tests/dashboard-timing.test.ts`);
  `getDashboard()` return type and all view-model contracts unchanged;
  benchmark runs completed 32/32 successful dashboard assemblies across
  scenarios with no errors.

## Bottlenecks

**None confirmed.** No query shows degrading p50 that would threaten the
dashboard at 100× current data volume; EXPLAIN shows healthy index usage;
JS aggregation costs single-digit milliseconds.

Watch-list (not action items): Q9 if a single user ever holds
100k+ posts inside one 12-week window; Q8/Q10 join shape if targets ever
reach millions per user. Both are far outside current product limits
(Free 15/mo, Growth 300/mo).

## Decision

**NO ACTION NEEDED.** No query/index optimization justified, and
aggregated daily statistics are not justified. Re-measure with this same
script if product limits change (e.g. higher Scale quotas) or if p95
dashboard latency is ever observed degrading in production.
