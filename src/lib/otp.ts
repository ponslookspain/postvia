/**
 * OTP request orchestration (server-only).
 *
 * Pure helpers (email normalize/validate, error mapping) are deliberately
 * dependency-free so unit tests can import them without Better Auth.
 * The `requestOtp` server function implements Variant A (user created
 * before OTP) with anti-abuse parity to the link flow:
 * disposable-block, identity resolution, persistent rate buckets.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canonicalizeEmail,
  checkAbuseRateDetailed,
  emailSignal,
  getAbusePepper,
  hashRateKey,
  isDisposableEmail,
  liveAbuseStores,
  resolveAbuseIdentity,
} from "@/lib/abuse";
import { logErrorDiagnostic } from "@/lib/diagnostics";
import { reportError } from "@/lib/diagnostics";
import { EmailNotConfiguredError, isEmailConfigured } from "@/lib/email";
import { parsePlanParam } from "@/lib/plans";
import {
  OTP_SEND_COOLDOWN_SECONDS,
  OTP_SEND_IP_MAX_PER_HOUR,
  OTP_SEND_MAX_PER_HOUR,
} from "@/lib/otp-config";
import { OTP_RATE_LIMITED_CODE } from "@/lib/otp-rate-limit";

export type OtpMode = "signup" | "login";
export type OtpSendType = "email-verification" | "sign-in";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase + trim. Canonicalization for identity lives in abuse.ts. */
export function normalizeOtpEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidOtpEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function otpModeToSendType(mode: OtpMode): OtpSendType {
  return mode === "signup" ? "email-verification" : "sign-in";
}

/**
 * Server-side plan-hint mapping (?plan= -> User.selectedPlan). Pure and
 * total: unknown hints map to undefined (no intent recorded). Never throws.
 */
export function planHintToDb(planHint: unknown): "GROWTH" | "SCALE" | "FREE" | undefined {
  const planId = parsePlanParam(planHint);
  if (planId === "growth") return "GROWTH";
  if (planId === "scale") return "SCALE";
  if (planId === "free") return "FREE";
  return undefined;
}

/**
 * Single canonical definition lives in `@/lib/otp-rate-limit` (server-safe,
 * shared with client components). Imported above for local use and
 * re-exported here so server code keeps importing from this module; both
 * names resolve to the same value.
 */
export { OTP_RATE_LIMITED_CODE };

/**
 * Latest-safe wait across denied buckets (pure, testable).
 * Each entry is one scope's detailed gate result; allowed scopes
 * contribute 0. Returns >= 1 whenever any scope denied, 0 otherwise.
 */
export function maxDeniedRetryAfterSeconds(
  results: ReadonlyArray<{ allowed: boolean; retryAfterSeconds: number }>
): number {
  let peak = 0;
  for (const result of results) {
    if (!result.allowed && Number.isFinite(result.retryAfterSeconds)) {
      peak = Math.max(peak, Math.ceil(result.retryAfterSeconds));
    }
  }
  return peak <= 0 ? (results.some((r) => !r.allowed) ? 1 : 0) : peak;
}

export type OtpRequestResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      status: 400 | 429 | 500;
      code?: typeof OTP_RATE_LIMITED_CODE;
      retryAfterSeconds?: number;
    };

/**
 * Request a one-time code. ALWAYS returns `{ ok: true }` for valid emails,
 * whether or not an account exists (no enumeration oracle).
 *
 * - signup: creates the User first (Variant A) when missing, then sends
 *   `email-verification` OTP. Never creates a second User for an
 *   existing email (unique lookup first).
 * - login: sends `sign-in` OTP only when the User exists; otherwise returns
 *   ok without sending. NEVER creates a User here (takeover guard).
 */
