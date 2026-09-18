import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ABUSE_EVENT_RETENTION_MS,
  RATE_BUCKET_GRACE_MS,
  RATE_BUCKET_SWEEP_BATCH,
  RATE_BUCKET_SWEEP_MAX_BATCHES,
  retentionCutoff,
  STRIPE_EVENT_RETENTION_MS,
  sweepRateBuckets,
} from "../src/lib/retention";
import { WRITE_PATH_WINDOW_MS } from "../src/lib/abuse";

/**
 * Retention horizons (E5): pure cutoff math only — the deleteMany calls
 * themselves run best-effort inside the cron tick against real tables,
 * never in unit tests.
 */
describe("retentionCutoff", () => {
  test("subtracts the TTL from now", () => {
    const now = new Date("2026-09-15T12:00:00Z").getTime();
    assert.deepEqual(
      retentionCutoff(now, 30 * 86_400_000),
      new Date("2026-08-16T12:00:00Z")
    );
  });

  test("horizons match the documented contracts", () => {
    assert.equal(STRIPE_EVENT_RETENTION_MS, 30 * 86_400_000);
    assert.equal(ABUSE_EVENT_RETENTION_MS, 90 * 86_400_000);
  });
});

/**
 * Rate-bucket retention (P1.1). The ledger is swept through an injected
 * batch-delete so the batching/idempotency contract is testable without a
 * database; the live implementation is a select-then-delete over
 * `@@index([resetAt])`.
 */
describe("sweepRateBuckets", () => {
  /** In-memory stand-in for the AbuseRateBucket table. */
  function fakeLedger(resetAts: Date[]) {
    let rows = resetAts.map((resetAt, i) => ({ id: `b${i}`, resetAt }));
    const statements: number[] = [];
    return {
      get rows() {
        return rows;
      },
      statements,
      deps: {
        deleteExpiredBatch: async (olderThan: Date, limit: number) => {
          const doomed = rows
            .filter((row) => row.resetAt < olderThan)
            .slice(0, limit);
          statements.push(doomed.length);
          const ids = new Set(doomed.map((row) => row.id));
          rows = rows.filter((row) => !ids.has(row.id));
          return doomed.length;
        },
      },
    };
  }

  const NOW = new Date("2026-09-17T12:00:00Z");
  const cutoff = retentionCutoff(NOW.getTime(), RATE_BUCKET_GRACE_MS);
  const expired = new Date(NOW.getTime() - 3 * 60 * 60_000);
  const live = new Date(NOW.getTime() + 10 * 60_000);
  /** Already past resetAt, but still inside the grace window. */
  const recentlyExpired = new Date(NOW.getTime() - 5 * 60_000);

  test("deletes expired buckets and leaves live ones untouched", async () => {
    const ledger = fakeLedger([expired, live, expired, live]);

    const removed = await sweepRateBuckets(cutoff, ledger.deps);

    assert.equal(removed, 2);
    assert.deepEqual(
      ledger.rows.map((row) => row.resetAt),
      [live, live],
      "only live buckets survive"
    );
  });

  test("a bucket inside the grace window is never swept", async () => {
    const ledger = fakeLedger([recentlyExpired]);

    const removed = await sweepRateBuckets(cutoff, ledger.deps);

    assert.equal(removed, 0, "grace protects a bucket mid-reset");
    assert.equal(ledger.rows.length, 1);
  });

  test("is idempotent: a second run removes nothing", async () => {
    const ledger = fakeLedger([expired, expired, live]);

    const first = await sweepRateBuckets(cutoff, ledger.deps);
    const second = await sweepRateBuckets(cutoff, ledger.deps);

    assert.equal(first, 2);
    assert.equal(second, 0);
    assert.equal(ledger.rows.length, 1);
  });

  test("deletes in bounded batches rather than one unbounded statement", async () => {
    const ledger = fakeLedger(Array.from({ length: 7 }, () => expired));

    const removed = await sweepRateBuckets(cutoff, ledger.deps, {
      batchSize: 3,
    });

    assert.equal(removed, 7);
    assert.deepEqual(
      ledger.statements,
      [3, 3, 1],
      "three short statements, stopping on the short batch"
    );
  });

  test("caps statements per run so a backlog carries to the next tick", async () => {
    const ledger = fakeLedger(Array.from({ length: 100 }, () => expired));

    const removed = await sweepRateBuckets(cutoff, ledger.deps, {
      batchSize: 10,
      maxBatches: 3,
    });

    assert.equal(removed, 30, "one run never drains more than the cap");
    assert.equal(ledger.rows.length, 70, "the rest wait for the next invocation");
  });

  test("an empty ledger issues exactly one statement", async () => {
    const ledger = fakeLedger([]);

    const removed = await sweepRateBuckets(cutoff, ledger.deps);

    assert.equal(removed, 0);
    assert.deepEqual(ledger.statements, [0]);
  });

  test("the grace window covers the longest rate-limit window in use", () => {
    assert.ok(
      RATE_BUCKET_GRACE_MS >= WRITE_PATH_WINDOW_MS,
      "a swept bucket must have been dead for at least one full window"
    );
    assert.ok(RATE_BUCKET_SWEEP_BATCH > 0);
    assert.ok(RATE_BUCKET_SWEEP_MAX_BATCHES > 0);
  });
});
