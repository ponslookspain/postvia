import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createPostIdempotent,
  type IdempotentCreateDeps,
} from "../src/lib/post-create";
import {
  bulkItemOperationId,
  isIdempotencyConflict,
  newOperationId,
} from "../src/lib/idempotency";
import { isTransientAbuseError } from "../src/lib/abuse";

type FakePost = {
  id: string;
  key: string | null;
  text: string;
  scheduledAt: string;
};

/** Prisma-shaped unique violation on the idempotency key. */
function fakeKeyConflict(): unknown {
  return Object.assign(new Error("Unique constraint failed on the constraint"), {
    code: "P2002",
    meta: { target: ["clientOperationId"] },
  });
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Serializes whole transactions: models the Postgres row lock that orders
 *  concurrent claim+insert bodies, plus $transaction rollback on any throw. */
class TxMutex {
  private tail: Promise<void> = Promise.resolve();
  async run<R>(fn: () => Promise<R>): Promise<R> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function createFakeLedger(limit: number): {
  deps: IdempotentCreateDeps<FakePost>;
  snapshot: () => { usage: number; posts: number };
} {
  const mutex = new TxMutex();
  let usage = 0;
  let nextId = 1;
  const byKey = new Map<string, FakePost>();
  const keyless: FakePost[] = [];

  const deps: IdempotentCreateDeps<FakePost> = {
    // Plain SELECT outside the transaction: concurrent deliveries all
    // miss before anyone inserts — exactly the race being tested.
    findByOperationId: async (key) => {
      await tick();
      return byKey.get(key) ?? null;
    },
    runAtomic: async (fn) =>
      mutex.run(async () => {
        const snapUsage = usage;
        const snapPosts = new Map(byKey);
        const snapKeyless = [...keyless];
        try {
          return await fn({
            claimQuota: async () => {
              await tick();
              if (usage < limit) {
                usage += 1;
                return { ok: true };
              }
              return { ok: false, observed: usage };
            },
            insertPost: async (key) => {
              await tick();
              if (key !== null && byKey.has(key)) throw fakeKeyConflict();
              const row: FakePost = {
                id: `post-${nextId++}`,
                key,
                text: "same text",
                scheduledAt: "2030-01-01T00:00:00.000Z",
              };
              if (key !== null) byKey.set(key, row);
              else keyless.push(row);
              return row;
            },
          });
        } catch (error) {
          // $transaction rollback: loser consumes nothing.
          usage = snapUsage;
          byKey.clear();
          for (const [k, v] of snapPosts) byKey.set(k, v);
          keyless.length = 0;
          keyless.push(...snapKeyless);
          throw error;
        }
      }),
  };
  return {
    deps,
    snapshot: () => ({ usage, posts: byKey.size + keyless.length }),
  };
}

describe("race: simultaneous requests, one operation id", () => {
  test("2 simultaneous requests -> 1 post, 1 quota unit, same id", async () => {
    const { deps, snapshot } = createFakeLedger(100);
    const key = newOperationId();
    const [a, b] = await Promise.all([
      createPostIdempotent(deps, key),
      createPostIdempotent(deps, key),
    ]);
    assert.equal(snapshot().posts, 1);
    assert.equal(snapshot().usage, 1);
    const ids = [a, b].map((r) => (r.outcome === "denied" ? null : r.post.id));
    assert.equal(ids[0], ids[1]);
    assert.ok(ids[0] !== null);
    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["created", "replay"]);
  });

  test("5 simultaneous requests -> 1 post, 1 quota unit", async () => {
    const { deps, snapshot } = createFakeLedger(100);
    const key = newOperationId();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createPostIdempotent(deps, key))
    );
    assert.equal(snapshot().posts, 1);
    assert.equal(snapshot().usage, 1);
    const ids = new Set(
      results.map((r) => (r.outcome === "denied" ? "DENIED" : r.post.id))
    );
    assert.equal(ids.size, 1);
    assert.equal(
      results.filter((r) => r.outcome === "created").length,
      1
    );
    assert.equal(
      results.filter((r) => r.outcome === "replay").length,
      4
    );
  });

  test("bulk twin keys stay independent across slots", async () => {
    const { deps, snapshot } = createFakeLedger(100);
    const batch = newOperationId();
    const results = await Promise.all(
      [0, 1, 2].map((slot) =>
        createPostIdempotent(deps, bulkItemOperationId(batch, slot))
      )
    );
    assert.equal(snapshot().posts, 3);
    assert.equal(snapshot().usage, 3);
    assert.ok(results.every((r) => r.outcome === "created"));
  });
});

