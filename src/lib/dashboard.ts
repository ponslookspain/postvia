/**
 * Server-side dashboard data layer.
 *
 * Separation (do not blur):
 * - `dashboard.ts` (this file) → dashboard fetch + dashboard view model.
 * - `dashboard-analytics.ts` → pure analytics/formatting utilities (no Prisma).
 * - `entitlements.ts` → billing/usage rules (single source of truth).
 *
 * Server-only by construction: imports Prisma + entitlement reads.
 * Never import this module from a `"use client"` component.
 */

import { prisma } from "@/lib/prisma";
import {
  getDisplayPostsUsed,
  getEffectivePlan,
  getRemainingQuota,
  getUsage,
  type EffectiveSubscription,
} from "@/lib/entitlements";
import {
  bucketWeeks,
  buildInsights,
  formatRelativeTime,
  summarizePlatforms,
  type Insight,
  type WeekBucket,
} from "@/lib/dashboard-analytics";
import type { Prisma } from "@prisma/client";
import type { ChannelRow, OutcomeSegment } from "@/lib/dashboard-types";

export const FILTERABLE_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
];

export const postFeedInclude = {
  targets: { include: { socialAccount: { select: { username: true } } } },
  media: { take: 1 as const, select: { id: true, type: true } },
};

export type DashboardPost = Prisma.PostGetPayload<{
  include: typeof postFeedInclude;
}>;

export type DashboardFilter = {
  q: string;
  status: string;
  isFiltered: boolean;
};

/**
 * URL params normalization. Mirrors the historical page semantics:
 * trim + 100-char cap for `q`, allowlist fallback for `status`.
 */
export function parseDashboardParams(
  params: Record<string, string | string[] | undefined>
): DashboardFilter {
  const rawQ = typeof params.q === "string" ? params.q.trim() : "";
  const rawStatus = typeof params.status === "string" ? params.status : "all";
  const q = rawQ.slice(0, 100);
  const status = FILTERABLE_STATUSES.includes(rawStatus) ? rawStatus : "all";
  return { q, status, isFiltered: q !== "" || status !== "all" };
}

export type DashboardViewModel = {
  filter: DashboardFilter;
  counts: {
    total: number;
    drafts: number;
    scheduled: number;
    published: number;
    failed: number;
    publishing: number;
  };
  recentPosts: DashboardPost[];
  attentionPosts: DashboardPost[];
  nextPost: DashboardPost | null;
  channelRows: ChannelRow[];
  expiredCount: number;
  isOnboarding: boolean;
  quota: { postsLeft: number | null; scheduledPosts: number; totalAccounts: number };
  effective: EffectiveSubscription;
  monthlyLimit: number | null;
  displayPostsUsed: number;
  usagePercent: number;
  resetLabel: string;
  openingLine: string;
  hasHistoryWorthCharting: boolean;
  weeks: WeekBucket[];
  segments: OutcomeSegment[];
  insights: Insight[];
  now: Date;
};

type DashboardRows = {
  statusGroups: { status: string; _count: { _all: number } }[];
  recentPosts: DashboardPost[];
  attentionPosts: DashboardPost[];
  upcomingPosts: DashboardPost[];
  accounts: { id: string; platform: string; username: string; expiresAt: Date | null }[];
  effective: EffectiveSubscription;
  usage: {
    monthStart: Date;
    scheduledPosts: number;
    totalAccounts: number;
  } & Parameters<typeof getRemainingQuota>[1];
  targetStats: { platform: string; status: string; _count: { _all: number } }[];
  recentActivity: { createdAt: Date; status: string }[];
  accountPulse: {
    socialAccountId: string | null;
    _count: { _all: number };
    _max: { publishedAt: Date | null };
  }[];
};

/** Pure opening-line builder, extracted verbatim from the page. */
export function buildOpeningLine(input: {
  published: number;
  scheduled: number;
  drafts: number;
}): string {
  const { published, scheduled, drafts } = input;
  if (published > 0 && scheduled > 0) {
    return `${published} ${published === 1 ? "post" : "posts"} published this month, ${scheduled} still lined up.`;
  }
  if (published > 0) {
    return `${published} ${published === 1 ? "post" : "posts"} published this month. Nothing scheduled right now.`;
  }
  if (scheduled > 0) {
    return `Nothing has gone out this month yet — ${scheduled} ${scheduled === 1 ? "post is" : "posts are"} lined up.`;
  }
  if (drafts > 0) {
    return `${drafts} ${drafts === 1 ? "draft is" : "drafts are"} waiting — pick one up whenever you're ready.`;
  }
  return "Nothing scheduled yet. Write your first post whenever you like.";
}

