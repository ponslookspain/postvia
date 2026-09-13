import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { logErrorDiagnostic } from "@/lib/diagnostics";
import {
  checkAbuseRate,
  dayKey,
  getAbusePepper,
  hashRateKey,
  liveAbuseStores,
} from "@/lib/abuse";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email =
      typeof body?.email === "string" ? body.email.toLowerCase() : "";
    const callbackURL =
      typeof body?.callbackURL === "string"
        ? body.callbackURL
        : "/verify-email";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    // Persistent, multi-instance bucket keyed by hashed email (never raw
    // PII): 3 resends per 15 minutes. Fail-open with a log line — abuse
    // bookkeeping must not block legitimate verification mail.
    let allowed = true;
    try {
      const pepper = getAbusePepper();
      allowed = await checkAbuseRate({
        scope: "resend",
        keyHash: hashRateKey(["resend", email, dayKey()], pepper),
        max: 3,
        windowMs: 15 * 60_000,
        stores: liveAbuseStores,
      });
    } catch (error) {
      logErrorDiagnostic("abuse", "resend rate gate failed", error);
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes before trying again." },
        { status: 429 }
      );
    }

    await auth.api.sendVerificationEmail({
      body: { email, callbackURL },
      headers: await headers(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never log the recipient address (PII): the failure fact is enough.
    logErrorDiagnostic("auth", "resend-verification failed", err);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
