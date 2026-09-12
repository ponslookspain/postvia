export { cn } from "cn";

export const X_POST_CHAR_LIMIT = 280;
export const THREADS_POST_CHAR_LIMIT = 500;

const THREADS_SHORTCODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const SIXTY_FOUR = BigInt(64);
const ZERO = BigInt(0);

export function toThreadsShortcode(postId: string): string {
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
