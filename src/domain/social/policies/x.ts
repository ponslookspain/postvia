/**
 * X platform policies (domain).
 *
 * Pure error classification, media routing and attempt/retry decisions.
 * No OAuth, no token refresh, no Prisma, no fetch, no environment access,
 * no randomness — deterministic over inputs. The X API client, chunked
 * upload and orchestration stay in `src/lib/social/x.ts`, which re-exports
 * this module for compatibility.
 *
 * DOMAIN RULE: import nothing except standard primitives and domain types.
 * Never Prisma, Stripe SDK, React, process.env, fetch, Blob SDK, Sentry,
 * diagnostics, `src/lib/*` or `src/app/*`.
 */

export class XApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "XApiError";
  }
}

/**
 * Auth/token failures that always mean the user must reconnect — shared
 * by publish, refresh and resume so the contract stays in one place.
 */
export function isXAuthErrorCode(code: string): boolean {
  return (
    code === "unauthorized" ||
    code === "forbidden" ||
    code === "token_expired" ||
    code === "invalid_token" ||
    code === "invalid_refresh_token" ||
    code === "refresh_token_expired" ||
    code === "access_token_expired" ||
    code === "access_token_invalid"
  );
}

/**
 * Billing/usage failures that must surface as-is instead of the reconnect
 * message. X rejects publishes with 401/403-shaped errors when the
 * developer project's API credits run out, and the auth mapping below
 * would otherwise send the user to reconnect an account that is fine.
 * Checked BEFORE any auth classification, on the raw provider text.
 */
export function isXBillingErrorMessage(message: string): boolean {
  return (
    /credits?[\s_-]*(deplet|exhaust|exceed|insufficient)/i.test(message) ||
    /usage[\s_-]*cap/i.test(message) ||
    /exceed.*(usage|quota|credits?)/i.test(message)
  );
}

/** Classify a raw publish failure message as an auth failure. */
export function isXAuthErrorMessage(message: string): boolean {
  return (
    /http 40[13]\b/i.test(message) ||
    /unauthorized|forbidden|invalid[\s_-]*token|token[\s_-]*(expired|invalid)|session[\s_-]*expired|revoked/i.test(
      message
    )
  );
}

export function xErrorMessage(error: unknown): string {
  // Billing first: a depleted-credits rejection arrives with the same
  // 401/403 shape as an auth failure, but reconnecting cannot fix it.
  if (error instanceof Error && isXBillingErrorMessage(error.message)) {
    return "Your X API credits are depleted. Top up credit in the X developer portal, then retry this post — no need to reconnect your account.";
  }
  const code = error instanceof XApiError ? error.code : "";
  if (
    (typeof code === "string" && code.length > 0 && isXAuthErrorCode(code)) ||
    (error instanceof Error && isXAuthErrorMessage(error.message))
  ) {
    return "X access expired or was revoked. Reconnect your X account.";
  }
  if (error instanceof Error) {
    if (/not allowed to post a video longer than/i.test(error.message)) {
      return "This video is longer than your X account is allowed to post. Use a shorter video.";
    }
    if (/media processing (failed|timed out)|could not be processed/i.test(error.message)) {
      return error.message;
    }
    if (error.message) return error.message;
  }
  return "X publishing failed. Please try again.";
}

export const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const X_GIF_MAX_BYTES = 15 * 1024 * 1024;
export const X_MAX_PHOTOS = 4;
export const X_STATIC_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const X_GIF_MIME_TYPES = ["image/gif"] as const;
export const X_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;

export type XMediaCategory = "tweet_image" | "tweet_gif" | "tweet_video";

export type XMediaPolicyInput = {
  id: string;
  type: string;
  mimeType: string;
  size: number;
};

export type XMediaPolicy =
  | { kind: "text" }
  | { kind: "photo"; mediaIds: string[] }
  | { kind: "gif"; mediaId: string }
  | { kind: "video"; mediaId: string }
  | { kind: "error"; message: string };

/**
 * Pure X media router. Keeps X-only restrictions (5 MB photos, 15 MB GIF,
 * 4 photos / 1 GIF / 1 video per post, no mixing, MP4/MOV video) out of
 * the global validateMediaInput(), which intentionally stays broader for
 * other platforms. Order of `media` is the upload order.
 */
