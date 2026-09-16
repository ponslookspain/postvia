import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/onboarding";
import { formatStatusLabel } from "@/lib/utils";
import { getDisplayPostsUsed, getEffectivePlan, getRemainingQuota, getUsage } from "@/lib/entitlements";
import { AppShell } from "@/components/AppShell";
import {
  PageContainer,
  PageSections,
} from "@/components/layout/PageContainer";
import { Section } from "@/components/Section";
import { EmptyBlock } from "@/components/StateBlock";
import { PlanBadge, UpgradeCta } from "@/components/billing/BillingWidgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  bucketWeeks,
  buildInsights,
  formatRelativeTime,
  summarizePlatforms,
} from "@/lib/dashboard-analytics";
import { DashboardPostFilter } from "@/app/dashboard/DashboardPostFilter";
import { PostRow } from "@/app/dashboard/PostRow";
import { ActivityChart } from "@/app/dashboard/ActivityChart";
import { InsightList } from "@/app/dashboard/InsightList";
import { NextUp } from "@/app/dashboard/NextUp";
import { OutcomeDonut, type OutcomeSegment } from "@/app/dashboard/OutcomeDonut";
import { Channels, type ChannelRow } from "@/app/dashboard/Channels";

export const dynamic = "force-dynamic";

const FILTERABLE_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
];

const postFeedInclude = {
  targets: { include: { socialAccount: { select: { username: true } } } },
  media: { take: 1 as const, select: { id: true, type: true } },
};

