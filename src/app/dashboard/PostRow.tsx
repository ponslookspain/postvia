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
 * Visual feed row shared by the dashboard sections. Content first
 * (thumbnail, text), action second (whole row links to the post),
 * metadata third (platforms, status, date) — no boxes, hairlines only.
 */
export function PostRow({
  post,
  index = 0,
  large = false,
  error,
}: {
  post: FeedPost;
  index?: number;
  large?: boolean;
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
        className="group flex items-start gap-4 py-5 outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:gap-5"
      >
        {preview ? (
          <span
            className={cn(
              "relative block shrink-0 overflow-hidden rounded-lg bg-muted",
              large ? "size-24 sm:size-28" : "size-20 sm:size-24"
            )}
          >
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
        ) : (
          <span
            aria-hidden="true"
            className="mt-2 hidden size-2 shrink-0 rounded-full bg-border sm:block"
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block break-words text-foreground line-clamp-2",
              large ? "text-base leading-snug" : "text-[15px] leading-snug"
            )}
          >
            {post.text}
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
            <span className="mt-1 block truncate text-xs text-error-text">
              Couldn&apos;t publish — open the post to review.
            </span>
          )}
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 pt-0.5 text-sm transition-colors",
            post.status === "FAILED"
              ? "font-medium text-error-text"
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
