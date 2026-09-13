import { NextRequest, NextResponse } from "next/server";
import {
  checkAbuseRate,
  getAbusePepper,
  hashRateKey,
  liveAbuseStores,
} from "@/lib/abuse";
import { logErrorDiagnostic } from "@/lib/diagnostics";
import { normalizeOtpEmail, isValidOtpEmail } from "@/lib/otp";
import {
  OTP_VERIFY_MAX_PER_WINDOW,
  OTP_VERIFY_WINDOW_MS,
} from "@/lib/otp-config";

/**
 * POST /api/auth/otp/pre-verify { email }
 *
 * Outer verify-attempt shell (defense in depth): at most 20 verify attempts
 * per email-hash per 10 minutes. The authoritative guard stays inside the
 * plugin (5 wrong codes invalidate the code); this bucket additionally
 * slows distributed guessing across rotated codes. Fail-open like all
 * abuse bookkeeping.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = normalizeOtpEmail(body?.email);
    if (!isValidOtpEmail(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    let allowed = true;
    try {
      const pepper = getAbusePepper();
      allowed = await checkAbuseRate({
        scope: "otp-verify",
        keyHash: hashRateKey(["otp-verify", email], pepper),
        max: OTP_VERIFY_MAX_PER_WINDOW,
        windowMs: OTP_VERIFY_WINDOW_MS,
        stores: liveAbuseStores,
      });
    } catch (error) {
      logErrorDiagnostic("abuse", "otp-verify rate gate failed", error);
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new code and try again later." },
        { status: 429 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logErrorDiagnostic("auth", "otp pre-verify failed", err);
    return NextResponse.json({ ok: true });
  }
}
