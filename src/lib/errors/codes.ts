/**
 * Machine-readable error codes for the unified error model.
 *
 * Flat, stable strings sent as `code` alongside the user-safe `error`
 * string (backward compatible: `error` stays a string, see to-response).
 * No Prisma/Stripe/Sentry/Next imports — safe for `src/domain/*`.
 */

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "ENTITLEMENT_DENIED",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "EXTERNAL_AUTH_EXPIRED",
  "UPSTREAM_UNAVAILABLE",
  "CONFLICT",
  "NOT_FOUND",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODE_SET = new Set<string>(ERROR_CODES);

/** True only for a known code (unknown strings never leak into responses). */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && CODE_SET.has(value);
}
