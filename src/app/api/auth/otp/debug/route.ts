import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logErrorDiagnostic } from "@/lib/diagnostics";

/**
 * TEST-ONLY code reader for local automated E2E.
 *
 * Triple-gated: requires OTP_E2E_DEBUG=1 AND a non-Vercel runtime AND a
 * matching OTP_DEBUG_TOKEN bearer. Any Vercel environment (including
 * preview) always 404s — VERCEL_ENV is set on every Vercel build, so its
 * absence proves a local `next dev` runtime. Never set OTP_E2E_DEBUG=1
 * outside local testing.
 */
/**
 * Local-only predicate (exported for tests): the endpoint answers only on
 * a local `next dev` runtime. VERCEL_ENV is set on every Vercel build
 * (development/preview/production), so its absence is the locality proof.
 */
export function isOtpDebugEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    env.OTP_E2E_DEBUG === "1" && !env.VERCEL_ENV && env.NODE_ENV !== "production"
  );
}

function debugEnabled(): boolean {
  return isOtpDebugEnabled();
}

export async function POST(request: NextRequest) {
  if (!debugEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const token = process.env.OTP_DEBUG_TOKEN;
  const authHeader = request.headers.get("authorization") ?? "";
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.toLowerCase() : "";
    const type = body?.type === "sign-in" ? "sign-in" : "email-verification";
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    // Works only when storeOTP is "plain" (local E2E flag); with "hashed"
    // the plugin refuses and we surface null instead of the code.
    const result = await auth.api.getVerificationOTP({
      query: { email, type },
    });
    return NextResponse.json({ otp: result?.otp ?? null });
  } catch (err) {
    logErrorDiagnostic("auth", "otp debug read failed", err);
    return NextResponse.json({ otp: null });
  }
}
