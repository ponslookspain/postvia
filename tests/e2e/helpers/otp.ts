import { APIRequestContext, expect } from "@playwright/test";
import { debugToken, e2eBaseUrl, isOtpDebugConfigured } from "./env";

/**
 * OTP helpers for the single real UI OTP spec (auth.otp.spec.ts).
 * Reuses the existing triple-gated `POST /api/auth/otp/debug` endpoint —
 * no new auth/debug mechanism, no production weakening.
 *
 * NOTE (documented limitation): `POST /api/auth/otp/request` returns
 * 4xx/5xx when no working RESEND_API_KEY is configured (OTP never reports
 * success when nothing is sent). With a dummy key the spec skips itself
 * with an explicit message; the full UI OTP flow then runs as local E2E
 * (see docs/e2e.md). This is intentional, not a workaround.
 */

export async function requestSignupOtp(
  api: APIRequestContext,
  email: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await api.post("/api/auth/otp/request", {
    data: { email, mode: "signup" },
  });
  return { ok: res.ok(), status: res.status(), body: await res.text() };
}

export async function readDebugOtp(
  api: APIRequestContext,
  email: string,
  type: "email-verification" | "sign-in" = "email-verification"
): Promise<string | null> {
  const baseURL = e2eBaseUrl();
  void baseURL;
  const res = await api.post("/api/auth/otp/debug", {
    headers: { Authorization: `Bearer ${debugToken()}` },
    data: { email, type },
  });
  if (!res.ok()) return null;
  const data = (await res.json().catch(() => ({}))) as { otp?: string | null };
  return typeof data.otp === "string" && /^\d{6}$/.test(data.otp) ? data.otp : null;
}

/**
 * Returns true when the runner can perform a real OTP send. When false the
 * caller must `test.skip()` with the returned reason (documented in
 * docs/e2e.md: UI-OTP is local-only without a valid RESEND_API_KEY).
 */
export function otpUiPrecondition(): { ready: boolean; reason: string } {
  if (!isOtpDebugConfigured()) {
    return {
      ready: false,
      reason:
        "OTP UI E2E needs OTP_E2E_DEBUG=1 + OTP_DEBUG_TOKEN (local `next dev` only). Skipping.",
    };
  }
  return { ready: true, reason: "" };
}

export async function expectValidTestSetup(): Promise<void> {
  expect(isOtpDebugConfigured()).toBeTruthy();
}
