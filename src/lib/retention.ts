import { prisma } from "@/lib/prisma";

/**
 * Time-based retention for append-only operational tables (E5).
 *
 * These ledgers grow on every webhook delivery (StripeEvent) and every
 * denied free attempt (AbuseEvent) but are never read for hot-path
 * state — StripeEvent duplicates matter only inside Stripe's retry
 * window (days), AbuseEvent rows are telemetry. The sweeps below delete
 * only rows older than the retention horizon and are always invoked
 * best-effort from the cron tick: a retention failure must never fail
 * publishing.
 */

/** Stripe redelivers within days; 30d keeps a wide safety margin. */
export const STRIPE_EVENT_RETENTION_MS = 30 * 86_400_000;

/** Abuse telemetry horizon; matches the email-tombstone TTL thinking. */
export const ABUSE_EVENT_RETENTION_MS = 90 * 86_400_000;

/** Pure cutoff math, unit-testable without a database. */
export function retentionCutoff(nowMs: number, ttlMs: number): Date {
  return new Date(nowMs - ttlMs);
}

export async function sweepStripeEvents(olderThan: Date): Promise<number> {
  const deleted = await prisma.stripeEvent.deleteMany({
    where: { createdAt: { lt: olderThan } },
  });
  return deleted.count;
}

export async function sweepAbuseEvents(olderThan: Date): Promise<number> {
  const deleted = await prisma.abuseEvent.deleteMany({
    where: { createdAt: { lt: olderThan } },
  });
  return deleted.count;
}

/**
 * Grace period applied on top of a bucket's own `resetAt` before it is
 * eligible for deletion.
 *
 * A bucket is dead the moment `resetAt` passes — `rateTakeWithClient`
 * resets an expired row and re-creates a missing one, so removing an expired
 * bucket is safe under either outcome. The grace exists only so the sweep
 * never races a request that is mid-reset, and it is sized to the LONGEST
 * window the app uses (`WRITE_PATH_WINDOW_MS`, 1h) so a swept row is always
 * one that has been dead for at least a full window.
 */
export const RATE_BUCKET_GRACE_MS = 60 * 60_000;

/** Rows removed per statement. Keeps each DELETE short — no long transaction. */
export const RATE_BUCKET_SWEEP_BATCH = 500;

/**
 * Hard ceiling on statements per run, so the sweep always fits the cron tick
 * budget. A backlog larger than batch x maxBatches simply carries to the next
 * invocation — the same contract the orphan-blob sweep already uses.
 */
export const RATE_BUCKET_SWEEP_MAX_BATCHES = 20;

export type RateBucketSweepDeps = {
  /** Deletes at most `limit` buckets expired before `olderThan`; returns how many. */
  deleteExpiredBatch: (olderThan: Date, limit: number) => Promise<number>;
};

const liveRateBucketSweep: RateBucketSweepDeps = {
  deleteExpiredBatch: async (olderThan, limit) => {
    // Select-then-delete instead of a bare deleteMany: Prisma's deleteMany
    // takes no `take`, and an unbounded DELETE over a table that grows with
    // every rate-limited request is exactly the long statement this sweep
    // exists to avoid. The id lookup is served by `@@index([resetAt])`.
    const rows = await prisma.abuseRateBucket.findMany({
      where: { resetAt: { lt: olderThan } },
      select: { id: true },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const deleted = await prisma.abuseRateBucket.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return deleted.count;
  },
};

/**
 * Persistent rate-limit ledger retention.
 *
 * `AbuseRateBucket` gains a row per (scope, key) pair — including per-IP keys
 * across every gated write path — and nothing ever read it again once its
 * window closed. It had the `@@index([resetAt])` a sweep needs but no sweep,
 * so it grew without bound. This closes that gap using the same best-effort,
 * capped, idempotent contract as the sweeps above: safe to run repeatedly,
 * never touches a live bucket, never holds a long statement.
 */
export async function sweepRateBuckets(
  olderThan: Date,
  deps: RateBucketSweepDeps = liveRateBucketSweep,
  options: { batchSize?: number; maxBatches?: number } = {}
): Promise<number> {
  const batchSize = options.batchSize ?? RATE_BUCKET_SWEEP_BATCH;
  const maxBatches = options.maxBatches ?? RATE_BUCKET_SWEEP_MAX_BATCHES;
  let removed = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const deleted = await deps.deleteExpiredBatch(olderThan, batchSize);
    removed += deleted;
    // A short batch proves the backlog is drained; stop instead of issuing
    // a guaranteed-empty extra statement.
    if (deleted < batchSize) break;
  }
  return removed;
}
