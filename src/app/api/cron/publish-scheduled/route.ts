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
  retentionCutoff,
  STRIPE_EVENT_RETENTION_MS,
  sweepAbuseEvents,
  sweepStripeEvents,
} from "@/lib/retention";
import {
  runScheduledPublishTick,
  withCron,
  type SchedulingDb,
} from "@/lib/scheduling";

// One scheduled video publish can poll Meta's container for up to ~4
// minutes; the tick stops claiming new posts at the internal budget
// (CRON_TICK_BUDGET_MS) and the rest wait for the next invocation.
export const maxDuration = 300;

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
  return NextResponse.json({
    ok: true,
    ...stats,
    orphans,
    tombstones,
    stripeEvents,
    abuseEvents,
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
