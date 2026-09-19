import * as Sentry from "@sentry/nextjs";
import { DomainError } from "./errors/domain-error";

export { scrubRequestPath } from "./request-scrub";

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
 * Media traceability (P1.4): `traceUserId` / `pathDigest` / `mediaTrace`
 * moved to `./diagnostics-server` (they need `node:crypto`, which must
 * never reach a client bundle — see that file's header for why). This
 * file's exports below stay import-safe from both client and server.
 */

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
 * Expected outcomes (user error, not a bug): console-logged but never
 * sent to Sentry as errors. Provider failures are NOT in this set —
 * they are real incidents (warning when retryable, error otherwise).
 */
const EXPECTED_ERROR_CODES = new Set([
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "ENTITLEMENT_DENIED",
  "RATE_LIMITED",
  "NOT_FOUND",
  "CONFLICT",
]);

/**
 * The single way to report a server/client error: same console shape as
 * logErrorDiagnostic plus a scrubbed Sentry event when configured.
 * Safe to call anywhere; never throws and never leaks secrets.
 *
 * Unified error model: `DomainError` values are classified — expected
 * categories stay console-only, provider errors carry safe metadata
 * (`code`, `provider`, `providerCode`, `httpStatus`) and retryable ones
 * are sent as warnings. `cause` is never forwarded.
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
    const domain = error instanceof DomainError ? error : null;
    if (domain && EXPECTED_ERROR_CODES.has(domain.code)) return;
    let err = error instanceof Error ? error : new Error(String(error));
    if (domain) {
      // Forward name/message/stack only — `cause` may hold tokens or
      // internal detail and must never reach Sentry.
      const clean = new Error(domain.message);
      clean.name = domain.name;
      clean.stack = domain.stack;
      err = clean;
    }
    const tags: Record<string, string> = { scope };
    if (domain) {
      tags.code = domain.code;
      if (domain.provider) tags.provider = domain.provider;
    }
    const postviaContext: Record<string, string | number> = { scope, event };
    if (domain) {
      postviaContext.code = domain.code;
      if (domain.provider) postviaContext.provider = domain.provider;
      if (domain.providerCode) postviaContext.providerCode = domain.providerCode;
      postviaContext.httpStatus = domain.status;
    }
    Sentry.captureException(err, {
      tags,
      level: domain?.retryable ? "warning" : "error",
      // postviaContext holds only safe literals (scope/event/code/
      // provider/providerCode/httpStatus) — nothing to scrub.
      contexts: { postvia: postviaContext },
      extra: scrubValue({ ...(extra ?? {}) }) as Record<string, unknown>,
    });
  } catch {
    // Reporting must never break the request path.
  }
}
