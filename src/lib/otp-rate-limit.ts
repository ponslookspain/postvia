/**
 * Shared OTP rate-limit UX helpers (client-safe).
 *
 * Dependency-free except React for the countdown hook: never import
 * server modules (abuse.ts, otp.ts, prisma) here. The server remains the
 * sole limiter; these helpers only format and count down the
 * `retryAfterSeconds` the API already returned.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/**
 * Countdown for a server-provided retry delay.
 *
 * - Client convenience only: the next request is still server-gated.
 * - May vanish on page refresh — that is expected.
 * - Returns the live `remaining` plus a `start()` to arm it.
 */
export function useOtpRetryCountdown(): {
  remaining: number;
  start: (seconds: number) => void;
} {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (seconds: number) => {
      const normalized = normalizeRetryAfterSeconds(seconds) ?? 60;
      clear();
      setRemaining(normalized);
      timerRef.current = setInterval(() => {
        setRemaining((current) => {
          if (current <= 1) {
            if (timerRef.current !== null) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);

  return { remaining, start };
}
