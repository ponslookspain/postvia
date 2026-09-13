import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkBulkBatch,
  claimMonthlyQuota,
  createWithMonthlyQuota,
  getPeriodKey,
  parseBulkBatchSize,
  selectPostCount,
  type EffectiveSubscription,
  type QuotaClaimStore,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";

function eff(
  plan: EffectiveSubscription["plan"],
  overrides: Partial<EffectiveSubscription> = {}
): EffectiveSubscription {
  return {
    plan,
    status: "ACTIVE",
    bypass: false,
    source: "subscription",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: getPlan(plan).entitlements,
    ...overrides,
  };
}

const tick = () => new Promise<void>((done) => setImmediate(done));

type Row = { id: string; count: number };

/**
 * In-memory ledger with the same atomicity contract as the Prisma
 * implementation: the limit check and the increment inside
 * incrementIfBelowLimit run synchronously (no await between them), so
 * concurrent claims serialize exactly like row-locked updateMany.
 */
function makeQuotaStore(initial: Row | null = null) {
  let row: Row | null = initial ? { ...initial } : null;
  const calls = { finds: 0, creates: 0, increments: 0 };
  const store: QuotaClaimStore = {
    findUsage: async () => {
      calls.finds += 1;
      await tick();
      return row ? { ...row } : null;
    },
    createUsage: async (_userId, _period, count) => {
      calls.creates += 1;
      await tick();
      if (!row) row = { id: "row-1", count };
      return { ...row };
    },
    incrementIfBelowLimit: async (id, limit) => {
      calls.increments += 1;
      await tick();
      if (!row || row.id !== id || row.count >= limit) return false;
      row = { ...row, count: row.count + 1 };
      return true;
    },
  };
  return { store, calls, get: () => (row ? { ...row } : null) };
}

describe("period key", () => {
  test("UTC calendar months with zero-padded keys", () => {
    assert.equal(getPeriodKey(new Date("2026-01-15T10:00:00Z").getTime()), "2026-01");
    assert.equal(getPeriodKey(new Date("2026-09-01T00:00:00Z").getTime()), "2026-09");
    assert.equal(getPeriodKey(new Date("2026-12-31T23:59:59Z").getTime()), "2026-12");
  });
});

describe("no-refill usage resolution", () => {
  test("persistent counter wins over a lower live count (deleted posts)", () => {
    assert.equal(selectPostCount(15, 9), 15);
    assert.equal(selectPostCount(0, 0), 0);
  });
  test("no counter row falls back to the live count", () => {
    assert.equal(selectPostCount(null, 9), 9);
    assert.equal(selectPostCount(null, 0), 0);
  });
});

describe("bulk batch parsing", () => {
  test("absent means an ordinary create", () => {
    assert.equal(parseBulkBatchSize(undefined), null);
    assert.equal(parseBulkBatchSize(null), null);
  });
  test("positive integers pass through", () => {
    assert.equal(parseBulkBatchSize(1), 1);
    assert.equal(parseBulkBatchSize(10), 10);
  });
  test("anything else is invalid", () => {
    for (const value of [0, -3, 1.5, Number.NaN, "10", true, {}, [10]]) {
      assert.equal(parseBulkBatchSize(value), "invalid");
    }
  });
});

describe("server bulk gate", () => {
  test("free plan cannot attest any batch", () => {
    const gate = checkBulkBatch(eff("free"), 3);
    assert.equal(gate.ok, false);
    assert.ok(gate.ok === false && "denial" in gate);
    if (!gate.ok && "denial" in gate) {
      assert.equal(gate.denial.code, "UPGRADE_REQUIRED");
      assert.equal(gate.denial.upgradeTo, "growth");
    }
  });
  test("growth caps the batch at 10", () => {
    assert.deepEqual(checkBulkBatch(eff("growth"), 10), { ok: true });
    const over = checkBulkBatch(eff("growth"), 11);
    assert.equal(over.ok, false);
  });
  test("scale caps the batch at 10", () => {
    assert.deepEqual(checkBulkBatch(eff("scale"), 10), { ok: true });
    assert.equal(checkBulkBatch(eff("scale"), 11).ok, false);
  });
  test("undeclared creates pass the bulk gate (monthly quota applies)", () => {
    assert.deepEqual(checkBulkBatch(eff("free"), undefined), { ok: true });
    assert.deepEqual(checkBulkBatch(eff("growth"), null), { ok: true });
  });
  test("malformed batch sizes are invalid, not denials", () => {
    const gate = checkBulkBatch(eff("growth"), "10");
    assert.deepEqual(gate, { ok: false, invalid: true });
  });
  test("admin bypass allows any batch", () => {
    assert.deepEqual(
      checkBulkBatch(eff("free", { bypass: true }), 500),
      { ok: true }
    );
  });
});

