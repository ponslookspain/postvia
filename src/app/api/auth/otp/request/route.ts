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
      return NextResponse.json({ error: result.error }, { status: result.status });
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
