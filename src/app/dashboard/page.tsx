import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [totalPosts, drafts, scheduled, published, recentPosts] =
    await Promise.all([
      prisma.post.count({ where: { userId: user.id } }),
      prisma.post.count({
        where: { userId: user.id, status: "DRAFT" },
      }),
      prisma.post.count({
        where: { userId: user.id, status: "SCHEDULED" },
      }),
      prisma.post.count({
        where: { userId: user.id, status: "PUBLISHED" },
      }),
      prisma.post.findMany({
        where: { userId: user.id },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { targets: true },
      }),
    ]);

  const stats = [
    { label: "Posts", value: totalPosts },
    { label: "Drafts", value: drafts },
    { label: "Scheduled", value: scheduled },
    { label: "Published", value: published },
  ];

  return (
    <AppShell user={user}>
      <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-8">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border border-border rounded-lg p-5"
          >
            <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
            <p className="text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent posts</h2>
          <Link
            href="/posts/new"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Create post
          </Link>
        </div>

        {recentPosts.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm mb-3">
              No posts yet
            </p>
            <Link
              href="/posts/new"
              className="text-sm font-medium hover:underline"
            >
              Create your first post
            </Link>
          </div>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm truncate">{post.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {post.targets[0]?.platform ?? "X"} ·{" "}
                    {post.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <StatusBadge status={post.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SCHEDULED: "bg-amber-50 text-amber-700 border-amber-200",
    PUBLISHING: "bg-blue-50 text-blue-700 border-blue-200",
    PUBLISHED: "bg-green-50 text-green-700 border-green-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span
      className={`text-xs font-medium px-2.5 py-0.5 rounded-full border border-transparent ${
        colors[status] ?? colors.DRAFT
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
