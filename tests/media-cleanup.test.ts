import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  sweepOrphanBlobs,
  type SweepBlobListing,
  type SweepDeps,
} from "../src/lib/media-cleanup";

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-09-12T12:00:00Z").getTime();

function listing(pathname: string, ageMs: number): SweepBlobListing {
  return { pathname, uploadedAt: new Date(NOW - ageMs) };
}

function fakeDeps(
  pages: SweepBlobListing[][],
  registered: Set<string>,
  removed: string[],
  lookupCalls: string[][],
  failLookup = false
): SweepDeps {
  return {
    now: () => NOW,
    listBlobs: async (cursor?: string) => {
      const index = cursor ? Number(cursor) : 0;
      const blobs = pages[index] ?? [];
      const next = index + 1;
      return {
        blobs,
        cursor: next < pages.length ? String(next) : undefined,
        hasMore: next < pages.length,
      };
    },
    findRegistered: async (pathnames: string[]) => {
      lookupCalls.push(pathnames);
      if (failLookup) throw new Error("db down");
      return new Set(pathnames.filter((p) => registered.has(p)));
    },
    removeBlobs: async (pathnames: string[]) => {
      removed.push(...pathnames);
    },
  };
}

describe("sweepOrphanBlobs", () => {
  test("removes only old unregistered blobs under media/", async () => {
    const removed: string[] = [];
    const lookupCalls: string[][] = [];
    const deps = fakeDeps(
      [
        [
          listing("media/u1/p1/aaa-photo.jpg", 2 * DAY),
          listing("media/u1/p1/bbb-photo.jpg", 2 * DAY),
          listing("media/u1/p1/ccc-fresh.jpg", 60_000),
          listing("other/scope.jpg", 30 * DAY),
        ],
      ],
      new Set(["media/u1/p1/bbb-photo.jpg"]),
      removed,
      lookupCalls
    );
    const outcome = await sweepOrphanBlobs(deps);
    assert.deepEqual(removed, ["media/u1/p1/aaa-photo.jpg"]);
    assert.equal(outcome.scanned, 3);
    assert.equal(outcome.removed, 1);
    assert.equal(outcome.hasMore, false);
    assert.equal(lookupCalls.length, 1, "one batched lookup per page");
    assert.deepEqual(lookupCalls[0].sort(), [
      "media/u1/p1/aaa-photo.jpg",
      "media/u1/p1/bbb-photo.jpg",
    ]);
  });

  test("lookup failure keeps the blobs (never delete on uncertain state)", async () => {
    const removed: string[] = [];
    const deps = fakeDeps(
      [[listing("media/u1/p1/aaa.jpg", 2 * DAY)]],
      new Set(),
      removed,
      [],
      true
    );
    const outcome = await sweepOrphanBlobs(deps);
    assert.deepEqual(removed, []);
    assert.equal(outcome.removed, 0);
  });

  test("removals are capped per run and reported via hasMore", async () => {
    const removed: string[] = [];
    const deps = fakeDeps(
      [
        [listing("media/a.jpg", 2 * DAY), listing("media/b.jpg", 2 * DAY)],
        [listing("media/c.jpg", 2 * DAY)],
      ],
      new Set(),
      removed,
      []
    );
    const outcome = await sweepOrphanBlobs(deps, { maxRemovals: 2 });
    assert.deepEqual(removed, ["media/a.jpg", "media/b.jpg"]);
    assert.equal(outcome.removed, 2);
    assert.equal(outcome.hasMore, true);
  });

  test("scanning stops at maxScanned", async () => {
    const removed: string[] = [];
    const deps = fakeDeps(
      [
        [listing("media/a.jpg", 2 * DAY), listing("media/b.jpg", 2 * DAY)],
        [listing("media/c.jpg", 2 * DAY)],
      ],
      new Set(),
      removed,
      []
    );
    const outcome = await sweepOrphanBlobs(deps, { maxScanned: 2 });
    assert.equal(outcome.scanned, 2);
    assert.deepEqual(removed, ["media/a.jpg", "media/b.jpg"]);
    assert.equal(outcome.hasMore, true);
  });

  test("paginates until the listing is exhausted", async () => {
    const removed: string[] = [];
    const deps = fakeDeps(
      [
        [listing("media/a.jpg", 2 * DAY)],
        [listing("media/b.jpg", 2 * DAY)],
      ],
      new Set(),
      removed,
      []
    );
    const outcome = await sweepOrphanBlobs(deps);
    assert.deepEqual(removed, ["media/a.jpg", "media/b.jpg"]);
    assert.equal(outcome.hasMore, false);
  });
});
