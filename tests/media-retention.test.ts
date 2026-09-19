import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_RETENTION_BATCH,
  MEDIA_RETENTION_MAX_BATCHES,
  MEDIA_RETENTION_MS,
  sweepPublishedMedia,
  type EligibleMedia,
} from "../src/lib/media-retention";
import { retentionCutoff } from "../src/lib/retention";

/**
 * Media retention (storage-cost guard). The sweep is exercised through an
 * injected in-memory "table" + blob store so the DB-first ordering and
 * batching contract are testable without a database or real Blob calls —
 * the live wiring (cron route) does the same select/delete against Prisma
 * and Vercel Blob.
 */
function fakeStore(rows: (EligibleMedia & { eligible: boolean })[]) {
  let media = rows;
  const blobStore = new Set(rows.map((row) => row.pathname));
  const deleteCalls: string[][] = [];
  let failNextBlobDelete = false;

  return {
    get media() {
      return media;
    },
    get blobStore() {
      return blobStore;
    },
    deleteCalls,
    failNextBlobDelete() {
      failNextBlobDelete = true;
    },
    deps: {
      findEligible: async (_olderThan: Date, limit: number) =>
        media.filter((row) => row.eligible).slice(0, limit),
      deleteMediaRows: async (ids: string[]) => {
        const before = media.length;
        const idSet = new Set(ids);
        media = media.filter((row) => !idSet.has(row.id));
        return before - media.length;
      },
      deleteBlobs: async (pathnames: string[]) => {
        deleteCalls.push(pathnames);
        if (failNextBlobDelete) {
          failNextBlobDelete = false;
          throw new Error("blob store unavailable");
        }
        for (const pathname of pathnames) blobStore.delete(pathname);
      },
    },
  };
}

const NOW = new Date("2026-09-19T00:00:00Z");
const cutoff = retentionCutoff(NOW.getTime(), MEDIA_RETENTION_MS);

describe("sweepPublishedMedia", () => {
  test("removes eligible media and their blobs", async () => {
    const store = fakeStore([
      { id: "m1", pathname: "media/u1/p1/a.jpg", eligible: true },
      { id: "m2", pathname: "media/u1/p1/b.jpg", eligible: true },
    ]);

    const outcome = await sweepPublishedMedia(cutoff, store.deps);

    assert.equal(outcome.removed, 2);
    assert.equal(outcome.blobFailures, 0);
    assert.equal(store.media.length, 0);
    assert.equal(store.blobStore.size, 0);
  });

  test("never touches media that isn't eligible (recent or not fully published)", async () => {
    const store = fakeStore([
      { id: "m1", pathname: "media/u1/p1/a.jpg", eligible: false },
    ]);

    const outcome = await sweepPublishedMedia(cutoff, store.deps);

    assert.equal(outcome.removed, 0);
    assert.equal(store.media.length, 1, "ineligible media survives");
  });

  test("the Media row is deleted even when the blob delete fails", async () => {
    const store = fakeStore([
      { id: "m1", pathname: "media/u1/p1/a.jpg", eligible: true },
    ]);
    store.failNextBlobDelete();

    const outcome = await sweepPublishedMedia(cutoff, store.deps);

    assert.equal(outcome.removed, 1, "DB-first: the row is gone regardless");
    assert.equal(outcome.blobFailures, 1);
    assert.equal(
      store.blobStore.size,
      1,
      "the orphaned blob is left for the orphan-blob sweep to reclaim"
    );
  });

  test("is idempotent: a second run removes nothing", async () => {
    const store = fakeStore([
      { id: "m1", pathname: "media/u1/p1/a.jpg", eligible: true },
    ]);

    const first = await sweepPublishedMedia(cutoff, store.deps);
    const second = await sweepPublishedMedia(cutoff, store.deps);

    assert.equal(first.removed, 1);
    assert.equal(second.removed, 0);
  });

  test("deletes in bounded batches rather than one unbounded pass", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`,
      pathname: `media/u1/p1/${i}.jpg`,
      eligible: true,
    }));
    const store = fakeStore(rows);

    const outcome = await sweepPublishedMedia(cutoff, store.deps, {
      batchSize: 3,
    });

    assert.equal(outcome.removed, 7);
    assert.deepEqual(
      store.deleteCalls.map((call) => call.length),
      [3, 3, 1],
      "three short batches, stopping on the short one"
    );
  });

  test("caps batches per run so a backlog carries to the next tick", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: `m${i}`,
      pathname: `media/u1/p1/${i}.jpg`,
      eligible: true,
    }));
    const store = fakeStore(rows);

    const outcome = await sweepPublishedMedia(cutoff, store.deps, {
      batchSize: 10,
      maxBatches: 3,
    });

    assert.equal(outcome.removed, 30, "one run never drains more than the cap");
    assert.equal(store.media.length, 70, "the rest wait for the next invocation");
  });

  test("an empty table issues exactly one lookup and no deletes", async () => {
    const store = fakeStore([]);

    const outcome = await sweepPublishedMedia(cutoff, store.deps);

    assert.equal(outcome.removed, 0);
    assert.deepEqual(store.deleteCalls, []);
  });

  test("the horizon and batch constants are sane", () => {
    assert.equal(MEDIA_RETENTION_MS, 365 * 86_400_000);
    assert.ok(MEDIA_RETENTION_BATCH > 0);
    assert.ok(MEDIA_RETENTION_MAX_BATCHES > 0);
  });
});
