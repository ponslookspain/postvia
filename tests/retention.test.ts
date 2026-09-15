import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ABUSE_EVENT_RETENTION_MS,
  retentionCutoff,
  STRIPE_EVENT_RETENTION_MS,
} from "../src/lib/retention";

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