/**
 * Pure view-model assembly. No Prisma, no I/O — everything derives from
 * already-fetched rows plus entitlement/usage snapshots.
 */
export function buildDashboardViewModel(
  rows: DashboardRows,
  filter: DashboardFilter,
  now: Date
): DashboardViewModel {
  const {
    statusGroups,
    recentPosts,
    attentionPosts,
    upcomingPosts,
    accounts,
    effective,
    usage,
    targetStats,
    recentActivity,
    accountPulse,
  } = rows;

  const countsByStatus = Object.fromEntries(
    statusGroups.map((group) => [group.status, group._count._all])
  ) as Partial<Record<string, number>>;
  const totalPosts = statusGroups.reduce(
    (sum, group) => sum + group._count._all,
    0
  );
  const drafts = countsByStatus.DRAFT ?? 0;
  const scheduled = countsByStatus.SCHEDULED ?? 0;
  const published = countsByStatus.PUBLISHED ?? 0;
  const failed =
    (countsByStatus.FAILED ?? 0) + (countsByStatus.PARTIALLY_PUBLISHED ?? 0);
  const publishing = countsByStatus.PUBLISHING ?? 0;

  const expiredAccounts = accounts.filter(
    (account) =>
      account.expiresAt &&
      new Date(account.expiresAt).getTime() <= now.getTime()
  );

  const byPlatform = new Map<
    string,
    { platform: string; usernames: string[]; expired: boolean }
  >();
  for (const account of accounts) {
    const entry = byPlatform.get(account.platform) ?? {
      platform: account.platform,
      usernames: [],
      expired: false,
    };
    entry.usernames.push(account.username);
    if (
      account.expiresAt &&
      new Date(account.expiresAt).getTime() <= now.getTime()
    ) {
      entry.expired = true;
    }
    byPlatform.set(account.platform, entry);
  }

  const isOnboarding = totalPosts === 0 && accounts.length === 0;
  const quota = getRemainingQuota(effective, usage);
  const monthlyLimit = effective.entitlements.monthlyPosts;
  // Free progress reflects the shared identity-level allowance
  // (AbuseFreeUsage), not just this user's own posts. Paid plans keep the
  // per-user counter. Server-side enforcement stays authoritative.
  const displayPostsUsed = getDisplayPostsUsed(effective, usage);
  const usagePercent =
    monthlyLimit === null
      ? 0
      : Math.min(
          100,
          Math.round((displayPostsUsed / Math.max(1, monthlyLimit)) * 100)
        );
  const resetDate = new Date(usage.monthStart);
  resetDate.setMonth(resetDate.getMonth() + 1);
  const resetLabel = resetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  // The page opens the way a person would: the month's rhythm in one
  // sentence. It deliberately never names the next post's time — the
  // block below owns that, and saying it twice is what made the old
  // dashboard read like a machine reciting its own state.
  const nextPost = upcomingPosts[0] ?? null;
  const openingLine = buildOpeningLine({ published, scheduled, drafts });

  // Twelve near-empty bars and a one-segment donut are ceremony, not
  // insight: the charts only earn their place once there is history.
  const hasHistoryWorthCharting = totalPosts >= 3;
  const weeks = bucketWeeks(recentActivity, 12, now);
  const platformSummary = summarizePlatforms(
    targetStats.map((group) => ({
      platform: group.platform,
      status: group.status,
      count: group._count._all,
    }))
  );
  const platformSuccess = new Map(
    platformSummary.platforms.map((row) => [row.platform, row])
  );
  const pulseByAccount = new Map(
    accountPulse.map((row) => [row.socialAccountId, row])
  );
  const channelRows: ChannelRow[] = [...byPlatform.values()].map((entry) => {
    const summary = platformSuccess.get(entry.platform);
    let lastPublished: Date | null = null;
    for (const account of accounts) {
      if (account.platform !== entry.platform) continue;
      const pulse = pulseByAccount.get(account.id);
      const at = pulse?._max.publishedAt ?? null;
      if (at && (!lastPublished || at > lastPublished)) lastPublished = at;
    }
    return {
      platform: entry.platform,
      usernames: entry.usernames,
      expired: entry.expired,
      published: summary?.published ?? 0,
      lastPublishedLabel: lastPublished
        ? formatRelativeTime(lastPublished, now)
        : null,
    };
  });
  const insights = buildInsights({
    expiredCount: expiredAccounts.length,
    postsLeft: quota.postsLeft,
  });
  const segments: OutcomeSegment[] = [
    { label: "Published", value: published, className: "text-primary", dotClassName: "bg-primary" },
    { label: "Scheduled", value: scheduled + publishing, className: "text-muted-foreground", dotClassName: "bg-muted-foreground/60" },
    { label: "Drafts", value: drafts, className: "text-muted-foreground/60", dotClassName: "bg-muted-foreground/40" },
    { label: "Failed", value: failed, className: "text-error", dotClassName: "bg-error" },
  ];

  return {
    filter,
    counts: {
      total: totalPosts,
      drafts,
      scheduled,
      published,
      failed,
      publishing,
    },
    recentPosts,
    attentionPosts,
    nextPost,
    channelRows,
    expiredCount: expiredAccounts.length,
    isOnboarding,
    quota,
    effective,
    monthlyLimit,
    displayPostsUsed,
    usagePercent,
    resetLabel,
    openingLine,
    hasHistoryWorthCharting,
    weeks,
    segments,
    insights,
    now,
  };
}

