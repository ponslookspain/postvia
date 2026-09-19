/**
 * Client-safe error parsing (no Node imports, no React).
 *
 * Understands the new flat shape `{ error: string, code?, retryable?,
 * details? }` AND the legacy `{ error: string }`. Never throws.
 * Unknown codes fall back to a generic message.
 */
import { isErrorCode, type ErrorCode } from "./errors/codes";

export type ParsedApiError = {
  code: ErrorCode | null;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
  upgradeTo: string | null;
  retryAfterSeconds: number | null;
};

export const GENERIC_CLIENT_MESSAGE = "Something went wrong. Please try again.";

const CODE_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Please check your input and try again.",
  UNAUTHENTICATED: "Your sign-in expired. Please sign in and try again.",
  FORBIDDEN: "You don't have access to this. Please try again.",
  ENTITLEMENT_DENIED: "Plan limit reached.",
  RATE_LIMITED: "Too many requests. Please wait before trying again.",
  PROVIDER_UNAVAILABLE: "The service is temporarily unavailable. Please try again.",
  PROVIDER_REJECTED: "The provider rejected the request. Please try again.",
  EXTERNAL_AUTH_EXPIRED: "The connection expired. Please reconnect and try again.",
  UPSTREAM_UNAVAILABLE: "The service is temporarily unavailable. Please try again.",
  CONFLICT: "This was already handled. Please refresh and try again.",
  NOT_FOUND: "This no longer exists. Please refresh.",
  INTERNAL: GENERIC_CLIENT_MESSAGE,
};

function normalizeRetryAfter(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seconds = Math.ceil(value);
  if (seconds <= 0) return null;
  return Math.min(seconds, 3600);
}

/** Parse any API error body; unknown → generic fallback (never null). */
export function parseApiError(body: unknown, fallback = GENERIC_CLIENT_MESSAGE): ParsedApiError {
  if (!body || typeof body !== "object") {
    return { code: null, message: fallback, retryable: false, details: {}, upgradeTo: null, retryAfterSeconds: null };
  }
  const record = body as Record<string, unknown>;
  const serverMessage = typeof record.error === "string" && record.error.length > 0 ? record.error : null;
  // Legacy UPGRADE_REQUIRED compat: { code: "UPGRADE_REQUIRED", reason, upgradeTo }.
  if (record.code === "UPGRADE_REQUIRED") {
    const reason = typeof record.reason === "string" && record.reason.length > 0 ? record.reason : serverMessage;
    const upgradeTo = typeof record.upgradeTo === "string" ? record.upgradeTo : null;
    const details: Record<string, unknown> = {};
    if (upgradeTo) details.upgradeTo = upgradeTo;
    return {
      code: "ENTITLEMENT_DENIED",
      message: reason ?? CODE_MESSAGES.ENTITLEMENT_DENIED,
      retryable: false,
      details,
      upgradeTo,
      retryAfterSeconds: null,
    };
  }
  const code = isErrorCode(record.code) ? record.code : null;
  const details =
    record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : {};
  const upgradeTo = typeof details.upgradeTo === "string" ? details.upgradeTo : null;
  const retryAfterSeconds =
    normalizeRetryAfter(details.retryAfterSeconds) ?? normalizeRetryAfter(record.retryAfterSeconds);
  const retryable = record.retryable === true || code === "RATE_LIMITED";
  // Server user-safe message wins when present (validation/entitlement/
  // provider semantics); otherwise the code dictionary; otherwise fallback.
  const message = serverMessage ?? (code ? CODE_MESSAGES[code] : fallback);
  return { code, message, retryable, details, upgradeTo, retryAfterSeconds };
}

/** Human text for a code without a server message. */
export function getErrorText(code: ErrorCode | null, fallback = GENERIC_CLIENT_MESSAGE): string {
  if (!code) return fallback;
  return CODE_MESSAGES[code] ?? fallback;
}

/** Substring fallback for OTP verify errors (better-auth messages, no codes). */
export function mapOtpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("expired")) return "This code has expired. Request a new one below.";
  if (lower.includes("too many") || lower.includes("attempt")) {
    return "Too many wrong attempts. Request a new code below.";
  }
  if (lower.includes("invalid") || lower.includes("incorrect")) {
    return "Incorrect code. Check the email and try again.";
  }
  if (lower.includes("not found") || lower.includes("no account")) {
    return "This code doesn't match an account. Start again from sign up or sign in.";
  }
  return "Unable to verify the code. Check it and try again.";
}
