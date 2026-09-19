/**
 * Minimal dashboard query timing helpers (analytics instrumentation).
 *
 * Pure + side-effect free: measures elapsed time of an async query without
 * changing its result, errors, or contracts. Emitting/logging decisions
 * live in `dashboard.ts` (gated by `DASHBOARD_QUERY_TIMING=1`), never here.
 *
 * Privacy: this module only handles numeric durations and caller-provided
 * keys. It never sees post content, usernames, tokens, or user ids.
 */

/** One timing key per dashboard read + total + view-model assembly. */
export const DASHBOARD_QUERY_KEYS = [
  "dashboard.q1.statusGroups",
  "dashboard.q2.recentPosts",
  "dashboard.q3.attentionPosts",
  "dashboard.q4.upcomingPosts",
  "dashboard.q5.accounts",
  "dashboard.q6.effective",
  "dashboard.q7.usage",
  "dashboard.q8.targetStats",
  "dashboard.q9.recentActivity",
  "dashboard.q10.accountPulse",
  "dashboard.total",
  "dashboard.viewModel",
] as const;

export type DashboardQueryKey = (typeof DASHBOARD_QUERY_KEYS)[number];

/** Per-query durations in milliseconds (fractional, high-resolution). */
export type DashboardQueryTimings = Partial<Record<DashboardQueryKey, number>>;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * Runs `fn`, returning its value untouched plus wall-clock duration.
 * Thrown errors propagate 1:1 (same identity) — timing never swallows,
 * wraps, or delays rejection handling beyond the measurement itself.
 */
export async function timeQuery<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; ms: number }> {
  const start = nowMs();
  try {
    const value = await fn();
    return { value, ms: Math.max(0, nowMs() - start) };
  } catch (error) {
    throw error;
  }
}

/** True only when explicit opt-in env is set (never logs by default). */
export function isDashboardTimingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.DASHBOARD_QUERY_TIMING === "1";
}

/** Round for stable log payloads (measurement itself stays full precision). */
export function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}
