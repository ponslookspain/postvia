import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPlatformName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { targets: true },
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Posts</h1>
        <Link
          href="/posts/new"
          className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
        >
          Create post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm mb-3">No posts yet</p>
          <Link
            href="/posts/new"
            className="text-sm font-medium hover:underline"
          >
            Create your first post
          </Link>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {posts.map((post) => {
            const target = post.targets[0];
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="flex items-center justify-between p-5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm truncate mb-1">{post.text}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatPlatformName(target?.platform ?? "X")}</span>
                    <span>·</span>
                    <StatusBadge status={post.status} />
                    <span>·</span>
                    {post.status === "PUBLISHED" && post.publishedAt ? (
                      <span>
                        Published{" "}
                        {new Date(post.publishedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    ) : post.status === "SCHEDULED" && post.scheduledAt ? (
                      <span className="text-amber-700">
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
                {post.status === "FAILED" ? (
                  <span className="text-destructive text-sm font-medium shrink-0">
                    Retry
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm shrink-0">
                    View
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "text-muted-foreground",
    SCHEDULED: "text-amber-600",
    PUBLISHING: "text-blue-600",
    PUBLISHED: "text-green-600",
    FAILED: "text-red-600",
  };

  return (
    <span className={`font-medium ${colors[status] ?? ""}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
