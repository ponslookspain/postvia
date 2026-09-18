import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { requireOnboardedUser } from "@/lib/onboarding";
import { formatStatusLabel } from "@/lib/utils";
import { getDashboard, parseDashboardParams } from "@/lib/dashboard";
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
import { DashboardPostFilter } from "@/app/dashboard/DashboardPostFilter";
import { PostRow } from "@/app/dashboard/PostRow";
import { ActivityChart } from "@/app/dashboard/ActivityChart";
import { InsightList } from "@/app/dashboard/InsightList";
import { NextUp } from "@/app/dashboard/NextUp";
import { OutcomeDonut } from "@/app/dashboard/OutcomeDonut";
import { Channels } from "@/app/dashboard/Channels";

export const dynamic = "force-dynamic";

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
  const filter = parseDashboardParams(await searchParams);
  const now = new Date();
  const vm = await getDashboard({
    userId: user.id,
    userEmail: user.email,
    filter,
    now,
  });

  const { q, status: statusFilter, isFiltered } = vm.filter;
  const {
    attentionPosts,
    recentPosts,
    nextPost,
    channelRows,
    insights,
    weeks,
    segments,
    effective,
    monthlyLimit,
    displayPostsUsed,
    usagePercent,
    resetLabel,
    quota,
    openingLine,
    isOnboarding,
    hasHistoryWorthCharting,
  } = vm;

  return (
    <AppShell user={user}>
      <PageContainer>
        <header className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
            <div className="min-w-0 flex-1 basis-72">
              <h1 className="font-heading text-2xl leading-8 font-semibold tracking-tight text-balance">
                {greetingFor(user.name)}
              </h1>
              <p className="mt-2 max-w-[58ch] text-prose leading-6 text-muted-foreground">
                {openingLine}
              </p>
            </div>
            <Button asChild>
              <Link href="/posts/new">
                <PlusIcon data-icon="inline-start" />
                Create post
              </Link>
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
                <Button asChild>
                  <Link href="/accounts">Connect account</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/posts/new">
                    <PlusIcon data-icon="inline-start" />
                    Create post
                  </Link>
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

            {nextPost && <NextUp post={nextPost} now={vm.now} />}

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
                        <Button variant="outline" asChild>
                          <Link href="/dashboard">Clear filters</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyBlock
                      icon={<PlusIcon />}
                      title="No posts yet"
                      description="Create your first post to get started."
                      actions={
                        <Button asChild>
                          <Link href="/posts/new">
                            <PlusIcon data-icon="inline-start" />
                            Create post
                          </Link>
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
