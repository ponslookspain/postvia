import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isSerializationConflictError,
  type AbuseStores,
} from "../src/lib/abuse";
import type { QuotaClaimStore } from "../src/lib/entitlements";
import {
  FREE_POST_TX_MAX_ATTEMPTS,
  FreePostDeny,
  runFreePostBody,
  runWithTxRetry,
} from "../src/lib/free-post-kernel";
import { isIdempotencyConflict } from "../src/lib/idempotency";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Raw Postgres serialization failure as Prisma surfaces it outside P2034. */
function fakeSerializationFailure(): unknown {
  return Object.assign(
    new Error(
      'ERROR: could not serialize access due to concurrent update (SQLSTATE 40001)'
    ),
    { name: "PrismaClientUnknownRequestError" }
  );
}

function fakeDeadlock(): unknown {
  return Object.assign(
    new Error("ERROR: deadlock detected (SQLSTATE 40P01)"),
    { name: "PrismaClientUnknownRequestError" }
  );
}

function fakeP2034(): unknown {
  return Object.assign(
    new Error("Transaction failed due to a write conflict or a deadlock"),
    { code: "P2034" }
  );
}

describe("isSerializationConflictError classifier (strict)", () => {
  test("matches P2034, raw 40001 and raw 40P01", () => {
    assert.equal(isSerializationConflictError(fakeP2034()), true);
    assert.equal(isSerializationConflictError(fakeSerializationFailure()), true);
    assert.equal(isSerializationConflictError(fakeDeadlock()), true);
  });

  test("rejects race codes, denials, validation and unknown errors", () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    assert.equal(isSerializationConflictError(p2002), false);
    assert.equal(
      isSerializationConflictError(new FreePostDeny("LIMIT", 15)),
      false
    );
    assert.equal(
      isSerializationConflictError(new Error("validation failed")),
      false
    );
    assert.equal(isSerializationConflictError(new Error("boom")), false);
    assert.equal(isSerializationConflictError(null), false);
  });
});

describe("runWithTxRetry: bounded transient-conflict retry", () => {
  test("attempt budget is bounded (3 total)", () => {
    assert.equal(FREE_POST_TX_MAX_ATTEMPTS, 3);
  });

  test("transient storm converts to transparent success, no duplicate effect", async () => {
    let effects = 0;
    let calls = 0;
    const result = await runWithTxRetry(
      async () => {
        calls++;
        await tick();
        // Cold-start storm: first two attempts die as aborted transactions
        // (guaranteed rollback => no effect applied yet).
        if (calls <= 2) throw fakeSerializationFailure();
        effects++;
        return "post-id-1";
      },
      { backoffMs: () => 0 }
    );
    assert.equal(result, "post-id-1");
    assert.equal(calls, 3);
    assert.equal(effects, 1);
  });

  test("business denial is never retried", async () => {
    let calls = 0;
    await assert.rejects(
      runWithTxRetry(
        async () => {
          calls++;
          await tick();
          throw new FreePostDeny("LIMIT", 15);
        },
        { backoffMs: () => 0 }
      ),
      (error: unknown) => error instanceof FreePostDeny
    );
    assert.equal(calls, 1);
  });

  test("idempotency conflict is never retried (route resolves the twin)", async () => {
    let calls = 0;
    const twin = Object.assign(
      new Error("Unique constraint failed on clientOperationId"),
      { code: "P2002", meta: { target: ["clientOperationId"] } }
    );
    assert.equal(isIdempotencyConflict(twin), true);
    await assert.rejects(
      runWithTxRetry(
        async () => {
          calls++;
          await tick();
          throw twin;
        },
        { backoffMs: () => 0 }
      )
    );
    assert.equal(calls, 1);
  });

  test("validation failure is never retried", async () => {
    let calls = 0;
    await assert.rejects(
      runWithTxRetry(
        async () => {
          calls++;
          await tick();
          throw new Error("validation failed");
        },
        { backoffMs: () => 0 }
      )
    );
    assert.equal(calls, 1);
  });

  test("persistent conflict exhausts the budget and rethrows (no silent grant)", async () => {
    let calls = 0;
    await assert.rejects(
      runWithTxRetry(
        async () => {
          calls++;
          await tick();
          throw fakeDeadlock();
        },
        { backoffMs: () => 0 }
      ),
      /deadlock detected/
    );
    assert.equal(calls, FREE_POST_TX_MAX_ATTEMPTS);
  });
});

/**
 * Observe-mode identity-saturated harness (mirrors the runtime burst that
 * minted posts beyond the cap): the shared identity ledger is already full,
 * so every identity claim denies; the per-user ledger starts with room.
 * runFreePostBody must still gate every insert on the per-user ledger.
 */
