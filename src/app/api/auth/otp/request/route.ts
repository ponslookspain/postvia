import { NextRequest, NextResponse } from "next/server";
import { requestOtp, type OtpMode } from "@/lib/otp";
import { logErrorDiagnostic } from "@/lib/diagnostics";

/**
 * POST /api/auth/otp/request { email, mode: "signup" | "login", plan? }
 *
 * Always-neutral success for valid emails (no enumeration oracle).
 * - signup: creates the User when missing (Variant A), then sends the
 *   email-verification OTP. Never duplicates an existing email.
 * - login: sends the sign-in OTP only for existing users; unknown emails
 *   get the same `{ ok: true }` without any send. Never creates a User.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const mode: OtpMode = body?.mode === "login" ? "login" : "signup";
    const result = await requestOtp({
      email: body?.email,
      mode,
      planHint: body?.plan,
    });
    if (!result.ok) {
      const body: Record<string, unknown> = { error: result.error };
      if (result.code) body.code = result.code;
      if (typeof result.retryAfterSeconds === "number") {
        body.retryAfterSeconds = result.retryAfterSeconds;
      }
      const response = NextResponse.json(body, { status: result.status });
      // HTTP semantics for 429: Retry-After in seconds (real remaining
      // wait, not a static value). Applies only to this OTP endpoint.
      if (result.status === 429 && typeof result.retryAfterSeconds === "number") {
        response.headers.set("Retry-After", String(result.retryAfterSeconds));
      }
      return response;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logErrorDiagnostic("auth", "otp request failed", err);
    return NextResponse.json(
      { error: "Failed to send code. Please try again." },
      { status: 500 }
    );
  }
}
