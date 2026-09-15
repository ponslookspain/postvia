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
