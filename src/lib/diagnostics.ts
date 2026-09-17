import * as Sentry from "@sentry/nextjs";
import { createHash } from "node:crypto";

/**
 * Log-safe blob path: the user id is a stable identifier and must never
 * reach logs, so media paths collapse to a constant (post id, random
 * suffix and filename are dropped along with it).
 *
 * Kept deliberately total — see `pathDigest` for the correlatable companion
 * that identifies WHICH object without revealing WHOSE it is.
 */
export function safePathname(pathname: string): string {
  const parts = pathname.replace(/^\/+/, "").split("/");
  if (parts[0] === "media") {
    return "media/***/***";
  }
  return "***";
}

/**
 * Media traceability (P1.4).
 *
 * The scrub above is correct but total: every media failure logged
 * `media/***​/***` and nothing else, so two different users' upload failures
 * were indistinguishable and no incident could be traced to a request. That
 * is a debuggability gap, not a privacy requirement — the fix is to log
 * identifiers that are stable and correlatable but not identifying.
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
 * filenames, and file contents. The `isSensitiveKey` denylist below stays
 * authoritative and is not weakened by any of this.
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

export function logDiagnostic(
  scope: string,
  event: string,
  fields?: Record<string, unknown>
): void {
  console.info(`[postvia] ${scope}: ${event}`, fields ?? {});
}

export function logErrorDiagnostic(
  scope: string,
  event: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[postvia] ${scope}: ${event}`, {
    ...(extra ?? {}),
    errorName: name,
    errorMessage: message,
  });
}

// ---------------------------------------------------------------------------
// Sentry bridge — the single error-reporting pipeline. There is no second
// logging system: reportError keeps the existing console format above and
// forwards a scrubbed copy to Sentry when a DSN is configured. Without a
// DSN it degrades to console-only and never throws.
// ---------------------------------------------------------------------------

/**
 * Keys (case-insensitive, substring match) whose values are secrets and
 * must never reach Sentry: tokens, passwords, OAuth codes, signed URLs,
 * cookies, authorization headers and other credentials.
 */
const SENSITIVE_KEY_PARTS = [
  "secret",
  "token",
  "password",
  "passwd",
  "passwort",
  "authorization",
  "cookie",
  "session",
  "credential",
  "privatekey",
  "private_key",
  "apikey",
  "api_key",
  "signedurl",
  "signed_url",
  "signature",
  "sig",
] as const;

const SENSITIVE_EXACT_KEYS = new Set([
  "code",
  "state",
  "url",
  "verifier",
  "codeverifier",
  "code_verifier",
]);

const REDACTED = "[REDACTED]";

/** Query params that must be stripped from any URL sent to Sentry. */
const SENSITIVE_QUERY_PARAMS = new Set([
  "code",
  "state",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "signature",
  "sig",
  "session",
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_EXACT_KEYS.has(lower)) return true;
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
}

/**
 * Replaces the query string of a URL with a placeholder when it carries
 * sensitive params (OAuth codes, signed-URL signatures, tokens).
 */
export function scrubUrl(value: string): string {
  const queryIndex = value.indexOf("?");
  if (queryIndex === -1) return value;
  const query = value.slice(queryIndex + 1);
  const params = query.split(/[&;]/);
  const sensitive = params.some((param) => {
    const name = param.split("=")[0]?.trim().toLowerCase() ?? "";
    return SENSITIVE_QUERY_PARAMS.has(name) || isSensitiveKey(name);
  });
  if (!sensitive) return value;
  return `${value.slice(0, queryIndex)}?${REDACTED}`;
}

/**
 * Deep-copies an unknown value while redacting secrets. Objects deeper
 * than the budget are collapsed instead of traversed.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.includes("?") ? scrubUrl(value) : value;
  }
  if (Array.isArray(value)) {
    if (depth >= 4) return REDACTED;
    return value.map((item) => scrubValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    if (depth >= 4) return REDACTED;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = isSensitiveKey(key)
        ? REDACTED
        : scrubValue(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Keeps only the pathname of a request path (`/blog?name=foo` -> `/blog`)
 * so OAuth codes and other query secrets never reach Sentry.
 */
export function scrubRequestPath(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

/**
 * Sentry beforeSend hook: scrubs request data, user PII, contexts, extras
 * and breadcrumb payloads. Never drops the event itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrubSentryEvent(event: any): any {
  if (event.request?.url && typeof event.request.url === "string") {
    event.request.url = scrubUrl(event.request.url);
  }
  if (event.request?.headers && typeof event.request.headers === "object") {
    const headers: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(event.request.headers)) {
      headers[key] = isSensitiveKey(key) ? REDACTED : entry;
    }
    event.request.headers = headers;
  }
  if (event.request?.cookies) {
    event.request.cookies = REDACTED;
  }
  if (event.user && typeof event.user === "object") {
    const { id, ...rest } = event.user as Record<string, unknown>;
    void rest;
    event.user = id === undefined ? REDACTED : { id };
  }
  if (event.contexts && typeof event.contexts === "object") {
    event.contexts = scrubValue(event.contexts);
  }
  if (event.extra && typeof event.extra === "object") {
    event.extra = scrubValue(event.extra);
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((crumb: unknown) =>
      scrubValue(crumb)
    );
  }
  return event;
}

export function getSentryTracesSampleRate(): number {
  const override = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ??
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
  );
  if (Number.isFinite(override) && override >= 0 && override <= 1) {
    return override;
  }
  return process.env.NODE_ENV === "production" ? 0.1 : 0;
}

function isSentryConfigured(): boolean {
  return Boolean(
    process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
  );
}

/**
 * The single way to report a server/client error: same console shape as
 * logErrorDiagnostic plus a scrubbed Sentry event when configured.
 * Safe to call anywhere; never throws and never leaks secrets.
 */
export function reportError(
  scope: string,
  event: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  logErrorDiagnostic(scope, event, error, extra);
  if (!isSentryConfigured()) return;
  try {
    const err =
      error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err, {
      tags: { scope },
      contexts: { postvia: { scope, event } },
      extra: scrubValue({ ...(extra ?? {}) }) as Record<string, unknown>,
    });
  } catch {
    // Reporting must never break the request path.
  }
}
