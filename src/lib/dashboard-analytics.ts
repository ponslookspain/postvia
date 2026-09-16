import { format, startOfWeek, subWeeks } from "date-fns";

/**
 * Pure dashboard aggregation. Everything here derives from post/target
 * rows the dashboard already reads — no engagement data (likes,
 * impressions, reach) exists in the schema, so none is invented.
 * Server components call these; unit tests pin the bucketing math.
 */

export type ActivityStatusBucket = "published" | "scheduled" | "failed";

export type WeekBucket = {
  key: string;
  label: string;
  published: number;
  scheduled: number;
  failed: number;
};

const PUBLISHED_STATUSES = new Set(["PUBLISHED"]);
const SCHEDULED_STATUSES = new Set(["SCHEDULED", "PUBLISHING"]);
const FAILED_STATUSES = new Set(["FAILED", "PARTIALLY_PUBLISHED"]);

export function bucketActivityStatus(status: string): ActivityStatusBucket | null {
  if (PUBLISHED_STATUSES.has(status)) return "published";
  if (SCHEDULED_STATUSES.has(status)) return "scheduled";
  if (FAILED_STATUSES.has(status)) return "failed";
  return null;
}

/**
 * Buckets posts into the last `weeks` full weeks (Monday-start) plus the
 * current partial week. Drafts never count as activity and are skipped.
 */
export function bucketWeeks(
  posts: ReadonlyArray<{ createdAt: Date; status: string }>,
  weeks = 12,
  now: Date = new Date()
): WeekBucket[] {
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, index) => {
    const start = subWeeks(currentWeekStart, weeks - 1 - index);
    return {
      key: start.toISOString(),
      label: format(start, "MMM d"),
      published: 0,
      scheduled: 0,
      failed: 0,
    };
  });
  const oldestStart = subWeeks(currentWeekStart, weeks - 1).getTime();
  const weekMs = 7 * 24 * 60 * 60_000;
  for (const post of posts) {
    const time = new Date(post.createdAt).getTime();
    if (Number.isNaN(time) || time < oldestStart) continue;
    const postWeekStart = startOfWeek(new Date(time), {
      weekStartsOn: 1,
    }).getTime();
    const index = Math.min(
      weeks - 1,
      Math.floor((postWeekStart - oldestStart) / weekMs)
    );
    const bucket = buckets[index];
    const kind = bucketActivityStatus(post.status);
    if (bucket && kind && index >= 0) bucket[kind] += 1;
  }
  return buckets;
}

export type TargetStatGroup = {
  platform: string;
  status: string;
  count: number;
};

export type PlatformSummary = {
  platform: string;
  published: number;
  total: number;
  failed: number;
  successRate: number | null;
};

/** Per-platform publish totals with a target-level success rate. */
export function summarizePlatforms(groups: readonly TargetStatGroup[]): {
  platforms: PlatformSummary[];
  overallSuccessRate: number | null;
  totalPublished: number;
  totalFailed: number;
} {
  const byPlatform = new Map<string, { published: number; failed: number; total: number }>();
  for (const group of groups) {
    const entry = byPlatform.get(group.platform) ?? {
      published: 0,
      failed: 0,
      total: 0,
    };
    entry.total += group.count;
    if (group.status === "PUBLISHED") entry.published += group.count;
    if (group.status === "FAILED") entry.failed += group.count;
    byPlatform.set(group.platform, entry);
  }
  const platforms: PlatformSummary[] = [...byPlatform.entries()].map(
    ([platform, entry]) => ({
      platform,
      published: entry.published,
      total: entry.total,
      failed: entry.failed,
      successRate:
        entry.published + entry.failed > 0
          ? Math.round((entry.published / (entry.published + entry.failed)) * 100)
          : null,
    })
  );
  const totalPublished = platforms.reduce((sum, row) => sum + row.published, 0);
  const totalFailed = platforms.reduce((sum, row) => sum + row.failed, 0);
  return {
    platforms,
    overallSuccessRate:
      totalPublished + totalFailed > 0
        ? Math.round((totalPublished / (totalPublished + totalFailed)) * 100)
        : null,
    totalPublished,
    totalFailed,
  };
}

/**
 * Human countdown for an upcoming post. Spoken the way someone would say
 * it out loud ("tomorrow at 09:00"), not as a raw timestamp.
 */
export function formatTimeUntil(target: Date, now: Date = new Date()): string {
  const when = new Date(target);
  const time = when.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const minutes = Math.round((when.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "any moment now";
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

  const dayStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((dayStart(when) - dayStart(now)) / 86_400_000);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7)
    return `${when.toLocaleDateString("en-GB", { weekday: "long" })} at ${time}`;
  if (days < 14) return `in ${days} days`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `in ${weeks} weeks`;
  }
  return `on ${when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })}`;
}

/** Tiny relative-time label for "last published" rows. No new dependency. */
export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(from).getTime()) / 60_000)
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export type Insight = {
  text: string;
  href?: string;
  /** Label for the link, e.g. "Fix it" — phrased for this specific insight. */
  action?: string;
  /** "problem" = something broke; "heads-up" = worth knowing, nothing broken. */
  variant: "problem" | "heads-up";
};

/**
 * Only things that have no block of their own on the page. Failed posts
 * are deliberately absent: they get a dedicated list up top, and saying
 * it twice two rows apart is how a page starts nagging.
 */
export function buildInsights(input: {
  expiredCount: number;
  postsLeft: number | null;
}): Insight[] {
  const insights: Insight[] = [];
  if (input.expiredCount > 0) {
    insights.push({
      text: `${input.expiredCount} ${input.expiredCount === 1 ? "connection" : "connections"} stopped working — reconnect to keep posting.`,
      href: "/accounts",
      action: "Reconnect",
      variant: "problem",
    });
  }
  if (input.postsLeft !== null && input.postsLeft <= 3) {
    insights.push({
      text:
        input.postsLeft <= 0
          ? "You're out of posts for this month — upgrade for more."
          : `Only ${input.postsLeft} ${input.postsLeft === 1 ? "post" : "posts"} left this month.`,
      href: "/billing",
      action: "See plans",
      variant: "heads-up",
    });
  }
  return insights;
}
