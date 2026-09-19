import { logDiagnostic } from "./diagnostics";

/**
 * Publishing observability — structured, allowlisted events for the
 * publishing pipeline. Observability-only: emitting never changes
 * publishing semantics and never throws.
 *
 * Security model (two boundaries):
 * 1. Allowlist FIRST: the public payload type has exactly six fields and
 *    `buildPublishPayload` re-picks them at runtime, so extra keys passed
 *    via `as` casts can never reach the logs.
 * 2. The existing scrubber in `diagnostics.ts` stays the SECOND boundary
 *    for the Sentry path. These events intentionally use only
 *    `logDiagnostic` (console) and never call `reportError`/`Sentry.*`:
 *    per-attempt outcomes are application logs, not error telemetry —
 *    crashes are already covered by the existing `reportError` boundaries
 *    (cron tick worker, publish/retry routes). Sending every terminal
 *    provider rejection to Sentry would be noise, not signal.
 *
 * Forbidden in payloads (enforced by type + runtime pick): Error objects,
 * messages/stacks, requests/responses, headers, bodies, tokens, secrets,
 * cookies, authorization, userId/accountId, email/username/IP, post text,
 * media URLs, OAuth payloads.
 */

/** The full event taxonomy. Do not extend without a documented need. */
export type PublishEventName =
  | "publish_attempt"
  | "publish_success"
  | "publish_failure"
  | "retry"
  | "timeout"
  | "provider_rate_limit"
  | "token_refresh"
  | "late_schedule";

/**
 * Minimal status set derived from the actual pipeline. Each event uses a
 * fixed status (see `emit*` wrappers); `failed_ambiguous` covers the X
 * transport-throw / aged-marker case where the remote outcome is unknowable.
 */
export type PublishStatus =
  | "attempted"
  | "published"
  | "failed"
  | "failed_ambiguous"
  | "retry_queued"
  | "timeout"
  | "rate_limited"
  | "refreshed"
  | "refresh_failed"
  | "late";

/**
 * The ONLY telemetry fields allowed. No optional fields, no index
 * signature, no `Record<string, unknown>`, no `...rest`.
 * `duration` is milliseconds: per-target attempt time (claim → terminal
 * write) for success/failure/timeout, lateness for `late_schedule`,
 * `0` for instantaneous markers (attempt/retry/rate_limit/token_refresh).
 */
export type PublishEventPayload = {
  provider: string;
  postId: string;
  targetId: string;
  duration: number;
  attempt: number;
  status: PublishStatus;
};

/** Runtime allowlist — the exact six fields, nothing else. */
export const PUBLISH_EVENT_FIELDS = [
  "provider",
  "postId",
  "targetId",
  "duration",
  "attempt",
  "status",
] as const;

/** Which statuses are legal per event (documentation + runtime guard). */
export const PUBLISH_EVENT_STATUS: Record<PublishEventName, readonly PublishStatus[]> = {
  publish_attempt: ["attempted"],
  publish_success: ["published"],
  publish_failure: ["failed", "failed_ambiguous"],
  retry: ["retry_queued"],
  timeout: ["timeout"],
  provider_rate_limit: ["rate_limited"],
  token_refresh: ["refreshed", "refresh_failed"],
  late_schedule: ["late"],
};

export function isPublishEventName(value: unknown): value is PublishEventName {
  return (
    value === "publish_attempt" ||
    value === "publish_success" ||
    value === "publish_failure" ||
    value === "retry" ||
    value === "timeout" ||
    value === "provider_rate_limit" ||
    value === "token_refresh" ||
    value === "late_schedule"
  );
}

function asSafeString(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

function asSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  return floored < 0 ? 0 : floored;
}

/**
 * Runtime allowlist enforcement: returns a frozen object with EXACTLY the
 * six allowed fields. Extra keys (smuggled via casts) are dropped, wrong
 * types are replaced with safe defaults. Never throws.
 */
export function buildPublishPayload(input: PublishEventPayload): PublishEventPayload {
  const record = input as unknown as Record<string, unknown>;
  const status = record["status"];
  const legal: readonly PublishStatus[] = [
    "attempted",
    "published",
    "failed",
    "failed_ambiguous",
    "retry_queued",
    "timeout",
    "rate_limited",
    "refreshed",
    "refresh_failed",
    "late",
  ];
  return Object.freeze({
    provider: asSafeString(record["provider"]),
    postId: asSafeString(record["postId"]),
    targetId: asSafeString(record["targetId"]),
    duration: asSafeCount(record["duration"]),
    attempt: asSafeCount(record["attempt"]),
    status: legal.includes(status as PublishStatus)
      ? (status as PublishStatus)
      : "failed",
  });
}

/**
 * Core emitter. Reuses the existing `logDiagnostic` pipeline (single
 * console shape `[postvia] publish: <event>`); never touches Sentry
 * directly; never throws — observability must not break publishing.
 */
