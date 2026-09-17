/**
 * Cron cadence safety invariants (P0.1).
 *
 * The scheduler's correctness does not depend on HOW OFTEN the cron fires,
 * but it does depend on a few relationships between the cron interval and the
 * scheduler's own constants. This suite pins those relationships so the
 * schedule in `vercel.json` can be tightened (the audit's top recommendation:
 * from daily to every five minutes) without re-deriving the safety argument
 * by hand — and so nobody can tighten it PAST the point where it stays safe.
 *
 * Deliberately NOT asserted here: which Vercel plan is active. That is not
 * knowable from the repository (see docs/DATABASE_POOLING.md and
 * docs/backend-audit-followup.md) and a test must not encode a guess.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CRON_TICK_BUDGET_MS,
  SCHEDULE_TICK_BATCH,
  STALE_PUBLISHING_MS,
  STALE_RECOVERY_BATCH,
} from "../src/lib/scheduling";

/** The platform ceiling declared by `export const maxDuration` on the cron route. */
const CRON_MAX_DURATION_MS = 300_000;

type VercelConfig = { crons?: { path: string; schedule: string }[] };

function readVercelConfig(): VercelConfig {
  return JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
  ) as VercelConfig;
}

/**
 * Minimum gap between two firings of a 5-field cron expression, in ms.
 * Only the shapes this project uses are supported: a wildcard, a step
 * ("every n"), or a literal in the minute/hour fields. Anything else throws
 * rather than guessing.
 */
export function minCronIntervalMs(schedule: string): number {
  const fields = schedule.trim().split(/\s+/);
  assert.equal(fields.length, 5, `unsupported cron arity: "${schedule}"`);
  const [minute, hour, dom, month, dow] = fields;

  const step = (field: string): number | null => {
    const match = /^\*\/(\d+)$/.exec(field);
    return match ? Number(match[1]) : null;
  };

  if (minute === "*") return 60_000;
  const minuteStep = step(minute);
  if (minuteStep !== null) return minuteStep * 60_000;

  // A literal minute: the cadence is then driven by the hour field.
  assert.match(minute, /^\d+$/, `unsupported minute field: "${minute}"`);
  if (hour === "*") return 3_600_000;
  const hourStep = step(hour);
  if (hourStep !== null) return hourStep * 3_600_000;
  assert.match(hour, /^\d+$/, `unsupported hour field: "${hour}"`);

  // Literal minute + literal hour → at most daily (this project never
  // narrows day-of-month/month/day-of-week).
  assert.equal(`${dom} ${month} ${dow}`, "* * *", `unsupported date fields`);
  return 86_400_000;
}

describe("minCronIntervalMs", () => {
  test("parses the shapes this project uses", () => {
    assert.equal(minCronIntervalMs("* * * * *"), 60_000);
    assert.equal(minCronIntervalMs("*/5 * * * *"), 300_000);
    assert.equal(minCronIntervalMs("*/15 * * * *"), 900_000);
    assert.equal(minCronIntervalMs("0 * * * *"), 3_600_000);
    assert.equal(minCronIntervalMs("0 */6 * * *"), 21_600_000);
    assert.equal(minCronIntervalMs("0 3 * * *"), 86_400_000);
  });

  test("refuses to guess at shapes it does not understand", () => {
    assert.throws(() => minCronIntervalMs("0 3 * *"));
    assert.throws(() => minCronIntervalMs("0,30 3 * * *"));
  });
});

describe("publish cron configuration", () => {
  test("the publish cron is registered exactly once", () => {
    const crons = readVercelConfig().crons ?? [];
    const publish = crons.filter(
      (cron) => cron.path === "/api/cron/publish-scheduled"
    );
    assert.equal(publish.length, 1, "exactly one schedule for the publish tick");
  });

  test("the tick budget fits inside one cron interval", () => {
    const { schedule } = (readVercelConfig().crons ?? [])[0];
    const interval = minCronIntervalMs(schedule);
    assert.ok(
      CRON_TICK_BUDGET_MS < interval,
      `tick budget ${CRON_TICK_BUDGET_MS}ms must fit inside the ${interval}ms ` +
        `cron interval, otherwise every tick overlaps its successor by design`
    );
  });

  test("the cron interval never drops below the function ceiling", () => {
    const { schedule } = (readVercelConfig().crons ?? [])[0];
    const interval = minCronIntervalMs(schedule);
    assert.ok(
      interval >= CRON_MAX_DURATION_MS,
      `a ${interval}ms interval is shorter than the ${CRON_MAX_DURATION_MS}ms ` +
        `maxDuration, so ticks would pile up faster than they can finish`
    );
  });
});

describe("stale-recovery safety is cadence-independent", () => {
  /**
   * The load-bearing invariant. A post is only "stale" once no function can
   * still be working on it, which is a property of maxDuration — NOT of how
   * often the cron fires. This is what makes raising the cadence safe.
   */
  test("the stale cutoff outlives the longest possible publish function", () => {
    assert.ok(
      STALE_PUBLISHING_MS > CRON_MAX_DURATION_MS,
      `STALE_PUBLISHING_MS (${STALE_PUBLISHING_MS}ms) must exceed maxDuration ` +
        `(${CRON_MAX_DURATION_MS}ms) or recovery could reset a LIVE publish ` +
        `and double-post`
    );
  });

  test("a tightened cadence cannot reach the stale cutoff", () => {
    // Even at the tightest schedule the interval test above permits, the
    // recovery pass still cannot touch a post younger than the cutoff.
    assert.ok(
      STALE_PUBLISHING_MS > CRON_MAX_DURATION_MS,
      "recovery eligibility is decided by updatedAt vs the cutoff, never by " +
        "which tick happens to observe the row"
    );
  });
});

describe("tick batching bounds (P0.2)", () => {
  test("batches are positive and bounded", () => {
    assert.ok(SCHEDULE_TICK_BATCH > 0 && Number.isInteger(SCHEDULE_TICK_BATCH));
    assert.ok(STALE_RECOVERY_BATCH > 0 && Number.isInteger(STALE_RECOVERY_BATCH));
  });

  test("the due batch is larger than the recovery batch", () => {
    // Recovery is the rare path; the due path is the steady-state one.
    assert.ok(SCHEDULE_TICK_BATCH >= STALE_RECOVERY_BATCH);
  });
});
