import Link from "next/link";
import { FileTextIcon, PlusIcon, UsersIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatPlatformName, formatStatusLabel } from "@/lib/utils";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
    platformGroups,
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
    prisma.postTarget.groupBy({
      by: ["platform"],
      where: { post: { userId: user.id } },
      _count: { _all: true },
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
  const publishing = countsByStatus.PUBLISHING ?? 0;
  const failed = countsByStatus.FAILED ?? 0;

  const now = new Date();
  const expiredAccounts = accounts.filter(
    (account) =>
      account.expiresAt && new Date(account.expiresAt).getTime() <= now.getTime()
  );

  const platformCounts = platformGroups
    .map((group) => ({
      platform: group.platform,
      count: group._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const stats = [
    { label: "Posts", value: totalPosts },
    { label: "Drafts", value: drafts },
    { label: "Scheduled", value: scheduled },
    { label: "Published", value: published },
  ];

  const isOnboarding = totalPosts === 0 && accounts.length === 0;
  const isFiltered = q !== "" || statusFilter !== "all";

  return (
    <AppShell user={user}>
      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <PageHeader
          title="Dashboard"
          description="An overview of your publishing activity"
          actions={
            <Button nativeButton={false} render={<Link href="/posts/new" />}>
              <PlusIcon data-icon="inline-start" />
              Create post
            </Button>
          }
        />

        {isOnboarding ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>Start publishing in two steps</EmptyTitle>
              <EmptyDescription>
                Connect a social profile first, then create your first post.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-col gap-2 sm:flex-row">
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
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-10">
            {attentionPosts.length > 0 && (
              <section aria-labelledby="attention-heading">
                <div className="mb-2 flex items-center gap-2.5">
                  <h2 id="attention-heading" className="text-lg font-medium">
                    Needs attention
                  </h2>
                  <Badge variant="destructive" aria-label={`${attentionPosts.length} posts need attention`}>
                    {attentionPosts.length}
                  </Badge>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {attentionPosts.map((post, index) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      index={index}
                      error={
                        post.errorMessage ??
                        post.targets.find((t) => t.errorMessage)?.errorMessage
                      }
                    />
                  ))}
                </ul>
              </section>
            )}

            {upcomingPosts.length > 0 && (
              <section aria-labelledby="up-next-heading">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <h2 id="up-next-heading" className="text-lg font-medium">
                    Up next
                  </h2>
                  <Link
                    href="/posts?status=SCHEDULED"
                    className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    View all scheduled
                  </Link>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {upcomingPosts.map((post, index) => (
                    <PostRow key={post.id} post={post} index={index} large />
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="recent-posts-heading">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 id="recent-posts-heading" className="text-lg font-medium">
                  Recent posts
                </h2>
                <Link
                  href="/posts"
                  className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  View all
                </Link>
              </div>
              <DashboardPostFilter q={q} status={statusFilter} />

              {recentPosts.length === 0 ? (
                isFiltered ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileTextIcon />
                      </EmptyMedia>
                      <EmptyTitle>No matching posts</EmptyTitle>
                      <EmptyDescription>
                        {q
                          ? `Nothing matches “${q}”${statusFilter !== "all" ? ` with status ${formatStatusLabel(statusFilter).toLowerCase()}` : ""}.`
                          : `No ${formatStatusLabel(statusFilter).toLowerCase()} posts yet.`}
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={<Link href="/dashboard" />}
                      >
                        Clear filters
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileTextIcon />
                      </EmptyMedia>
                      <EmptyTitle>No posts yet</EmptyTitle>
                      <EmptyDescription>
                        Create your first post to get started.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        size="sm"
                        nativeButton={false}
                        render={<Link href="/posts/new" />}
                      >
                        <PlusIcon data-icon="inline-start" />
                        Create post
                      </Button>
                    </EmptyContent>
                  </Empty>
                )
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {recentPosts.map((post, index) => (
                    <PostRow key={post.id} post={post} index={index} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="accounts-heading">
              <div className="mb-2 flex items-center justify-between gap-4">
                <h2 id="accounts-heading" className="text-lg font-medium">
                  Accounts
                </h2>
                <Link
                  href="/accounts"
                  className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Manage
                </Link>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {accounts.length === 0
                      ? "No accounts connected"
                      : `${accounts.length} connected`}
                    {expiredAccounts.length > 0 && (
                      <Badge variant="destructive">
                        {expiredAccounts.length} expired
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {accounts.length === 0
                      ? "Connect a profile to start publishing"
                      : accounts.map((a) => `@${a.username}`).join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/accounts" />}
                  className="shrink-0"
                >
                  {expiredAccounts.length > 0
                    ? "Reconnect"
                    : accounts.length === 0
                      ? "Connect account"
                      : "Manage"}
                </Button>
              </div>
            </section>

            <section
              aria-label="Publishing stats"
              className="border-t border-border pt-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                {stats.map((stat) => (
                  <p key={stat.label} className="text-sm">
                    <span className="font-semibold tabular-nums">
                      {stat.value}
                    </span>{" "}
                    <span className="text-muted-foreground">{stat.label.toLowerCase()}</span>
                  </p>
                ))}
                {(publishing > 0 || failed > 0) && (
                  <span className="flex flex-wrap gap-2">
                    {publishing > 0 && (
                      <Badge variant="secondary">
                        Publishing · {publishing}
                      </Badge>
                    )}
                    {failed > 0 && (
                      <Badge variant="destructive">Failed · {failed}</Badge>
                    )}
                  </span>
                )}
                {platformCounts.length > 1 && (
                  <span className="flex flex-wrap gap-2">
                    {platformCounts.map((entry) => (
                      <Badge key={entry.platform} variant="outline">
                        {formatPlatformName(entry.platform)} · {entry.count}
                      </Badge>
                    ))}
                  </span>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
