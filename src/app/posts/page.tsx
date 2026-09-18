import Link from "next/link";
import { ClapperboardIcon, PlusIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { PostsList, type PostListItem } from "./PostsList";
import { StatusTabs } from "./StatusTabs";
import { POST_PAGE_DEFAULT } from "@/lib/pagination";

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
  const where = {
    userId: user.id,
    ...(statusFilter !== "all" ? { status: statusFilter as never } : {}),
  };
  // Bounded first page (B6): newest-first with a limit+1 probe for the
  // next cursor, plus a cheap count for the "showing N of M" line.
  // Only the thumbnail media row loads per post; the overflow badge uses
  // the media count, not full rows.
  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: POST_PAGE_DEFAULT + 1,
      include: {
        targets: true,
        media: { take: 1, select: { id: true, type: true } },
        _count: { select: { media: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);
  const posts = rows.slice(0, POST_PAGE_DEFAULT);
  const nextCursor =
    rows.length > POST_PAGE_DEFAULT ? (posts[posts.length - 1]?.id ?? null) : null;

  // Dates cannot cross the server boundary: strip rows to plain JSON.
  const items: PostListItem[] = posts.map((post) => ({
    id: post.id,
    text: post.text,
    status: post.status,
    createdAt: post.createdAt.toISOString(),
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    targets: post.targets.map((target) => ({
      id: target.id,
      platform: target.platform,
    })),
    media: post.media.map((item) => ({ id: item.id, type: item.type })),
    mediaCount: post._count.media,
  }));

  return (
    <AppShell user={user}>
      <PageContainer>
        <PageHeader
          title="Posts"
          description="Manage your content, scheduled posts and publishing activity"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/posts/bulk">
                  <ClapperboardIcon data-icon="inline-start" />
                  Bulk video
                </Link>
              </Button>
              <Button asChild>
                <Link href="/posts/new">
                  <PlusIcon data-icon="inline-start" />
                  Create post
                </Link>
              </Button>
            </div>
          }
        />

        <StatusTabs value={statusFilter} />

        <PostsList
          key={statusFilter}
          posts={items}
          statusFilter={statusFilter}
          initialNextCursor={nextCursor}
          total={total}
        />
      </PageContainer>
    </AppShell>
  );
}