export async function requestOtp(input: {
  email: string;
  mode: OtpMode;
  planHint?: unknown;
  /**
   * Validated caller IP (first XFF entry / x-real-ip, shape-checked by
   * getClientIp). Optional so existing callers/tests keep working; when
   * absent only the per-email buckets apply. Never trusted for identity —
   * rate bucket only, and a spoofed value can at most shift buckets.
   */
  ip?: string | null;
}): Promise<OtpRequestResult> {
  const email = normalizeOtpEmail(input.email);
  if (!isValidOtpEmail(email)) {
    return { ok: false, error: "Please enter a valid email address", status: 400 };
  }
  if (isDisposableEmail(email)) {
    // Same bar as registration (auth.ts user.create.before): refuse before
    // any row or code exists. 400 (not neutral) matches existing UX.
    return {
      ok: false,
      error: "Disposable email addresses are not supported",
      status: 400,
    };
  }

  // Fail fast when no mail provider is configured: never burn rate quota,
  // never create a User, and never report success when no code can be sent.
  // Production keeps its hard failure; local dev gets an actionable message.
  if (!isEmailConfigured()) {
    const local =
      process.env.NODE_ENV !== "production" &&
      process.env.VERCEL_ENV !== "production";
    return {
      ok: false,
      error: new EmailNotConfiguredError(local).message,
      status: 500,
    };
  }

  // Persistent per-email buckets (hashed, never raw PII): cooldown + hourly
  // cap, plus a roomy per-IP hourly cap against email rotation from one
  // source. Fail-open with a log line — abuse bookkeeping must not block
  // legitimate mail, same discipline as resend-verification.
  try {
    const pepper = getAbusePepper();
    const hourKey = hashRateKey(["otp-send", email], pepper);
    const coolKey = hashRateKey(["otp-send-cool", email], pepper);
    const checks = [
      checkAbuseRateDetailed({
        scope: "otp-send",
        keyHash: hourKey,
        max: OTP_SEND_MAX_PER_HOUR,
        windowMs: 60 * 60_000,
        stores: liveAbuseStores,
      }),
      checkAbuseRateDetailed({
        scope: "otp-send-cool",
        keyHash: coolKey,
        max: 1,
        windowMs: OTP_SEND_COOLDOWN_SECONDS * 1000,
        stores: liveAbuseStores,
      }),
    ];
    if (input.ip) {
      checks.push(
        checkAbuseRateDetailed({
          scope: "otp-send-ip",
          keyHash: hashRateKey(["otp-send-ip", input.ip], pepper),
          max: OTP_SEND_IP_MAX_PER_HOUR,
          windowMs: 60 * 60_000,
          stores: liveAbuseStores,
        })
      );
    }
    const results = await Promise.all(checks);
    if (results.some((r) => !r.allowed)) {
      // Real remaining wait: latest-safe of the denied buckets.
      // Hourly cap yields up to ~3600s; cooldown yields up to 60s.
      const retryAfterSeconds = maxDeniedRetryAfterSeconds(results);
      return {
        ok: false,
        error: "Too many codes requested. Please wait a minute and try again.",
        status: 429,
        code: OTP_RATE_LIMITED_CODE,
        retryAfterSeconds,
      };
    }
  } catch (error) {
    logErrorDiagnostic("abuse", "otp-send rate gate failed", error);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (input.mode === "signup" && !existing) {
    // Variant A: the row exists before the code, so tombstone inheritance,
    // identity resolution and the email uniqueness race-guard (P2002) all
    // behave exactly like the current link signup.
    const selectedPlan = planHintToDb(input.planHint);
    try {
      const created = await prisma.user.create({
        data: {
          email,
          // Name is collected in onboarding; empty until then.
          name: "",
          emailVerified: false,
          onboardingCompleted: false,
          selectedPlan,
        },
        select: { id: true },
      });
      // Mirror trackNewUser (databaseHooks don't fire on direct creates).
      try {
        const pepper = getAbusePepper();
        await resolveAbuseIdentity({
          userId: created.id,
          signals: [emailSignal(email, pepper)],
          stores: liveAbuseStores,
        });
      } catch (error) {
        reportError("abuse", "otp signup identity resolution failed", error, {
          userId: created.id,
        });
      }
    } catch (error: unknown) {
      // Concurrent double-submit: unique race resolves to the single row.
      // Re-read; if it exists now, continue to send (exactly one winner).
      const raced = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!raced) {
        logErrorDiagnostic("auth", "otp signup user creation failed", error);
        return { ok: false, error: "Failed to start sign-up", status: 400 };
      }
    }
  }

  if (input.mode === "login") {
    const user = existing ??
      (await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }));
    if (!user) {
      // Neutral success: no account, no code, no oracle. The plugin would
      // do the same (disableSignUp), but we skip the send entirely.
      return { ok: true };
    }
  }

  try {
    await auth.api.sendVerificationOTP({
      body: { email, type: otpModeToSendType(input.mode) },
      headers: await headers(),
    });
  } catch (error) {
    // Never log the address (PII). A config error (key removed mid-flight)
    // keeps its explicit message; everything else stays generic.
    logErrorDiagnostic("auth", "otp send failed", error);
    if (error instanceof EmailNotConfiguredError) {
      return { ok: false, error: error.message, status: 500 };
    }
    return { ok: false, error: "Failed to send code. Please try again.", status: 400 };
  }
  return { ok: true };
}

/** Canonicalize helper re-export for routes that need identity-safe email. */
export { canonicalizeEmail };
