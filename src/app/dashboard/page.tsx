import Link from "next/link";
import {
  CalendarIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/onboarding";
import { formatStatusLabel } from "@/lib/utils";
import { getDisplayPostsUsed, getEffectivePlan, getRemainingQuota, getUsage } from "@/lib/entitlements";
import { getPlan } from "@/lib/plans";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import {
  PageContainer,
  PageSections,
} from "@/components/layout/PageContainer";
import { Section, SectionHeader } from "@/components/Section";
import { EmptyBlock } from "@/components/StateBlock";
import { PlanBadge, UpgradeCta } from "@/components/billing/BillingWidgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import { KpiStrip } from "@/app/dashboard/KpiStrip";
import { OutcomeDonut, type OutcomeSegment } from "@/app/dashboard/OutcomeDonut";
import {
  PlatformHealth,
  type PlatformHealthRow,
} from "@/app/dashboard/PlatformHealth";

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
  const plan = getPlan(effective.plan);
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
  const usageHint =
    quota.postsLeft === null
      ? monthlyLimit === null
        ? "No monthly limit on your plan"
        : `${displayPostsUsed} used`
      : `${quota.postsLeft} of ${monthlyLimit} left`;
  const periodLabel = usage.monthStart.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const resetDate = new Date(usage.monthStart);
  resetDate.setMonth(resetDate.getMonth() + 1);
  const resetLabel = resetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  const failed =
    (countsByStatus.FAILED ?? 0) + (countsByStatus.PARTIALLY_PUBLISHED ?? 0);
  const publishing = countsByStatus.PUBLISHING ?? 0;

  const stats = [
    { label: "Posts this month", value: displayPostsUsed, hint: usageHint, accent: false },
    { label: "Published", value: published, hint: "Live on platforms", accent: false },
    { label: "Scheduled", value: scheduled, hint: "Will publish automatically", accent: true },
    { label: "Drafts", value: drafts, hint: "Saved, not scheduled", accent: false },
    {
      label: "Accounts",
      value: accounts.length,
      hint:
        expiredAccounts.length > 0
          ? `${expiredAccounts.length} expired`
          : accounts.length > 0
            ? "All connected"
            : "None connected",
      accent: false,
    },
  ];

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
  const healthRows: PlatformHealthRow[] = [...byPlatform.values()].map(
    (entry) => {
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
        successRate: summary?.successRate ?? null,
        lastPublishedLabel: lastPublished
          ? formatRelativeTime(lastPublished, now)
          : null,
      };
    }
  );
  const insights = buildInsights({
    failedCount: failed,
    expiredCount: expiredAccounts.length,
    postsLeft: quota.postsLeft,
    scheduledCount: scheduled,
  });
  const segments: OutcomeSegment[] = [
    { label: "Published", value: published, className: "text-primary", dotClassName: "bg-primary" },
    { label: "Scheduled", value: scheduled + publishing, className: "text-muted-foreground", dotClassName: "bg-muted-foreground/60" },
    { label: "Drafts", value: drafts, className: "text-muted-foreground/60", dotClassName: "bg-muted-foreground/40" },
    { label: "Failed", value: failed, className: "text-destructive", dotClassName: "bg-destructive" },
  ];

  return (
    <AppShell user={user}>
      <PageContainer>
        <PageHeader
          title={greetingFor(user.name)}
          description="Your publishing activity at a glance."
          className="mb-6"
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
          <PageSections className="gap-8">
            <Section label="Publishing overview">
              <KpiStrip stats={stats} />
            </Section>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card size="sm" className="min-w-0 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                  <CardDescription>
                    Published, scheduled and failed posts per week
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ActivityChart weeks={weeks} />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Outcomes</CardTitle>
                  <CardDescription>Posts by status</CardDescription>
                </CardHeader>
                <CardContent>
                  <OutcomeDonut segments={segments} />
                </CardContent>
              </Card>
            </div>

            {insights.length > 0 && (
              <Section label="Insights">
                <InsightList insights={insights} />
              </Section>
            )}

            <Card size="sm">
              <CardHeader>
                <CardTitle>Usage</CardTitle>
                <CardDescription>
                  {periodLabel}, resets {resetLabel}
                </CardDescription>
                <CardAction>
                  <Link
                    href="/billing"
                    className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    Manage plan
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlanBadge
                        plan={effective.plan}
                        status={effective.status}
                      />
                    </div>
                    <p className="mt-2 text-2xl leading-none font-semibold tracking-tight tabular-nums">
                      {monthlyLimit === null ? (
                        "Unlimited"
                      ) : (
                        <>
                          {displayPostsUsed}
                          <span className="text-base font-normal text-muted-foreground">
                            {" "}
                            of {monthlyLimit} posts
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.name} plan
                    </p>
                  </div>
                  {monthlyLimit !== null && (
                    <Progress
                      value={usagePercent}
                      aria-label={`Posts used this month: ${displayPostsUsed} of ${monthlyLimit}`}
                      className="w-full sm:max-w-xs"
                    />
                  )}
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
              </CardContent>
              <CardFooter className="flex-wrap gap-2 border-t border-border">
                <nav
                  aria-label="Quick actions"
                  className="flex flex-wrap items-center gap-2"
                >
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/posts/new" />}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Create post
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/calendar" />}
                  >
                    <CalendarIcon data-icon="inline-start" />
                    Open calendar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/accounts" />}
                  >
                    <UsersIcon data-icon="inline-start" />
                    Manage accounts
                  </Button>
                </nav>
              </CardFooter>
            </Card>

            {attentionPosts.length > 0 && (
              <Section labelledBy="attention-heading">
                <SectionHeader
                  id="attention-heading"
                  title="Needs attention"
                  description="Publishing failed or is still running"
                  meta={
                    <Badge
                      variant="destructive"
                      aria-label={`${attentionPosts.length} posts need attention`}
                    >
                      {attentionPosts.length}
                    </Badge>
                  }
                />
                <Card size="sm">
                  <CardContent>
                    <ul className="divide-y divide-border">
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
                  </CardContent>
                </Card>
              </Section>
            )}

            {upcomingPosts.length > 0 && (
              <Section labelledBy="up-next-heading">
                <SectionHeader
                  id="up-next-heading"
                  title="Up next"
                  actions={
                    <Link
                      href="/posts?status=SCHEDULED"
                      className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      View all scheduled
                    </Link>
                  }
                />
                <Card size="sm">
                  <CardContent>
                    <ul className="divide-y divide-border">
                      {upcomingPosts.map((post, index) => (
                        <PostRow
                          key={post.id}
                          post={post}
                          index={index}
                          large
                        />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Section>
            )}

            <Section labelledBy="recent-posts-heading">
              <SectionHeader
                id="recent-posts-heading"
                title="Recent posts"
                actions={
                  <Link
                    href="/posts"
                    className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    View all
                  </Link>
                }
              />
              <Card size="sm">
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
                    <ul className="divide-y divide-border border-t border-border">
                      {recentPosts.map((post, index) => (
                        <PostRow key={post.id} post={post} index={index} />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </Section>

            <Section labelledBy="accounts-heading">
              <SectionHeader
                id="accounts-heading"
                title="Platforms and accounts"
                description="Publish totals, success rate and connection state per platform"
                actions={
                  <Link
                    href="/accounts"
                    className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    Manage
                  </Link>
                }
              />
              <Card size="sm">
                <CardContent>
                  <PlatformHealth rows={healthRows} />
                  {expiredAccounts.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        {expiredAccounts.length} connection
                        {expiredAccounts.length === 1 ? "" : "s"} expired.
                        Reconnect to keep publishing.
                      </p>
                      <Button
                        variant="outline"
                        nativeButton={false}
                        render={<Link href="/accounts" />}
                      >
                        Reconnect
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Section>
          </PageSections>
        )}
      </PageContainer>
    </AppShell>
  );
}
