/**
 * Shared OTP rate-limit UX helpers (server-safe: pure functions only).
 *
 * Never import server modules (abuse.ts, otp.ts, prisma) here. The server
 * remains the sole limiter; these helpers only format the
 * `retryAfterSeconds` the API already returned. The countdown hook lives
 * in `@/hooks/use-otp-retry-countdown` (client boundary) so importing
 * these formatters never drags React into server code.
 */

/** Machine-readable code returned ONLY by POST /api/auth/otp/request. */
export const OTP_RATE_LIMITED_CODE = "RATE_LIMITED" as const;

export type OtpErrorBody = {
  error?: unknown;
  code?: unknown;
  retryAfterSeconds?: unknown;
};

/**
 * Normalize a server-provided retry delay. Returns a positive integer
 * or null when absent/invalid. Never negative, never NaN.
 */
export function normalizeRetryAfterSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seconds = Math.ceil(value);
  if (seconds <= 0) return null;
  return Math.min(seconds, 3600);
}

/** True only for the structured OTP rate-limit shape. */
export function isOtpRateLimited(body: OtpErrorBody | null | undefined): boolean {
  if (!body || typeof body !== "object") return false;
  if (body.code !== OTP_RATE_LIMITED_CODE) return false;
  return normalizeRetryAfterSeconds(body.retryAfterSeconds) !== null;
}

/**
 * Human message for the real remaining wait. No technical details
 * (bucket, hash, scope, resetAt) and no email/user-enumeration content.
 */
export function formatOtpRateLimitMessage(retryAfterSeconds: number): string {
  const normalized = normalizeRetryAfterSeconds(retryAfterSeconds);
  const seconds = normalized ?? 60;
  if (seconds <= 90) {
    return `Please wait ${seconds} second${seconds === 1 ? "" : "s"} before requesting another code.`;
  }
  if (seconds < 3600) {
    const minutes = Math.max(2, Math.round(seconds / 60));
    return `Too many codes requested. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  const hours = seconds / 3600;
  if (hours < 1.5) {
    return "Too many codes requested. Please try again in about 1 hour.";
  }
  const rounded = Math.round(hours);
  return `Too many codes requested. Please try again in about ${rounded} hours.`;
}
