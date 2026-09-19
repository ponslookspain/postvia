/**
 * Server-only diagnostics: the hashing helpers from `diagnostics.ts` that
 * need `node:crypto`. Split out so that file can be imported from client
 * components (it re-exports `reportError`, the browser-side error
 * reporter) without pulling `node:crypto` into the client bundle.
 *
 * webpack's default browser target has no handler for the `node:` URI
 * scheme and hard-fails the build; Turbopack tolerates it, which is why
 * this only ever surfaced when falling back to `next dev --webpack`. Only
 * server code (`media-upload.ts`, `dashboard.ts`) ever needed these
 * functions — no client component calls `traceUserId` / `pathDigest` /
 * `mediaTrace` directly.
 */
import { createHash } from "node:crypto";
import { safePathname } from "./diagnostics";

/**
 * Media traceability (P1.4).
 *
 * The scrub in `diagnostics.ts` (`safePathname`) is correct but total:
 * every media failure logged `media/***​/***` and nothing else, so two
 * different users' upload failures were indistinguishable and no incident
 * could be traced to a request. That is a debuggability gap, not a
 * privacy requirement — the fix is to log identifiers that are stable and
 * correlatable but not identifying.
 *
 * What goes in the logs:
 * - `userHash`  — peppered SHA-256 prefix. Stable per user (so one user's
 *                 failures group together), non-reversible, useless outside
 *                 this deployment because it is peppered.
 * - `postId` / `mediaId` — opaque cuids. They are database surrogates, carry
 *                 no personal information, and are what support actually
 *                 needs to find the row.
 * - `pathDigest` — hash of the storage key, so the SAME object can be
 *                 followed across prepare → upload → register → publish
 *                 without printing the key (which embeds the user id).
 *
 * What still never goes in: tokens, signed URLs, raw emails or user ids,
 * filenames, and file contents. `diagnostics.ts`'s `isSensitiveKey`
 * denylist stays authoritative and is not weakened by any of this.
 */
const TRACE_HASH_LENGTH = 12;

function tracePepper(): string {
  // Reuses the existing anti-abuse pepper so there is one secret to rotate,
  // not two. Absent (local dev, CI) → a fixed dev salt: hashes stay stable
  // within a run, and no raw identifier is ever emitted either way.
  return process.env.ABUSE_HASH_PEPPER?.trim() || "postvia-dev-trace-salt";
}

/**
 * Non-reversible, stable, peppered short hash of a user id.
 * Never returns the input, including when the pepper is missing.
 */
export function traceUserId(userId: string | null | undefined): string {
  if (!userId) return "anon";
  return createHash("sha256")
    .update(`1:${tracePepper()}:trace-user:${userId}`, "utf8")
    .digest("hex")
    .slice(0, TRACE_HASH_LENGTH);
}

/** Non-reversible short hash of a storage key (the key itself embeds a user id). */
export function pathDigest(pathname: string | null | undefined): string {
  if (!pathname) return "none";
  return createHash("sha256")
    .update(`1:${tracePepper()}:trace-path:${pathname}`, "utf8")
    .digest("hex")
    .slice(0, TRACE_HASH_LENGTH);
}

export type MediaTrace = {
  stage: string;
  userHash: string;
  postId?: string;
  mediaId?: string;
  pathDigest: string;
  pathname: string;
};

/**
 * Structured context for any media-pipeline log line. Every field is either
 * opaque or hashed, so this is safe to emit on the hot path and safe to ship
 * to Sentry.
 */
export function mediaTrace(input: {
  stage: string;
  userId?: string | null;
  postId?: string | null;
  mediaId?: string | null;
  pathname?: string | null;
}): MediaTrace {
  return {
    stage: input.stage,
    userHash: traceUserId(input.userId),
    ...(input.postId ? { postId: input.postId } : {}),
    ...(input.mediaId ? { mediaId: input.mediaId } : {}),
    pathDigest: pathDigest(input.pathname),
    pathname: safePathname(input.pathname ?? ""),
  };
}
