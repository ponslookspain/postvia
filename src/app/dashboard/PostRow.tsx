import Link from "next/link";
import { ChevronRightIcon, ClapperboardIcon } from "lucide-react";
import { cn, formatPostDate } from "@/lib/utils";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";

export type FeedPost = {
  id: string;
  text: string;
  status: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  errorMessage?: string | null;
  targets: { id?: string; platform: string }[];
  media: { id: string; type: string }[];
};

/**
 * Feed row shared by the dashboard lists. The interactive surface is a
 * rounded panel inset from the content, so the hover reads as "this row"
 * rather than a band pinned to the block's edges and the rule above it.
 * Rows are separated by spacing, not hairlines — a hairline and a hover
 * highlight fight for the same gap.
 */
export function PostRow({
  post,
  index = 0,
  error,
}: {
  post: FeedPost;
  index?: number;
  error?: string | null;
}) {
  const preview = post.media[0];
  return (
    <li
      className="animate-[post-in_.45s_ease_both] motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      <Link
        href={`/posts/${post.id}`}
        className="group flex items-center gap-4 rounded-xl px-2.5 py-3.5 outline-none transition-colors hover:bg-overlay-4 focus-visible:bg-overlay-4 focus-visible:ring-2 focus-visible:ring-ring/50 sm:gap-5"
      >
        {preview && (
          <span className="relative block size-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-20">
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
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-prose leading-snug break-words text-foreground line-clamp-2">
            {post.text.trim() || "No caption yet"}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {post.targets.map((target, i) => (
                <span
                  key={target.id ?? `${target.platform}-${i}`}
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
          {error && (
            <span className="mt-1 block truncate text-xs text-error">
              Couldn&apos;t publish — open the post to review.
            </span>
          )}
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-sm transition-colors",
            post.status === "FAILED"
              ? "font-medium text-error"
              : "text-muted-foreground group-hover:text-foreground"
          )}
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
}