function makeObserveHarness(userLedgerStart: number, limit: number): {
  stores: AbuseStores;
  quota: QuotaClaimStore;
  snapshot: () => { userUsage: number; posts: number };
} {
  const now = new Date();
  let userUsage = userLedgerStart;
  const posts = 0;
  const stores: AbuseStores = {
    findSignalOwners: async () => [{ identityId: "idn-1", firstSeenAt: now }],
    createIdentity: async () => ({ id: "idn-1", firstSeenAt: now }),
    linkUser: async () => {},
    findIdentityIdByUser: async () => "idn-1",
    findUserIdsByIdentity: async () => ["u-obs"],
    attachSignals: async () => {},
    removeSignals: async () => {},
    mergeIdentities: async () => {},
    getIdentity: async () => ({
      id: "idn-1",
      riskLevel: "LOW",
      riskReason: null,
      lastLinkedAt: null,
      firstSeenAt: now,
    }),
    setRisk: async () => {},
    escalateRisk: async () => {},
    touchLinked: async () => {},
    touchSeen: async () => {},
    findTombstones: async () => [],
    writeTombstones: async () => {},
    sweepTombstones: async () => 0,
    getFreeUsage: async () => limit, // saturated identity ledger
    initFreeUsage: async (_id, _period, count) => count,
    incrementFreeIfBelow: async () => false, // identity always denies
    raiseFreeFloor: async () => {},
    sumPostUsage: async () => 0,
    rateTake: async () => true,
  };
  const quota: QuotaClaimStore = {
    findUsage: async () => ({ id: "qu-1", count: userUsage }),
    createUsage: async () => ({ id: "qu-1", count: userUsage }),
    incrementIfBelowLimit: async () => {
      await tick();
      if (userUsage < limit) {
        userUsage++;
        return true;
      }
      return false;
    },
  };
  return {
    stores,
    quota,
    snapshot: () => ({ userUsage, posts }),
  };
}

async function observeAttempt(
  h: ReturnType<typeof makeObserveHarness>,
  enforce: boolean
): Promise<string> {
  const { value } = await runFreePostBody({
    userId: "u-obs",
    email: "u-obs@example.com",
    limit: 15,
    period: "2026-09",
    monthStart: new Date("2026-09-01T00:00:00Z"),
    pepper: "test-pepper",
    enforce,
    stores: h.stores,
    quota: h.quota,
    liveCount: async () => 0,
    insert: async () => {
      await tick();
      return "post";
    },
  });
  return value;
}

describe("observe mode: identity denial never bypasses the per-user ledger", () => {
  test("identity-saturated + per-user room: allow consumes exactly one unit", async () => {
    const h = makeObserveHarness(14, 15);
    const before = h.snapshot();
    await observeAttempt(h, false);
    const after = h.snapshot();
    assert.equal(after.userUsage, before.userUsage + 1);
  });

  test("identity-saturated + per-user exhausted: controlled LIMIT denial, no insert", async () => {
    const h = makeObserveHarness(15, 15);
    let inserts = 0;
    await assert.rejects(
      runFreePostBody({
        userId: "u-obs",
        email: "u-obs@example.com",
        limit: 15,
        period: "2026-09",
        monthStart: new Date("2026-09-01T00:00:00Z"),
        pepper: "test-pepper",
        enforce: false,
        stores: h.stores,
        quota: h.quota,
        liveCount: async () => 0,
        insert: async () => {
          inserts++;
          return "post";
        },
      }),
      (error: unknown) =>
        error instanceof FreePostDeny && error.code === "LIMIT"
    );
    assert.equal(inserts, 0);
    assert.equal(h.snapshot().userUsage, 15);
  });

  test("enforce mode still denies on identity verdict alone", async () => {
    const h = makeObserveHarness(14, 15);
    await assert.rejects(observeAttempt(h, true), (error: unknown) => {
      assert.ok(error instanceof FreePostDeny);
      assert.equal((error as FreePostDeny).code, "LIMIT");
      return true;
    });
    // Nothing consumed, nothing inserted.
    assert.equal(h.snapshot().userUsage, 14);
  });

  test("observe burst 20 concurrent at 14/15: 1 winner, 19 denials, ledger 15", async () => {
    const h = makeObserveHarness(14, 15);
    let inserts = 0;
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        runFreePostBody({
          userId: "u-obs",
          email: "u-obs@example.com",
          limit: 15,
          period: "2026-09",
          monthStart: new Date("2026-09-01T00:00:00Z"),
          pepper: "test-pepper",
          enforce: false,
          stores: h.stores,
          quota: h.quota,
          liveCount: async () => 0,
          insert: async () => {
            await tick();
            inserts++;
            return "post";
          },
        }).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error })
        )
      )
    );
    assert.equal(outcomes.filter((o) => o.ok).length, 1);
    assert.equal(
      outcomes.filter((o) => !o.ok && o.error instanceof FreePostDeny).length,
      19
    );
    assert.equal(inserts, 1);
    assert.equal(h.snapshot().userUsage, 15);
  });
});

describe("cold-start: 20 concurrent, 1 free unit, serialization storm", () => {
  test("exactly 1 winner, 19 controlled denials, ledger == 1, zero throws", async () => {
    const LIMIT = 15;
    let usage = LIMIT - 1; // one unit left, cold ledger (no row yet in prod)
    const created: string[] = [];
    let storm = 6; // first attempts across callers die as 40001 (rolled back)

    const attempt = async (): Promise<string> => {
      await tick();
      if (storm > 0) {
        storm--;
        // Aborted transaction: by definition no state was committed.
        throw fakeSerializationFailure();
      }
      await tick();
      if (usage >= LIMIT) throw new FreePostDeny("LIMIT", usage);
      usage++;
      created.push(`post-${created.length + 1}`);
      return created[created.length - 1] as string;
    };

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        runWithTxRetry(attempt, { backoffMs: () => 0 }).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error })
        )
      )
    );
    const wins = outcomes.filter((o) => o.ok);
    const denials = outcomes.filter(
      (o) => !o.ok && o.error instanceof FreePostDeny
    );
    const unexplained = outcomes.filter(
      (o) => !o.ok && !(o.error instanceof FreePostDeny)
    );
    assert.equal(wins.length, 1);
    assert.equal(denials.length, 19);
    assert.equal(unexplained.length, 0);
    assert.equal(usage, LIMIT);
    assert.equal(created.length, 1);
  });
});