export function resolveXMediaPolicy(
  media: readonly XMediaPolicyInput[]
): XMediaPolicy {
  if (media.length === 0) return { kind: "text" };
  const hasVideo = media.some((item) => item.type === "VIDEO");
  const hasImage = media.some((item) => item.type === "IMAGE");
  if (hasVideo && hasImage) {
    return {
      kind: "error",
      message:
        "X does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.",
    };
  }
  if (hasVideo) {
    if (media.length > 1) {
      return { kind: "error", message: "X supports only one video per post." };
    }
    const only = media[0];
    if (!(X_VIDEO_MIME_TYPES as readonly string[]).includes(only.mimeType)) {
      const short = only.mimeType.split("/").pop() ?? only.mimeType;
      return {
        kind: "error",
        message: `X video posts support MP4 and MOV files only (got ${short}).`,
      };
    }
    if (!Number.isFinite(only.size) || only.size <= 0) {
      return { kind: "error", message: "X publishing requires a valid video file." };
    }
    return { kind: "video", mediaId: only.id };
  }
  // Image path: every item is IMAGE here.
  if (media.some((item) => item.type !== "IMAGE")) {
    return { kind: "error", message: "X media posts support images or one video." };
  }
  const gifs = media.filter((item) => item.mimeType === "image/gif");
  if (gifs.length > 0) {
    if (media.length > 1) {
      return {
        kind: "error",
        message: "X does not support combining a GIF with other media. Post the GIF on its own.",
      };
    }
    const only = gifs[0];
    if (!Number.isFinite(only.size) || only.size <= 0) {
      return { kind: "error", message: "X publishing requires a valid GIF file." };
    }
    if (only.size > X_GIF_MAX_BYTES) {
      return {
        kind: "error",
        message: "The GIF exceeds X's 15 MB limit. Use a smaller file.",
      };
    }
    return { kind: "gif", mediaId: only.id };
  }
  if (media.length > X_MAX_PHOTOS) {
    return {
      kind: "error",
      message: `X supports at most ${X_MAX_PHOTOS} photos per post.`,
    };
  }
  for (const item of media) {
    if (!(X_STATIC_IMAGE_MIME_TYPES as readonly string[]).includes(item.mimeType)) {
      const short = item.mimeType.split("/").pop() ?? item.mimeType;
      return {
        kind: "error",
        message: `X photo posts support JPG, PNG and WebP images only (got ${short}).`,
      };
    }
    if (!Number.isFinite(item.size) || item.size <= 0) {
      return { kind: "error", message: "X publishing requires a valid image file." };
    }
    if (item.size > X_IMAGE_MAX_BYTES) {
      return {
        kind: "error",
        message: "One of the photos exceeds X's 5 MB per-photo limit. Use a smaller file.",
      };
    }
  }
  return { kind: "photo", mediaIds: media.map((item) => item.id) };
}

export function xMediaCategoryForMime(mimeType: string): XMediaCategory {
  if (mimeType === "image/gif") return "tweet_gif";
  if ((X_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return "tweet_video";
  return "tweet_image";
}

/* ------------------ idempotency / ambiguous outcomes ------------------ */

/**
 * X duplicate-publishing hardening.
 *
 * Official X API fact (docs.x.com, CreatePosts schema): POST /2/tweets
 * has NO idempotency key and no "exactly-once" primitive. A tweet that
 * was created remotely while the response was lost (network timeout,
 * process crash) cannot be distinguished from "never sent" — and
 * guessing via "latest user tweets" would risk linking someone else's
 * post, so Postvia deliberately does NOT do that.
 *
 * Best-effort strategy with zero schema changes, using the existing
 * PostTarget.externalJobId column as an attempt marker:
 * - immediately BEFORE the tweet POST, the target stores
 *   `x-req-<random>` (never a real tweet id — those go to
 *   externalPostId). Media uploads happen BEFORE the marker, so an
 *   upload-only failure provably created no tweet.
 * - success / unambiguous X rejection clears the marker.
 * - a thrown transport error (timeout/abort/crash window) keeps the
 *   outcome UNKNOWN: FAILED with an explicit "check your X profile
 *   before retrying" message (manual retry stays possible but informed;
 *   cron never auto-retries FAILED).
 * - a process crash leaves PUBLISHING + marker. Stale recovery routes
 *   X markers to resumeXTarget (publish.ts): fresh markers stay
 *   PUBLISHING ("pending", never blind-reset into an auto-republish);
 *   markers older than X_AMBIGUOUS_ATTEMPT_MS convert to FAILED with
 *   the same check-first guidance. No second POST is ever issued
 *   automatically for an unknown outcome.
 */
export const X_ATTEMPT_MARKER_PREFIX = "x-req-";

/**
 * How long a crashed X attempt stays non-retryable before recovery
 * converts it to FAILED-with-guidance. The tweet POST is synchronous
 * (seconds); the stale threshold is 6 min, so 10 min leaves margin
 * without stranding users anywhere near the 24h schedule-validity.
 */
export const X_AMBIGUOUS_ATTEMPT_MS = 10 * 60_000;

export function isXAttemptMarker(jobId: string | null | undefined): boolean {
  return (
    typeof jobId === "string" &&
    jobId.startsWith(X_ATTEMPT_MARKER_PREFIX) &&
    jobId.length > X_ATTEMPT_MARKER_PREFIX.length
  );
}

/** Informed-manual-retry message for outcomes where a tweet may exist. */
export function xAmbiguousRetryMessage(): string {
  return (
    "X did not confirm whether the post was published (the request timed out or was interrupted). " +
    "Check your X profile first: if the post is there, do not retry. " +
    "Retrying may publish a duplicate."
  );
}

export type XStaleAttemptDecision = "pending" | "unknown" | "skip";

/**
 * Pure stale-recovery decision for an X target. "pending" keeps the
 * target in PUBLISHING (blocks both auto-reset and manual republish);
 * "unknown" converts it to FAILED-with-guidance (informed manual
 * retry); "skip" leaves non-X / non-marker / non-PUBLISHING rows to
 * the generic recovery path.
 */
export function decideXStaleAttempt(input: {
  platform: string;
  status: string;
  externalJobId: string | null | undefined;
  updatedAtMs: number;
  nowMs: number;
}): XStaleAttemptDecision {
  if (input.platform !== "X") return "skip";
  if (input.status !== "PUBLISHING") return "skip";
  if (!isXAttemptMarker(input.externalJobId)) return "skip";
  if (!Number.isFinite(input.updatedAtMs) || !Number.isFinite(input.nowMs)) {
    return "pending";
  }
  return input.nowMs - input.updatedAtMs > X_AMBIGUOUS_ATTEMPT_MS ? "unknown" : "pending";
}
