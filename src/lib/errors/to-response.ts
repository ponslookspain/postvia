/**
 * Domain → API mapping (backward-compatible flat shape).
 *
 * Canonical response:
 *   { error: string, code: ErrorCode, retryable?: boolean, details?: {...} }
 *
 * `error` is ALWAYS the user-safe string (old `typeof data?.error ===
 * "string"` clients keep working). `cause`, internal messages and
 * provider secrets never leave the server — they only go to diagnostics.
 *
 * No Prisma/Stripe/Sentry/Next imports.
 */
import { isErrorCode, type ErrorCode } from "./codes";
import { DomainError, FALLBACK_MESSAGE } from "./domain-error";

export type ApiErrorBody = {
  error: string;
  code: ErrorCode;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export type ApiErrorResponse = {
  status: number;
  body: ApiErrorBody;
};

/**
 * Keep details JSON-safe and free of secrets. Unknown shapes collapse
 * to undefined rather than leaking.
 */
function sanitizeDetails(details: unknown): Record<string, unknown> | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (value === null) {
      out[key] = null;
      continue;
    }
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[key] = [...value];
      continue;
    }
    // Nested objects are dropped: only flat safe scalars cross the boundary.
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function fromDomainError(error: DomainError): ApiErrorResponse {
  const body: ApiErrorBody = {
    error: error.safeMessage,
    code: error.code,
  };
  if (error.retryable) body.retryable = true;
  const details = sanitizeDetails(error.details);
  if (details) body.details = details;
  return { status: error.status, body };
}

/**
 * Best-effort mapping for legacy `{ error, code?, retryAfterSeconds? }`
 * lib results (otp, media-upload, schedule) without importing them.
 */
function fromLegacyResult(value: {
  error: unknown;
  status?: unknown;
  code?: unknown;
  retryAfterSeconds?: unknown;
  upgradeTo?: unknown;
}): ApiErrorResponse | null {
  if (typeof value.error !== "string" || value.error.length === 0) return null;
  const status =
    typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599
      ? value.status
      : 500;
  const code: ErrorCode =
    value.code === "RATE_LIMITED"
      ? "RATE_LIMITED"
      : value.code === "UPGRADE_REQUIRED"
        ? "ENTITLEMENT_DENIED"
        : status === 401
          ? "UNAUTHENTICATED"
          : status === 403
            ? "FORBIDDEN"
            : status === 404
              ? "NOT_FOUND"
              : status === 409
                ? "CONFLICT"
                : status === 429
                  ? "RATE_LIMITED"
                  : status >= 500
                    ? "INTERNAL"
                    : "VALIDATION_FAILED";
  const body: ApiErrorBody = { error: value.error, code };
  if (code === "RATE_LIMITED") body.retryable = true;
  const details: Record<string, unknown> = {};
  if (typeof value.retryAfterSeconds === "number" && Number.isFinite(value.retryAfterSeconds)) {
    details.retryAfterSeconds = Math.min(Math.max(Math.ceil(value.retryAfterSeconds), 1), 3600);
  }
  // Carries the plan a denied caller should upgrade to (see
  // `@/domain/billing/entitlements`'s `Denial.upgradeTo`) through to the
  // client's `parseApiError`, which reads it from `details.upgradeTo`.
  if (code === "ENTITLEMENT_DENIED" && typeof value.upgradeTo === "string") {
    details.upgradeTo = value.upgradeTo;
  }
  if (Object.keys(details).length > 0) body.details = details;
  return { status, body };
}

/** Single entry point: domain error → API response. Never throws, never leaks. */
export function toApiResponse(error: unknown): ApiErrorResponse {
  if (error instanceof DomainError) return fromDomainError(error);
  if (error && typeof error === "object" && "error" in error) {
    const legacy = fromLegacyResult(error as { error: unknown });
    if (legacy) return legacy;
  }
  if (error instanceof Error) {
    return {
      status: 500,
      body: { error: FALLBACK_MESSAGE, code: "INTERNAL" },
    };
  }
  if (typeof error === "string" && error.length > 0 && error.length < 500) {
    // Genuinely safe? No — treat as internal, keep the string out.
    return { status: 500, body: { error: FALLBACK_MESSAGE, code: "INTERNAL" } };
  }
  return { status: 500, body: { error: FALLBACK_MESSAGE, code: "INTERNAL" } };
}

/** Re-validate an inbound error body (client/tests). Unknown → null. */
export function parseApiErrorBody(body: unknown): ApiErrorBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error !== "string" || record.error.length === 0) return null;
  const code = isErrorCode(record.code) ? record.code : null;
  return {
    error: record.error,
    code: code ?? "INTERNAL",
    ...(record.retryable === true ? { retryable: true as const } : {}),
    ...(record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? { details: record.details as Record<string, unknown> }
      : {}),
  };
}