/**
 * Dashboard-level orchestration. Single flat `Promise.all` for all
 * independent reads — never sequentialize these without a correctness
 * reason. Query shapes mirror the historical page verbatim.
 */
export async function getDashboard(input: {
  userId: string;
  userEmail?: string | null;
  filter: DashboardFilter;
  now?: Date;
}): Promise<DashboardViewModel> {
  const now = input.now ?? new Date();
  // Activity window for the charts: bounded reads only, volumes capped
  // by plan maxima, so server-side bucketing stays cheap.
  const twelveWeeksAgo = new Date(now.getTime());
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 7 * 12);

  const { q, status } = input.filter;

  // One groupBy replaces the per-status count queries; total is the sum of
  // the same groups. All independent reads run in parallel.
  const [
    statusGroups,
    recentPosts,
    attentionPosts,
    upcomingPosts,
    accounts,
    effective,
    usage,
    targetStats,
    recentActivity,
    accountPulse,
  ] = await Promise.all([
    prisma.post.groupBy({
      by: ["status"],
      where: { userId: input.userId },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: {
        userId: input.userId,
        ...(status !== "all" ? { status: status as never } : {}),
        ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: postFeedInclude,
    }),
    prisma.post.findMany({
      where: {
        userId: input.userId,
        status: { in: ["FAILED", "PARTIALLY_PUBLISHED", "PUBLISHING"] },
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: postFeedInclude,
    }),
    prisma.post.findMany({
      where: { userId: input.userId, status: "SCHEDULED" },
      take: 3,
      orderBy: { scheduledAt: "asc" },
      include: postFeedInclude,
    }),
    prisma.socialAccount.findMany({
      where: { userId: input.userId },
      select: { id: true, platform: true, username: true, expiresAt: true },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    }),
    getEffectivePlan({ userId: input.userId, userEmail: input.userEmail }),
    getUsage(input.userId),
    prisma.postTarget.groupBy({
      by: ["platform", "status"],
      where: { post: { userId: input.userId } },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: { userId: input.userId, createdAt: { gte: twelveWeeksAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.postTarget.groupBy({
      by: ["socialAccountId"],
      where: { post: { userId: input.userId }, socialAccountId: { not: null } },
      _count: { _all: true },
      _max: { publishedAt: true },
    }),
  ]);

  return buildDashboardViewModel(
    {
      statusGroups,
      recentPosts,
      attentionPosts,
      upcomingPosts,
      accounts,
      effective,
      usage,
      targetStats,
      recentActivity,
      accountPulse,
    },
    input.filter,
    now
  );
}
