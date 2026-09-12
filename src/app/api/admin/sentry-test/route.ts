import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getApiUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/entitlements";

/**
 * TEMPORARY production Sentry verification endpoint. Deleted after the
 * production check — do not build on it.
 *
 * Admin-only (server-side gate, same as billing-override). Sends one fixed
 * synthetic error with no user data, no secrets and no request-derived
 * content, flushes the SDK, and echoes the delivery proof. POST only so
 * navigation/prefetch can never fire it.
 */
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST() {
  const user = await getApiUser();
  if (!user || !isAdminEmail(user.email)) return forbidden();

  if (!process.env.SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, reason: "SENTRY_DSN is not configured" },
      { status: 503 }
    );
  }

  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  const eventId = Sentry.captureException(
    new Error("Sentry production test"),
    { tags: { purpose: "sentry-production-test" } }
  );
  const flushed = await Sentry.flush(2000);
  return NextResponse.json({ ok: true, eventId, flushed, environment });
}
