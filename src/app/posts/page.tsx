import Link from "next/link";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatPlatformName } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
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

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
];

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const rawStatus = typeof params.status === "string" ? params.status : "all";
  const statusFilter = STATUS_FILTERS.includes(rawStatus) ? rawStatus : "all";
  const posts = await prisma.post.findMany({
    where: {
      userId: user.id,
      ...(statusFilter !== "all" ? { status: statusFilter as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { targets: true, media: true },
  });

  return (
    <AppShell user={user}>
      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <PageHeader
          title="Posts"
          description="Every draft, scheduled run and publication"
          actions={
            <Button nativeButton={false} render={<Link href="/posts/new" />}>
              <PlusIcon data-icon="inline-start" />
              Create post
            </Button>
          }
        />

        <nav
          aria-label="Filter posts by status"
          className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          <Link
            href="/posts"
            aria-current={statusFilter === "all" ? "page" : undefined}
            className={
              statusFilter === "all"
                ? "text-sm font-medium text-foreground"
                : "rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            }
          >
            All
          </Link>
          {STATUS_FILTERS.map((option) => (
            <Link
              key={option}
              href={`/posts?status=${option}`}
              aria-current={statusFilter === option ? "page" : undefined}
              className={
                statusFilter === option
                  ? "text-sm font-medium text-foreground"
                  : "rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              }
            >
              {statusLabel(option)}
            </Link>
          ))}
        </nav>

        {posts.length === 0 ? (
          statusFilter !== "all" ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>
                  No {statusLabel(statusFilter).toLowerCase()} posts
                </EmptyTitle>
                <EmptyDescription>
                  Nothing here yet.{" "}
                  <Link href="/posts" className="underline hover:text-foreground">
                    View all posts
                  </Link>
                  .
                </EmptyDescription>
              </EmptyHeader>
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
          <div className="rounded-lg border border-border divide-y divide-border">
            {posts.map((post) => {
              const target = post.targets[0];
              const preview = post.media[0];
              return (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50 md:p-5"
                >
                  {preview && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {preview.type === "IMAGE" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/media/${preview.id}`}
                          alt=""
                          className="size-10 rounded-md object-cover"
                        />
                      ) : (
                        <Badge variant="secondary">Video</Badge>
                      )}
                      {post.media.length > 1 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          +{post.media.length - 1}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 truncate text-sm">{post.text}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatPlatformName(target?.platform ?? "X")}</span>
                      <span aria-hidden="true">·</span>
                      <StatusBadge status={post.status} />
                      <span aria-hidden="true">·</span>
                      {post.status === "PUBLISHED" && post.publishedAt ? (
                        <span>
                          Published{" "}
                          {new Date(post.publishedAt).toLocaleDateString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </span>
                      ) : post.status === "SCHEDULED" && post.scheduledAt ? (
                        <span>
                          Scheduled{" "}
                          {new Date(post.scheduledAt).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : (
                        <span>
                          {post.createdAt.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {post.status === "FAILED" ? "Retry" : "View"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
