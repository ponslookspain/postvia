import Link from "next/link";
import { ArrowRightIcon, ClapperboardIcon } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { formatTimeUntil } from "@/lib/dashboard-analytics";
import { formatPlatformName } from "@/lib/utils";
import type { FeedPost } from "@/app/dashboard/PostRow";

/**
 * The one thing a scheduling tool exists to answer: what goes out next,
 * and when. Given the weight of a headline rather than a list row, with
 * the post itself readable in place so nobody has to click to remember
 * what they wrote.
 */
export function NextUp({ post, now }: { post: FeedPost; now: Date }) {
  const when = post.scheduledAt;
  if (!when) return null;

  const countdown = formatTimeUntil(when, now);
  const headline = countdown.charAt(0).toUpperCase() + countdown.slice(1);
  const exact = when.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const platforms = [...new Set(post.targets.map((target) => target.platform))];
  const preview = post.media[0];

  return (
    <section
      aria-labelledby="next-up-heading"
      className="rounded-2xl bg-card p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2
          id="next-up-heading"
          className="text-sm leading-5 font-medium text-muted-foreground"
        >
          Next up
        </h2>
        <Link
          href="/posts?status=SCHEDULED"
          className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          See all scheduled
        </Link>
      </div>

      <p className="mt-1.5 font-heading text-2xl leading-8 font-semibold tracking-tight">
        {headline}
      </p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {exact}
        {platforms.length > 0 && (
          <>
            {" · to "}
            {platforms.map(formatPlatformName).join(", ")}
          </>
        )}
      </p>

      <Link
        href={`/posts/${post.id}`}
        className="group mt-4 flex items-center gap-3.5 rounded-xl bg-background p-3 outline-none transition-colors hover:bg-overlay-4 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {preview ? (
          <span className="relative block size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
            {preview.type === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${preview.id}`}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center">
                <ClapperboardIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            )}
          </span>
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center gap-1 rounded-lg bg-muted">
            {platforms.slice(0, 2).map((platform) => (
              <PlatformIcon
                key={platform}
                platform={platform}
                className="size-4 text-muted-foreground"
              />
            ))}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-prose leading-snug break-words text-foreground">
            {post.text.trim() || "No caption yet"}
          </span>
          <span className="mt-1.5 block text-xs leading-4 text-muted-foreground">
            Open to edit or reschedule
          </span>
        </span>
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none group-hover:translate-x-0.5"
        />
      </Link>
    </section>
  );
}
