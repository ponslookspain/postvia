import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executePublish, resumeJobTarget } from "@/lib/publish";
import { deleteBlobs, listMediaBlobs } from "@/lib/blob";
import { sweepOrphanBlobs } from "@/lib/media-cleanup";
import { reportError } from "@/lib/diagnostics";
import {
  liveAbuseStores,
  TOMBSTONE_SOCIAL_TTL_MS,
} from "@/lib/abuse";
import {
  ABUSE_EVENT_RETENTION_MS,
  RATE_BUCKET_GRACE_MS,
  retentionCutoff,
  STRIPE_EVENT_RETENTION_MS,
  sweepAbuseEvents,
  sweepRateBuckets,
  sweepStripeEvents,
} from "@/lib/retention";
import {
  runScheduledPublishTick,
  withCron,
  type SchedulingDb,
} from "@/lib/scheduling";

// Vercel Hobby caps an invocation at 60s and clamps anything larger, so this
// declares what actually happens rather than an aspirational 300. The tick
// stops claiming new posts at `cronTickBudgetMs()` (derived from this same
// ceiling) and the rest wait for the next invocation.
//
// On a plan with a higher ceiling, raise this AND set FUNCTION_MAX_DURATION_MS
// so the tick budget follows — see docs/backend-audit-followup.md.
export const maxDuration = 60;

async function handleCron(request: NextRequest): Promise<NextResponse> {
  void request;
  const stats = await runScheduledPublishTick({
    db: prisma as unknown as SchedulingDb,
    publish: executePublish,
    resumeJob: (target) => resumeJobTarget(target.id),
  });
  // Orphan sweep is best-effort and capped: it must never fail the tick.
  let orphans = { scanned: 0, removed: 0, hasMore: false };
  try {
    orphans = await sweepOrphanBlobs({
      listBlobs: (cursor) => listMediaBlobs(cursor),
      findRegistered: async (pathnames) => {
        const rows = await prisma.media.findMany({
          where: { pathname: { in: pathnames } },
          select: { pathname: true },
        });
        return new Set(rows.map((row) => row.pathname));
      },
      removeBlobs: (pathnames) => deleteBlobs(pathnames),
    });
  } catch {
    // Sweep failures are logged inside; the tick result stands.
  }
  // Abuse tombstone retention, same best-effort contract: delete only
  // rows older than the LONGEST tombstone TTL (social, 180d), so no
  // live row of any kind is ever removed. Failures never fail the tick.
  let tombstones = 0;
  try {
    tombstones = await liveAbuseStores.sweepTombstones(
      new Date(Date.now() - TOMBSTONE_SOCIAL_TTL_MS)
    );
  } catch (error) {
    reportError("cron", "tombstone sweep failed", error);
  }
  // Ledger retention, same contract: StripeEvent rows older than the
  // retry horizon and AbuseEvent telemetry older than 90d. A retention
  // failure is reported and skipped — the tick result stands.
  const nowMs = Date.now();
  let stripeEvents = 0;
  try {
    stripeEvents = await sweepStripeEvents(
      retentionCutoff(nowMs, STRIPE_EVENT_RETENTION_MS)
    );
  } catch (error) {
    reportError("cron", "stripe event sweep failed", error);
  }
  let abuseEvents = 0;
  try {
    abuseEvents = await sweepAbuseEvents(
      retentionCutoff(nowMs, ABUSE_EVENT_RETENTION_MS)
    );
  } catch (error) {
    reportError("cron", "abuse event sweep failed", error);
  }
  // Persistent rate-limit buckets: dead once resetAt passes, kept a further
  // grace window so the sweep never races an in-flight reset. Same
  // best-effort contract as the sweeps above — a failure never fails the tick.
  let rateBuckets = 0;
  try {
    rateBuckets = await sweepRateBuckets(
      retentionCutoff(nowMs, RATE_BUCKET_GRACE_MS)
    );
  } catch (error) {
    reportError("cron", "rate bucket sweep failed", error);
  }
  return NextResponse.json({
    ok: true,
    ...stats,
    orphans,
    tombstones,
    stripeEvents,
    abuseEvents,
    rateBuckets,
  });
}

// Vercel Cron invokes the path with GET (Authorization: Bearer CRON_SECRET
// is attached automatically when the CRON_SECRET env var exists); the
// external/manual trigger uses POST. Auth and the generic 500 envelope
// come from withCron — this module owns only the tick work.
const handlers = withCron(handleCron);

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handlers.GET(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handlers.POST(request);
}
