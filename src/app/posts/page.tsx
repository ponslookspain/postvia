import Link from "next/link";
import { ClapperboardIcon, PlusIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatStatusLabel } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { PostsList, type PostListItem } from "./PostsList";

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
  }));

  return (
    <AppShell user={user}>
      <PageContainer>
        <PageHeader
          title="Posts"
          description="Manage your content, scheduled posts and publishing activity"
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
              <Button
                nativeButton={false}
                render={<Link href="/posts/new" />}
              >
                <PlusIcon data-icon="inline-start" />
                Create post
              </Button>
            </div>
          }
        />

        <nav
          aria-label="Filter posts by status"
          className="mb-6 flex gap-5 overflow-x-auto border-b border-border"
        >
          <Link
            href="/posts"
            aria-current={statusFilter === "all" ? "page" : undefined}
            className={
              statusFilter === "all"
                ? "-mb-px shrink-0 border-b-2 border-primary px-0.5 py-2 text-[13px] font-medium whitespace-nowrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                : "-mb-px shrink-0 border-b-2 border-transparent px-0.5 py-2 text-[13px] whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
                  ? "-mb-px shrink-0 border-b-2 border-primary px-0.5 py-2 text-[13px] font-medium whitespace-nowrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  : "-mb-px shrink-0 border-b-2 border-transparent px-0.5 py-2 text-[13px] whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              }
            >
              {formatStatusLabel(option)}
            </Link>
          ))}
        </nav>

        <PostsList posts={items} statusFilter={statusFilter} />
      </PageContainer>
    </AppShell>
  );
}
