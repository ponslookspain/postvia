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
  cronTickBudgetMs,
  functionMaxDurationMs,
  HOBBY_FUNCTION_MAX_DURATION_MS,
  SCHEDULE_TICK_BATCH,
  scheduleTickConcurrency,
  STALE_PUBLISHING_MS,
  STALE_RECOVERY_BATCH,
} from "../src/lib/scheduling";

/**
 * The real platform ceiling. VERIFIED 2026-09-17: this project is on the
 * Vercel Hobby plan, where an invocation is capped at 60s regardless of what
 * `export const maxDuration` claims.
 */
const CRON_MAX_DURATION_MS = HOBBY_FUNCTION_MAX_DURATION_MS;

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
      cronTickBudgetMs() < interval,
      `tick budget ${cronTickBudgetMs()}ms must fit inside the ${interval}ms ` +
        `cron interval, otherwise every tick overlaps its successor by design`
    );
  });

  test("the cron interval never drops below the function ceiling", () => {
    const { schedule } = (readVercelConfig().crons ?? [])[0];
    const interval = minCronIntervalMs(schedule);
    assert.ok(
      interval >= CRON_MAX_DURATION_MS,
      `a ${interval}ms interval is shorter than the ${CRON_MAX_DURATION_MS}ms ` +
        `function ceiling, so ticks would pile up faster than they can finish`
    );
  });

  test("Hobby allows only a daily cron, so the schedule must stay daily", () => {
    // VERIFIED 2026-09-17: the Vercel plan is Hobby, which permits one cron
    // invocation per day. A tighter schedule is rejected at deploy time — the
    // audit's `*/5` recommendation is blocked on a plan upgrade, not on code.
    const { schedule } = (readVercelConfig().crons ?? [])[0];
    assert.equal(
      minCronIntervalMs(schedule),
      86_400_000,
      "Hobby permits one cron per day; tightening this needs a paid plan first"
    );
  });
});

describe("the tick budget must actually be able to fire", () => {
  /**
   * The budget was 240_000 against a 60s ceiling — four times the wall the
   * function hits — so it could never stop the loop. The invocation was
   * killed mid-publish instead of finishing gracefully, stranding every post
   * it had already claimed in PUBLISHING until a later tick recovered them.
   */
  test("the budget is strictly inside the function ceiling", () => {
    assert.ok(
      cronTickBudgetMs() < functionMaxDurationMs(),
      `a ${cronTickBudgetMs()}ms budget against a ${functionMaxDurationMs()}ms ` +
        `ceiling can never fire — the function dies first`
    );
  });

  test("the budget leaves headroom for in-flight work to settle", () => {
    const headroom = functionMaxDurationMs() - cronTickBudgetMs();
    assert.ok(
      headroom >= 10_000,
      `only ${headroom}ms left after the budget; the last chunk plus the ` +
        `retention sweeps need room to finish`
    );
  });

  test("the budget follows the ceiling when the plan changes", () => {
    // One env var moves everything, so a plan upgrade cannot leave the budget
    // pinned to the old ceiling.
    assert.equal(functionMaxDurationMs({ FUNCTION_MAX_DURATION_MS: "300000" }), 300_000);
    assert.ok(
      cronTickBudgetMs({ FUNCTION_MAX_DURATION_MS: "300000" }) > cronTickBudgetMs({}),
      "raising the ceiling must raise the budget"
    );
  });

  test("a malformed override falls back to the verified Hobby ceiling", () => {
    for (const bad of ["", "abc", "-1", "0", undefined]) {
      assert.equal(
        functionMaxDurationMs({ FUNCTION_MAX_DURATION_MS: bad }),
        HOBBY_FUNCTION_MAX_DURATION_MS
      );
    }
  });

  test("the declared maxDuration matches the verified ceiling", () => {
    // Declaring 300 on Hobby is silently clamped, which made every timeout
    // comment in these routes wrong. Keep the source honest.
    for (const route of [
      "../src/app/api/cron/publish-scheduled/route.ts",
      "../src/app/api/posts/[id]/publish/route.ts",
      "../src/app/api/posts/[id]/retry/route.ts",
    ]) {
      const source = readFileSync(new URL(route, import.meta.url), "utf8");
      const match = /export const maxDuration = (\d+)/.exec(source);
      assert.ok(match, `${route} declares no maxDuration`);
      assert.equal(
        Number(match[1]) * 1000,
        functionMaxDurationMs(),
        `${route} declares a ceiling the platform will not honour`
      );
    }
  });
});

describe("tick concurrency bounds", () => {
  test("the default is bounded and positive", () => {
    assert.ok(Number.isInteger(scheduleTickConcurrency()));
    assert.ok(scheduleTickConcurrency() > 0);
    assert.ok(
      scheduleTickConcurrency() <= 16,
      "each post fans out again across its targets; keep the multiplier sane"
    );
  });

  test("concurrency can never exceed the read batch", () => {
    assert.ok(scheduleTickConcurrency() <= SCHEDULE_TICK_BATCH);
  });

  test("a malformed override falls back to the default", () => {
    for (const bad of ["", "abc", "0", "-3", "2.5", undefined]) {
      assert.equal(
        scheduleTickConcurrency({ SCHEDULE_TICK_CONCURRENCY: bad }),
        scheduleTickConcurrency({})
      );
    }
  });

  test("a valid override is honoured", () => {
    assert.equal(scheduleTickConcurrency({ SCHEDULE_TICK_CONCURRENCY: "8" }), 8);
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
