import Link from "next/link";
import {
  ChevronRightIcon,
  ClapperboardIcon,
  FileTextIcon,
  PlusIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatPostDate, formatStatusLabel } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/posts/bulk" />}
              >
                <ClapperboardIcon data-icon="inline-start" />
                Bulk video
              </Button>
              <Button nativeButton={false} render={<Link href="/posts/new" />}>
                <PlusIcon data-icon="inline-start" />
                Create post
              </Button>
            </div>
          }
        />

        <nav
          aria-label="Filter posts by status"
          className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2"
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
              {formatStatusLabel(option)}
            </Link>
          ))}
        </nav>

        {posts.length === 0 ? (
          statusFilter !== "all" ? (
            <Empty className="mt-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>
                  No {formatStatusLabel(statusFilter).toLowerCase()} posts
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
            <Empty className="mt-6">
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
            {posts.map((post, index) => {
              const preview = post.media[0];
              return (
                <li
                  key={post.id}
                  className="animate-[post-in_.45s_ease_both] motion-reduce:animate-none"
                  style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
                >
                  <Link
                    href={`/posts/${post.id}`}
                    className="group flex items-start gap-4 py-5 outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:gap-5"
                  >
                    {preview ? (
                      <span className="relative block size-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-24">
                        {preview.type === "IMAGE" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/media/${preview.id}`}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-300 motion-reduce:transition-none motion-reduce:transform-none group-hover:scale-[1.04]"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center">
                            <ClapperboardIcon
                              className="size-6 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                        {post.media.length > 1 && (
                          <span className="absolute right-1 bottom-1 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground tabular-nums">
                            +{post.media.length - 1}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="mt-1 hidden size-2 shrink-0 rounded-full bg-border sm:block"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug break-words text-foreground line-clamp-2">
                        {post.text}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {post.targets.map((target) => (
                            <span
                              key={target.id}
                              title={target.platform}
                              className="flex size-4 items-center justify-center [&_svg]:size-4"
                            >
                              <PlatformIcon platform={target.platform} className="size-4" />
                              <span className="sr-only">{target.platform}</span>
                            </span>
                          ))}
                        </span>
                        <StatusBadge status={post.status} />
                        <span>{formatPostDate(post)}</span>
                      </span>
                    </span>
                    <span
                      className={`flex shrink-0 items-center gap-1 pt-0.5 text-sm transition-colors ${
                        post.status === "FAILED"
                          ? "font-medium text-destructive"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {post.status === "FAILED" ? "Retry" : "View"}
                      <ChevronRightIcon
                        className="size-4 transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