export function emitPublishEvent(
  name: PublishEventName,
  payload: PublishEventPayload
): void {
  try {
    if (!isPublishEventName(name)) return;
    const allowed = PUBLISH_EVENT_STATUS[name];
    const safe = buildPublishPayload(payload);
    if (!allowed.includes(safe.status)) return;
    logDiagnostic("publish", name, { ...safe });
  } catch {
    // Observability is best-effort by design.
  }
}

// ---------------------------------------------------------------------------
// Narrow wrappers: each event fixes its status so call-sites cannot mix
// attempt-level and post-level semantics or mistype a status.
// ---------------------------------------------------------------------------

export type PublishTargetRef = {
  provider: string;
  postId: string;
  targetId: string;
  attempt: number;
};

export function emitPublishAttempt(ref: PublishTargetRef): void {
  emitPublishEvent("publish_attempt", { ...ref, duration: 0, status: "attempted" });
}

export function emitPublishSuccess(
  ref: PublishTargetRef & { duration: number }
): void {
  emitPublishEvent("publish_success", { ...ref, status: "published" });
}

export function emitPublishFailure(
  ref: PublishTargetRef & { duration: number; ambiguous?: boolean }
): void {
  const { ambiguous, ...rest } = ref;
  emitPublishEvent("publish_failure", {
    ...rest,
    status: ambiguous ? "failed_ambiguous" : "failed",
  });
}

export function emitPublishRetry(ref: PublishTargetRef): void {
  emitPublishEvent("retry", { ...ref, duration: 0, status: "retry_queued" });
}

export function emitPublishTimeout(
  ref: PublishTargetRef & { duration: number }
): void {
  emitPublishEvent("timeout", { ...ref, status: "timeout" });
}

export function emitProviderRateLimit(ref: PublishTargetRef): void {
  emitPublishEvent("provider_rate_limit", {
    ...ref,
    duration: 0,
    status: "rate_limited",
  });
}

export function emitTokenRefresh(
  ref: PublishTargetRef & { status: "refreshed" | "refresh_failed" }
): void {
  emitPublishEvent("token_refresh", { ...ref, duration: 0 });
}

export function emitLateSchedule(
  ref: PublishTargetRef & { duration: number }
): void {
  emitPublishEvent("late_schedule", { ...ref, status: "late" });
}

/**
 * Best-effort attempt number. The DB has no persistent attempt counter
 * (by design — no migration in this task), so this saturates: `1` for a
 * first-known entry (`PENDING`), `2` for any repeat (`FAILED` re-entry or
 * stale re-queue). Documented as approximate, never claimed exact.
 */
export function inferAttemptNumber(entryStatus: string): 1 | 2 {
  return entryStatus === "FAILED" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Rate-limit detection (provable points only). Duck-types `{ code,
// httpStatus/status, message }` and known safe message fragments; tests the
// pattern but never logs the raw value.
// ---------------------------------------------------------------------------

const RATE_LIMIT_CODES = new Set([
  "rate_limit_exceeded",
  "spam_risk_too_many_posts",
  "reached_active_user_cap",
]);

const RATE_LIMIT_MESSAGE_PATTERN =
  /rate_limit_exceeded|rate limit|too many requests|reached_active_user_cap|spam_risk_too_many_posts/i;

/** True when a raw provider error provably signals a rate limit. */
export function isRateLimitSignal(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return RATE_LIMIT_MESSAGE_PATTERN.test(String(raw ?? ""));
  }
  const record = raw as Record<string, unknown>;
  const nested =
    record["error"] && typeof record["error"] === "object"
      ? (record["error"] as Record<string, unknown>)
      : null;
  const code =
    (typeof record["code"] === "string" ? record["code"] : null) ??
    (nested && typeof nested["code"] === "string" ? nested["code"] : null);
  const httpStatus =
    (typeof record["httpStatus"] === "number" ? record["httpStatus"] : null) ??
    (typeof record["status"] === "number" ? record["status"] : null) ??
    (nested && typeof nested["httpStatus"] === "number"
      ? nested["httpStatus"]
      : null);
  if (httpStatus === 429) return true;
  if (code && RATE_LIMIT_CODES.has(code)) return true;
  const message =
    (typeof record["message"] === "string" ? record["message"] : "") ||
    (nested && typeof nested["message"] === "string" ? nested["message"] : "") ||
    (typeof code === "string" ? code : "");
  return RATE_LIMIT_MESSAGE_PATTERN.test(message);
}

/**
 * Notify hook for the `ensureFresh*Token` flows. Invoked ONLY when this
 * worker actually performed a refresh network call (`refreshed` on
 * success, `refresh_failed` on error) — fast-path and concurrent-reuse
 * returns stay silent so the event never becomes noise. Carries no
 * values, only the outcome; tokens/headers/bodies never cross it.
 */
export type TokenRefreshNotify = (outcome: "refreshed" | "refresh_failed") => void;
