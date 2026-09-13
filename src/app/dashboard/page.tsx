import Link from "next/link";
import {
  CalendarClockIcon,
  CalendarIcon,
  CircleCheckIcon,
  FileTextIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
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

/**
 * Overview stat tile. Ringless wash slab — deliberately quieter than the
 * bordered activity cards below, so the big tabular numerals carry the
 * section. Signal indigo appears only on the Scheduled value.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Card size="sm" className="bg-muted/40">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-3xl leading-none font-semibold tracking-tight tabular-nums",
              accent && "text-signal"
            )}
          >
            {value}
          </p>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {hint}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-foreground/10"
        >
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
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

  return (
    <AppShell user={user}>
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="What is queued, what needs you, and what went out"
          actions={
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/posts/new" />}
              className="min-h-11"
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
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/accounts" />}
                >
                  Connect account
                </Button>
                <Button
                  size="sm"
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  icon={LayersIcon}
                  label="Posts this month"
                  value={displayPostsUsed}
                  hint={usageHint}
                />
                <StatTile
                  icon={PencilIcon}
                  label="Drafts"
                  value={drafts}
                  hint="Saved, not scheduled"
                />
                <StatTile
                  icon={CalendarClockIcon}
                  label="Scheduled"
                  value={scheduled}
                  hint="Will publish automatically"
                  accent
                />
                <StatTile
                  icon={CircleCheckIcon}
                  label="Published"
                  value={published}
                  hint="Live on platforms"
                />
              </div>
            </Section>

            <div className="grid items-stretch gap-3 lg:grid-cols-3">
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

              <Card>
                <CardHeader>
                  <CardTitle>Quick actions</CardTitle>
                  <CardDescription>Jump to the next step</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2">
                  <Button
                    nativeButton={false}
                    render={<Link href="/posts/new" />}
                    className="min-h-12 flex-1 w-full justify-start"
                  >
                    <PlusIcon data-icon="inline-start" />
                    Create post
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/calendar" />}
                    className="min-h-12 flex-1 w-full justify-start"
                  >
                    <CalendarIcon data-icon="inline-start" />
                    Open calendar
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/accounts" />}
                    className="min-h-12 flex-1 w-full justify-start"
                  >
                    <UsersIcon data-icon="inline-start" />
                    Manage accounts
                  </Button>
                </CardContent>
              </Card>
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
                        icon={<FileTextIcon />}
                        title="No matching posts"
                        description={
                          q
                            ? `Nothing matches “${q}”${statusFilter !== "all" ? ` with status ${formatStatusLabel(statusFilter).toLowerCase()}` : ""}.`
                            : `No ${formatStatusLabel(statusFilter).toLowerCase()} posts yet.`
                        }
                        actions={
                          <Button
                            size="sm"
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
                        icon={<FileTextIcon />}
                        title="No posts yet"
                        description="Create your first post to get started."
                        actions={
                          <Button
                            size="sm"
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
                        size="sm"
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
                        size="sm"
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
