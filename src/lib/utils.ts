import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Local class-name merger (replaces the `cn` package): conditional join
// via clsx, Tailwind conflict resolution via tailwind-merge.
//
// Custom DS font-size tokens (foundations.css: --text-label/meta/prose/micro)
// must be registered in the font-size group: tailwind-merge's default config
// classifies unknown text-* classes as text-color, which silently drops the
// size class whenever it is merged with a text color via cn().
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": ["text-label", "text-meta", "text-prose", "text-micro"],
		},
	},
});
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const X_POST_CHAR_LIMIT = 280;
export const THREADS_POST_CHAR_LIMIT = 500;

const THREADS_SHORTCODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const SIXTY_FOUR = BigInt(64);
const ZERO = BigInt(0);

function toThreadsShortcode(postId: string): string {
  let id = BigInt(postId);
  let shortcode = "";
  while (id > ZERO) {
    shortcode = THREADS_SHORTCODE_ALPHABET[Number(id % SIXTY_FOUR)] + shortcode;
    id = id / SIXTY_FOUR;
  }
  return shortcode;
}

export function threadsPostUrl(username: string, postId: string): string {
  return `https://www.threads.net/@${username}/post/${toThreadsShortcode(postId)}`;
}

export function formatPlatformName(platform: string): string {
  if (platform === "X") return "X (Twitter)";
  if (platform === "THREADS") return "Threads";
  return platform;
}

export function isFutureIso(isoDate: string): boolean {
  return new Date(isoDate).getTime() > Date.now();
}

/** Human label for post/target status enums: FAILED -> "Failed". */
export function formatStatusLabel(status: string): string {
  if (status === "all") return "All statuses";
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

/** Primary date line for a post: published, scheduled, or created. */
export function formatPostDate(post: {
  status: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
}): string {
  if (post.status === "PUBLISHED" && post.publishedAt) {
    return `Published ${post.publishedAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  if (post.status === "SCHEDULED" && post.scheduledAt) {
    return `Scheduled ${post.scheduledAt.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return post.createdAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
