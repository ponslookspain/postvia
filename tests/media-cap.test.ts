/**
 * Per-post media cap under concurrency (P1.2).
 *
 * The cap used to be a `count()` in `/api/media/prepare` followed by an
 * unconditional insert in a LATER webhook request, with nothing joining the
 * two — so concurrent uploads all observed the same count and all registered.
 * `claimMediaSlot` makes the check and the insert one critical section per
 * post.
 *
 * These tests pin the contract against an in-memory store whose `withPostLock`
 * genuinely serializes per post. The live store obtains that serialization
 * from `pg_advisory_xact_lock` — the same primitive the billing checkout uses
 * — and `tests/media-pg-concurrency.test.ts` proves it against real Postgres.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  claimMediaSlot,
  type MediaRegistrationStore,
  type MediaRegistrationTx,
} from "../src/lib/media-upload";
import { MAX_MEDIA_PER_POST } from "../src/lib/media";

type Row = { postId: string; userId: string; pathname: string };

/**
 * In-memory Media table with a per-post mutex, mirroring the live store's
 * advisory lock. `observedConcurrency` proves the mutex is real: if two
 * claims for one post ever overlapped it would exceed 1.
 */
function fakeStore(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  const chains = new Map<string, Promise<unknown>>();
  let inSection = 0;
  let observedConcurrency = 0;

  const tx: MediaRegistrationTx = {
    countForPost: async (postId, userId) =>
      rows.filter((row) => row.postId === postId && row.userId === userId).length,
    findByPathname: async (pathname) =>
      rows.find((row) => row.pathname === pathname) ? { id: pathname } : null,
    create: async (data) => {
      rows.push({
        postId: data.postId,
        userId: data.userId,
        pathname: data.pathname,
      });
    },
  };

  const store: MediaRegistrationStore = {
    ...tx,
    withPostLock: async (postId, fn) => {
      const previous = chains.get(postId) ?? Promise.resolve();
      const run = previous.then(async () => {
        inSection++;
        observedConcurrency = Math.max(observedConcurrency, inSection);
        try {
          // Yield inside the section: without the mutex this is exactly where
          // a competing claim would interleave between count and insert.
          await new Promise((resolve) => setTimeout(resolve, 0));
          return await fn(tx);
        } finally {
          inSection--;
        }
      });
      chains.set(
        postId,
        run.catch(() => undefined)
      );
      return run as ReturnType<typeof fn>;
    },
  };

  return {
    store,
    rows,
    get observedConcurrency() {
      return observedConcurrency;
    },
  };
}

function payload(postId: string, userId: string, n: number) {
  return {
    userId,
    postId,
    url: `https://blob.example/${postId}/${n}`,
    pathname: `media/${userId}/${postId}/${String(n).padStart(32, "0")}-f.jpg`,
    filename: `f${n}.jpg`,
    mimeType: "image/jpeg",
    size: 1024,
    type: "IMAGE" as const,
  };
}

describe("claimMediaSlot — sequential behaviour", () => {
  test("an empty post accepts a first media", async () => {
    const { store, rows } = fakeStore();

    const result = await claimMediaSlot(store, payload("p1", "u1", 0));

    assert.equal(result, "created");
    assert.equal(rows.length, 1);
  });

  test("the cap is enforced once the post is full", async () => {
    const seed = Array.from({ length: MAX_MEDIA_PER_POST }, (_, i) => ({
      postId: "p1",
      userId: "u1",
      pathname: `existing-${i}`,
    }));
    const { store, rows } = fakeStore(seed);

    const result = await claimMediaSlot(store, payload("p1", "u1", 99));

    assert.equal(result, "over-cap");
    assert.equal(rows.length, MAX_MEDIA_PER_POST, "no row is written");
  });

  test("a redelivered webhook collapses to a no-op, not a second slot", async () => {
    const { store, rows } = fakeStore();
    const data = payload("p1", "u1", 0);

    assert.equal(await claimMediaSlot(store, data), "created");
    assert.equal(await claimMediaSlot(store, data), "duplicate");
    assert.equal(await claimMediaSlot(store, data), "duplicate");

    assert.equal(rows.length, 1, "retries never consume extra capacity");
  });

  test("the cap is per post, not per user", async () => {
    const seed = Array.from({ length: MAX_MEDIA_PER_POST }, (_, i) => ({
      postId: "p1",
      userId: "u1",
      pathname: `existing-${i}`,
    }));
    const { store } = fakeStore(seed);

    assert.equal(await claimMediaSlot(store, payload("p1", "u1", 9)), "over-cap");
    assert.equal(await claimMediaSlot(store, payload("p2", "u1", 9)), "created");
  });
});

describe("claimMediaSlot — the race this fix exists for", () => {
  test("20 concurrent registrations on an empty post create exactly the cap", async () => {
    const { store, rows, observedConcurrency } = fakeStore();

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        claimMediaSlot(store, payload("p1", "u1", i))
      )
    );

    const created = results.filter((r) => r === "created").length;
    const rejected = results.filter((r) => r === "over-cap").length;

    assert.equal(created, MAX_MEDIA_PER_POST, "exactly the cap is granted");
    assert.equal(rejected, 20 - MAX_MEDIA_PER_POST, "every loser is told why");
    assert.equal(rows.length, MAX_MEDIA_PER_POST);
    assert.equal(observedConcurrency, 0, "sections never overlapped");
  });

  test("4 existing + 20 concurrent attempts create nothing", async () => {
    const seed = Array.from({ length: MAX_MEDIA_PER_POST }, (_, i) => ({
      postId: "p1",
      userId: "u1",
      pathname: `existing-${i}`,
    }));
    const { store, rows } = fakeStore(seed);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        claimMediaSlot(store, payload("p1", "u1", i))
      )
    );

    assert.ok(
      results.every((r) => r === "over-cap"),
      "a full post grants nothing under any amount of concurrency"
    );
    assert.equal(rows.length, MAX_MEDIA_PER_POST);
  });

  test("concurrent claims on the LAST free slot grant exactly one winner", async () => {
    const seed = Array.from({ length: MAX_MEDIA_PER_POST - 1 }, (_, i) => ({
      postId: "p1",
      userId: "u1",
      pathname: `existing-${i}`,
    }));
    const { store, rows } = fakeStore(seed);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        claimMediaSlot(store, payload("p1", "u1", i))
      )
    );

    assert.equal(
      results.filter((r) => r === "created").length,
      1,
      "the last-slot property the quota ledgers also guarantee"
    );
    assert.equal(rows.length, MAX_MEDIA_PER_POST);
  });

  test("concurrent duplicate deliveries of ONE upload create exactly one row", async () => {
    const { store, rows } = fakeStore();
    const data = payload("p1", "u1", 0);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimMediaSlot(store, data))
    );

    assert.equal(results.filter((r) => r === "created").length, 1);
    assert.equal(results.filter((r) => r === "duplicate").length, 7);
    assert.equal(rows.length, 1);
  });

  test("different posts are not serialized against each other", async () => {
    const { store, rows } = fakeStore();

    const results = await Promise.all([
      claimMediaSlot(store, payload("p1", "u1", 0)),
      claimMediaSlot(store, payload("p2", "u1", 0)),
      claimMediaSlot(store, payload("p3", "u1", 0)),
    ]);

    assert.ok(results.every((r) => r === "created"));
    assert.equal(rows.length, 3, "the lock is per post, never global");
  });
});