describe("no content dedup", () => {
  test("same text + scheduledAt, different keys -> 2 posts, 2 units", async () => {
    const { deps, snapshot } = createFakeLedger(100);
    const [a, b] = await Promise.all([
      createPostIdempotent(deps, newOperationId()),
      createPostIdempotent(deps, newOperationId()),
    ]);
    assert.equal(snapshot().posts, 2);
    assert.equal(snapshot().usage, 2);
    assert.equal(a.outcome, "created");
    assert.equal(b.outcome, "created");
    if (a.outcome === "created" && b.outcome === "created") {
      assert.notEqual(a.post.id, b.post.id);
    }
  });
});

describe("replay after success", () => {
  test("same key again -> same post, no extra quota", async () => {
    const { deps, snapshot } = createFakeLedger(100);
    const key = newOperationId();
    const first = await createPostIdempotent(deps, key);
    assert.equal(first.outcome, "created");
    assert.deepEqual(snapshot(), { usage: 1, posts: 1 });
    const second = await createPostIdempotent(deps, key);
    assert.equal(second.outcome, "replay");
    assert.deepEqual(snapshot(), { usage: 1, posts: 1 });
    if (first.outcome === "created" && second.outcome === "replay") {
      assert.equal(second.post.id, first.post.id);
    }
  });
});

describe("concurrent requests at the quota boundary", () => {
  test("5 distinct keys, 3 units left -> 3 created, 2 denied, usage exactly 3", async () => {
    const { deps, snapshot } = createFakeLedger(3);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createPostIdempotent(deps, newOperationId()))
    );
    assert.equal(snapshot().posts, 3);
    assert.equal(snapshot().usage, 3);
    assert.equal(results.filter((r) => r.outcome === "created").length, 3);
    const denied = results.filter((r) => r.outcome === "denied");
    assert.equal(denied.length, 2);
    for (const d of denied) {
      assert.equal(d.outcome, "denied");
      if (d.outcome === "denied") assert.equal(d.observed, 3);
    }
  });

  test("twin denied on the last unit replays the committed post (no false 403)", async () => {
    const { deps, snapshot } = createFakeLedger(1);
    const key = newOperationId();
    const [a, b] = await Promise.all([
      createPostIdempotent(deps, key),
      createPostIdempotent(deps, key),
    ]);
    // One creator, one replay — never a denial: the twin's claim commits
    // together with its post, so the denial path finds the committed row.
    assert.equal(snapshot().posts, 1);
    assert.equal(snapshot().usage, 1);
    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["created", "replay"]);
    const ids = [a, b].map((r) => (r.outcome === "denied" ? null : r.post.id));
    assert.equal(ids[0], ids[1]);
  });

  test("genuine exhaustion without a twin still denies", async () => {
    const { deps, snapshot } = createFakeLedger(1);
    const first = await createPostIdempotent(deps, newOperationId());
    assert.equal(first.outcome, "created");
    const second = await createPostIdempotent(deps, newOperationId());
    assert.equal(second.outcome, "denied");
    if (second.outcome === "denied") assert.equal(second.observed, 1);
    assert.deepEqual(snapshot(), { usage: 1, posts: 1 });
  });
});

describe("classifier guards (free path never burns quota on duplicates)", () => {
  test("P2002 on the idempotency key is a conflict, never transient", () => {
    const error = fakeKeyConflict();
    assert.equal(isIdempotencyConflict(error), true);
    // The free kernel falls back to the quota-burning PostUsage-only path
    // ONLY on transient errors: a duplicate must never take that path.
    assert.equal(isTransientAbuseError(error), false);
  });

  test("P2002 on other targets is not an idempotency conflict", () => {
    const other = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["pathname"] },
    });
    assert.equal(isIdempotencyConflict(other), false);
  });
});
