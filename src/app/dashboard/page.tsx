import Link from "next/link";
import {
  CalendarIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/onboarding";
import { formatPlatformName, formatStatusLabel } from "@/lib/utils";
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
import { PlatformIcon } from "@/components/PlatformIcon";
import { PlanBadge, UpgradeCta } from "@/components/billing/BillingWidgets";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { DashboardPostFilter } from "@/app/dashboard/DashboardPostFilter";
import { PostRow } from "@/app/dashboard/PostRow";

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
      select: { platform: true, username: true, expiresAt: true },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    }),
    getEffectivePlan({ userId: user.id, userEmail: user.email }),
    getUsage(user.id),
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

  const stats = [
    { label: "Posts this month", value: displayPostsUsed, hint: usageHint, accent: false },
    { label: "Drafts", value: drafts, hint: "Saved, not scheduled", accent: false },
    { label: "Scheduled", value: scheduled, hint: "Will publish automatically", accent: true },
    { label: "Published", value: published, hint: "Live on platforms", accent: false },
  ];

  return (
    <AppShell user={user}>
      <PageContainer>
        <PageHeader
          title={greetingFor(user.name)}
          description="Your publishing activity at a glance."
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
          <PageSections>
            <Section label="Publishing overview">
              <dl
                aria-label="Publishing overview"
                className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-x-6"
              >
                {stats.map((stat) => (
                  <div key={stat.label} className="min-w-0">
                    <dd
                      className={
                        stat.accent
                          ? "text-3xl leading-none font-semibold tracking-tight text-primary tabular-nums"
                          : "text-3xl leading-none font-semibold tracking-tight tabular-nums"
                      }
                    >
                      {stat.value}
                    </dd>
                    <dt className="mt-1.5 truncate text-[13px] leading-5 text-muted-foreground">
                      {stat.label}
                    </dt>
                    <dd className="mt-0.5 truncate text-xs text-muted-foreground">
                      {stat.hint}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            <div className="grid items-start gap-10 lg:grid-cols-3">
              <Card className="lg:col-span-2">
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
                <CardContent className="flex flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlanBadge
                      plan={effective.plan}
                      status={effective.status}
                    />
                  </div>
                  <p className="mt-3 text-2xl leading-none font-semibold tracking-tight tabular-nums">
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
                  {monthlyLimit !== null && (
                    <Progress
                      value={usagePercent}
                      aria-label={`Posts used this month: ${displayPostsUsed} of ${monthlyLimit}`}
                      className="mt-auto pt-3"
                    />
                  )}
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
              </Card>

              <nav aria-label="Quick actions" className="flex min-w-0 flex-col gap-1">
                <p className="px-1 pb-1 text-[13px] font-medium text-muted-foreground">
                  Quick actions
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/posts/new" />}
                  className="w-full justify-start"
                >
                  <PlusIcon data-icon="inline-start" />
                  Create post
                </Button>
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/calendar" />}
                  className="w-full justify-start"
                >
                  <CalendarIcon data-icon="inline-start" />
                  Open calendar
                </Button>
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/accounts" />}
                  className="w-full justify-start"
                >
                  <UsersIcon data-icon="inline-start" />
                  Manage accounts
                </Button>
              </nav>
            </div>

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
                <Card>
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
                <Card>
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
              <Card>
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
                title="Connected accounts"
                actions={
                  <Link
                    href="/accounts"
                    className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    Manage
                  </Link>
                }
              />
              <Card>
                <CardContent>
                  {accounts.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Connect a profile to start publishing.
                      </p>
                      <Button
                        nativeButton={false}
                        render={<Link href="/accounts" />}
                      >
                        Connect account
                      </Button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {[...byPlatform.values()].map((entry) => (
                        <li
                          key={entry.platform}
                          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <Avatar className="size-9">
                            <AvatarFallback aria-label={formatPlatformName(entry.platform)}>
                              <PlatformIcon
                                platform={entry.platform}
                                className="size-4"
                              />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {formatPlatformName(entry.platform)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {entry.usernames
                                .map((name) => `@${name}`)
                                .join(", ")}
                            </p>
                          </div>
                          {entry.expired ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : (
                            <Badge variant="secondary">
                              {entry.usernames.length === 1
                                ? "Connected"
                                : `${entry.usernames.length} connected`}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
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
