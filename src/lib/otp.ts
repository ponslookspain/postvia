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
  checkAbuseRate,
  emailSignal,
  getAbusePepper,
  hashRateKey,
  isDisposableEmail,
  liveAbuseStores,
  resolveAbuseIdentity,
} from "@/lib/abuse";
import { logErrorDiagnostic } from "@/lib/diagnostics";
import { reportError } from "@/lib/diagnostics";
import { parsePlanParam } from "@/lib/plans";
import {
  OTP_SEND_COOLDOWN_SECONDS,
  OTP_SEND_MAX_PER_HOUR,
} from "@/lib/otp-config";

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

export type OtpRequestResult =
  | { ok: true }
  | { ok: false; error: string; status: 400 | 429 };

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

  // Persistent per-email buckets (hashed, never raw PII): cooldown + hourly
  // cap. Fail-open with a log line — abuse bookkeeping must not block
  // legitimate mail, same discipline as resend-verification.
  try {
    const pepper = getAbusePepper();
    const hourKey = hashRateKey(["otp-send", email], pepper);
    const coolKey = hashRateKey(["otp-send-cool", email], pepper);
    const [hourOk, coolOk] = await Promise.all([
      checkAbuseRate({
        scope: "otp-send",
        keyHash: hourKey,
        max: OTP_SEND_MAX_PER_HOUR,
        windowMs: 60 * 60_000,
        stores: liveAbuseStores,
      }),
      checkAbuseRate({
        scope: "otp-send-cool",
        keyHash: coolKey,
        max: 1,
        windowMs: OTP_SEND_COOLDOWN_SECONDS * 1000,
        stores: liveAbuseStores,
      }),
    ]);
    if (!hourOk || !coolOk) {
      return {
        ok: false,
        error: "Too many codes requested. Please wait a minute and try again.",
        status: 429,
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
    // Never log the address (PII). Surface a generic failure.
    logErrorDiagnostic("auth", "otp send failed", error);
    return { ok: false, error: "Failed to send code. Please try again.", status: 400 };
  }
  return { ok: true };
}

/** Canonicalize helper re-export for routes that need identity-safe email. */
export { canonicalizeEmail };