describe("quota claim", () => {
  test("first claim backfills the row from the live count", async () => {
    const { store, get } = makeQuotaStore(null);
    const claim = await claimMonthlyQuota({
      userId: "u1",
      period: "2026-09",
      limit: 15,
      liveCount: 5,
      store,
    });
    assert.deepEqual(claim, { ok: true });
    assert.deepEqual(get(), { id: "row-1", count: 6 });
  });
  test("denial at the limit reports the observed count and writes nothing", async () => {
    const { store, get, calls } = makeQuotaStore({ id: "row-1", count: 15 });
    const claim = await claimMonthlyQuota({
      userId: "u1",
      period: "2026-09",
      limit: 15,
      liveCount: 15,
      store,
    });
    assert.deepEqual(claim, { ok: false, observed: 15 });
    assert.deepEqual(get(), { id: "row-1", count: 15 });
    assert.equal(calls.creates, 0);
  });
  test("concurrent claims on the last slot grant exactly one winner", async () => {
    const { store, get } = makeQuotaStore({ id: "row-1", count: 14 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        claimMonthlyQuota({
          userId: "u1",
          period: "2026-09",
          limit: 15,
          liveCount: 14,
          store,
        })
      )
    );
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.filter((r) => !r.ok).length, 4);
    assert.deepEqual(get(), { id: "row-1", count: 15 });
  });
  test("concurrent first claims collapse into a single row", async () => {
    const { store, get } = makeQuotaStore(null);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        claimMonthlyQuota({
          userId: "u1",
          period: "2026-09",
          limit: 15,
          liveCount: 0,
          store,
        })
      )
    );
    assert.ok(results.every((r) => r.ok));
    assert.deepEqual(get(), { id: "row-1", count: 3 });
  });
});

describe("creation with quota", () => {
  test("unlimited plans and bypass skip the ledger", async () => {
    for (const input of [
      { limit: null as number | null, bypass: false },
      { limit: 15, bypass: true },
    ]) {
      const { store, calls } = makeQuotaStore({ id: "row-1", count: 15 });
      let inserted = 0;
      const result = await createWithMonthlyQuota({
        userId: "u1",
        ...input,
        liveCount: async () => 15,
        quota: store,
        insert: async () => {
          inserted += 1;
          return "post-1";
        },
      });
      assert.deepEqual(result, { ok: true, value: "post-1" });
      assert.equal(inserted, 1);
      assert.deepEqual(calls, { finds: 0, creates: 0, increments: 0 });
    }
  });
  test("denied claim never reaches the insert", async () => {
    const { store, get } = makeQuotaStore({ id: "row-1", count: 15 });
    let inserted = 0;
    const result = await createWithMonthlyQuota({
      userId: "u1",
      limit: 15,
      bypass: false,
      liveCount: async () => 15,
      quota: store,
      insert: async () => {
        inserted += 1;
        return "post-1";
      },
    });
    assert.deepEqual(result, { ok: false, observed: 15 });
    assert.equal(inserted, 0);
    assert.deepEqual(get(), { id: "row-1", count: 15 });
  });
  test("failed insert stays consumed (fail-closed, never an over-grant)", async () => {
    const { store, get } = makeQuotaStore({ id: "row-1", count: 14 });
    await assert.rejects(() =>
      createWithMonthlyQuota({
        userId: "u1",
        limit: 15,
        bypass: false,
        liveCount: async () => 14,
        quota: store,
        insert: async () => {
          throw new Error("db unavailable");
        },
      })
    );
    assert.deepEqual(get(), { id: "row-1", count: 15 });
  });
});