/** Daypart greeting from server time. Single primary CTA lives in the header. */
function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const daypart = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  return firstName ? `${daypart}, ${firstName}` : daypart;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const rawQ = typeof params.q === "string" ? params.q.trim() : "";
  const rawStatus = typeof params.status === "string" ? params.status : "all";
  const q = rawQ.slice(0, 100);
  const statusFilter = FILTERABLE_STATUSES.includes(rawStatus)
    ? rawStatus
    : "all";

  // Activity window for the charts: bounded reads only, volumes capped
  // by plan maxima, so server-side bucketing stays cheap.
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 7 * 12);

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
      where: { userId: user.id },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: {
        userId: user.id,
        ...(statusFilter !== "all" ? { status: statusFilter as never } : {}),
        ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: postFeedInclude,
    }),
    prisma.post.findMany({
      where: {
        userId: user.id,
        status: { in: ["FAILED", "PARTIALLY_PUBLISHED", "PUBLISHING"] },
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: postFeedInclude,
    }),
    prisma.post.findMany({
      where: { userId: user.id, status: "SCHEDULED" },
      take: 3,
      orderBy: { scheduledAt: "asc" },
      include: postFeedInclude,
    }),
    prisma.socialAccount.findMany({
      where: { userId: user.id },
      select: { id: true, platform: true, username: true, expiresAt: true },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    }),
    getEffectivePlan({ userId: user.id, userEmail: user.email }),
    getUsage(user.id),
    prisma.postTarget.groupBy({
      by: ["platform", "status"],
      where: { post: { userId: user.id } },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: { userId: user.id, createdAt: { gte: twelveWeeksAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.postTarget.groupBy({
      by: ["socialAccountId"],
      where: { post: { userId: user.id }, socialAccountId: { not: null } },
      _count: { _all: true },
      _max: { publishedAt: true },
    }),
  ]);

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

  const now = new Date();
  const expiredAccounts = accounts.filter(
    (account) =>
      account.expiresAt && new Date(account.expiresAt).getTime() <= now.getTime()
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
  const isFiltered = q !== "" || statusFilter !== "all";
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

  const failed =
    (countsByStatus.FAILED ?? 0) + (countsByStatus.PARTIALLY_PUBLISHED ?? 0);
  const publishing = countsByStatus.PUBLISHING ?? 0;

  // The page opens the way a person would: the month's rhythm in one
  // sentence. It deliberately never names the next post's time — the
  // block below owns that, and saying it twice is what made the old
  // dashboard read like a machine reciting its own state.
  const nextPost = upcomingPosts[0] ?? null;
  const openingLine =
    published > 0 && scheduled > 0
      ? `${published} ${published === 1 ? "post" : "posts"} published this month, ${scheduled} still lined up.`
      : published > 0
        ? `${published} ${published === 1 ? "post" : "posts"} published this month. Nothing scheduled right now.`
        : scheduled > 0
          ? `Nothing has gone out this month yet — ${scheduled} ${scheduled === 1 ? "post is" : "posts are"} lined up.`
          : drafts > 0
            ? `${drafts} ${drafts === 1 ? "draft is" : "drafts are"} waiting — pick one up whenever you're ready.`
            : "Nothing scheduled yet. Write your first post whenever you like.";

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
    { label: "Failed", value: failed, className: "text-error-text", dotClassName: "bg-error" },
  ];

  return (
    <AppShell user={user}>
      <PageContainer>
        <header className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
            <div className="min-w-0 flex-1 basis-72">
              <h1 className="font-heading text-2xl leading-8 font-semibold tracking-tight text-balance">
                {greetingFor(user.name)}
              </h1>
              <p className="mt-2 max-w-[58ch] text-[15px] leading-6 text-muted-foreground">
                {openingLine}
              </p>
            </div>
            <Button nativeButton={false} render={<Link href="/posts/new" />}>
              <PlusIcon data-icon="inline-start" />
              Create post
            </Button>
          </div>
        </header>

        {isOnboarding ? (
          <EmptyBlock
            icon={<UsersIcon />}
            title="Start publishing in two steps"
            description="Connect a social profile first, then create your first post."
            actions={
              <>
                <Button
                  nativeButton={false}
                  render={<Link href="/accounts" />}
                >
                  Connect account
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/posts/new" />}
                >
                  <PlusIcon data-icon="inline-start" />
                  Create post
                </Button>
              </>
            }
          />
        ) : (
          <PageSections>
            {attentionPosts.length > 0 && (
              <Section labelledBy="attention-heading">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle id="attention-heading">Needs a look</CardTitle>
                    <CardDescription>
                      These didn&apos;t go out, or are still publishing
                    </CardDescription>
                    <CardAction>
                      <Badge
                        color="error"
                        variant="soft"
                        aria-label={`${attentionPosts.length} posts need a look`}
                      >
                        {attentionPosts.length}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="border-t border-border pt-2">
                      <ul className="flex flex-col">
                        {attentionPosts.map((post, index) => (
                          <PostRow
                            key={post.id}
                            post={post}
                            index={index}
                            error={
                              post.errorMessage ??
                              post.targets.find((t) => t.errorMessage)
                                ?.errorMessage
                            }
                          />
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </Section>
            )}

            {insights.length > 0 && <InsightList insights={insights} />}

            {nextPost && <NextUp post={nextPost} now={now} />}

            <Section labelledBy="recent-posts-heading">
            <Card size="sm">
              <CardHeader>
                <CardTitle id="recent-posts-heading">Recent posts</CardTitle>
                <CardAction>
                  <Link
                    href="/posts"
                    className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    View all
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <DashboardPostFilter q={q} status={statusFilter} />
                {recentPosts.length === 0 ? (
                  isFiltered ? (
                    <EmptyBlock
                      icon={<PlusIcon />}
                      title="No matching posts"
                      description={
                        q
                          ? `Nothing matches “${q}”${statusFilter !== "all" ? ` with status ${formatStatusLabel(statusFilter).toLowerCase()}` : ""}.`
                          : `No ${formatStatusLabel(statusFilter).toLowerCase()} posts yet.`
                      }
                      actions={
                        <Button
                          variant="outline"
                          nativeButton={false}
                          render={<Link href="/dashboard" />}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyBlock
                      icon={<PlusIcon />}
                      title="No posts yet"
                      description="Create your first post to get started."
                      actions={
                        <Button
                          nativeButton={false}
                          render={<Link href="/posts/new" />}
                        >
                          <PlusIcon data-icon="inline-start" />
                          Create post
                        </Button>
                      }
                    />
                  )
                ) : (
                  <div className="mt-4 border-t border-border pt-2">
                    <ul className="flex flex-col">
                      {recentPosts.map((post, index) => (
                        <PostRow key={post.id} post={post} index={index} />
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
            </Section>

            <Section labelledBy="channels-heading">
              <Card size="sm">
                <CardHeader>
                  <CardTitle id="channels-heading">Your channels</CardTitle>
                  <CardDescription>Where your posts go</CardDescription>
                  <CardAction>
                    <Link
                      href="/accounts"
                      className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      Manage
                    </Link>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <Channels rows={channelRows} />
                </CardContent>
              </Card>
            </Section>

            <Section label="Plan and usage">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl bg-panel px-4 py-3.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <PlanBadge plan={effective.plan} status={effective.status} />
                  <p className="text-sm leading-5">
                    {monthlyLimit === null ? (
                      "Unlimited posts"
                    ) : (
                      <>
                        <span className="font-medium tabular-nums">
                          {displayPostsUsed}
                        </span>{" "}
                        of {monthlyLimit} posts this month
                      </>
                    )}
                    <span className="text-muted-foreground">
                      {" · resets "}
                      {resetLabel}
                    </span>
                  </p>
                </div>
                <div className="flex flex-1 items-center justify-end gap-4">
                  {monthlyLimit !== null && (
                    <Progress
                      value={usagePercent}
                      aria-label={`Posts used this month: ${displayPostsUsed} of ${monthlyLimit}`}
                      className="w-full max-w-40"
                    />
                  )}
                  <Link
                    href="/billing"
                    className="shrink-0 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    Manage plan
                  </Link>
                </div>
              </div>
              {effective.plan === "free" &&
                monthlyLimit !== null &&
                quota.postsLeft === 0 && (
                  <div className="mt-3">
                    <UpgradeCta
                      reason={`You've reached your ${monthlyLimit} free posts this month.`}
                      upgradeTo="growth"
                      compact
                    />
                  </div>
                )}
            </Section>

            {hasHistoryWorthCharting && (
              <Section labelledBy="trend-heading">
                <h2
                  id="trend-heading"
                  className="mb-4 text-lg leading-7 font-medium tracking-tight"
                >
                  How it&apos;s going
                </h2>
                <div className="grid items-stretch gap-4 lg:grid-cols-3">
                  <Card size="sm" className="min-w-0 lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Last 12 weeks</CardTitle>
                      <CardDescription>
                        What you sent, week by week
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col justify-center">
                      <ActivityChart weeks={weeks} />
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Where they stand</CardTitle>
                      <CardDescription>All posts, by status</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <OutcomeDonut segments={segments} />
                    </CardContent>
                  </Card>
                </div>
              </Section>
            )}
          </PageSections>
        )}
      </PageContainer>
    </AppShell>
  );
}
