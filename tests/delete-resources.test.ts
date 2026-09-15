import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  runMediaDeleteFlow,
  runPostDeleteFlow,
} from "../src/lib/delete-resources";

/**
 * Focused tests for delete partial-failure paths (F4).
 *
 * Contract under test: deletion runs DB-first so every failure mode is
 * recoverable — a failed row delete removes nothing, a failed blob
 * delete leaves sweepable orphans (bytes without rows), never rows
 * pointing at missing bytes. Status codes/messages in the routes mirror
 * these outcomes 1:1.
 */
function makeReport() {
  const events: { scope: string; event: string }[] = [];
  return {
    events,
    report: (scope: string, event: string) => {
      events.push({ scope, event });
    },
  };
}

describe("runPostDeleteFlow", () => {
  test("happy path deletes the row then the exact blob pathnames", async () => {
    const calls: string[] = [];
    const { report } = makeReport();
    const outcome = await runPostDeleteFlow({
      postId: "p1",
      userId: "u1",
      mediaPathnames: ["media/u1/p1/a.png", "media/u1/p1/b.mp4"],
      deletePostRow: async () => {
        calls.push("row");
        return "deleted";
      },
      deleteBlobs: async (pathnames) => {
        calls.push(`blobs:${pathnames.join(",")}`);
      },
      report,
    });
    assert.deepEqual(outcome, { outcome: "deleted" });
    assert.deepEqual(calls, [
      "row",
      "blobs:media/u1/p1/a.png,media/u1/p1/b.mp4",
    ]);
  });

  test("missing row attempts no blob work", async () => {
    let blobsCalled = false;
    const outcome = await runPostDeleteFlow({
      postId: "gone",
      userId: "u1",
      mediaPathnames: ["media/u1/gone/a.png"],
      deletePostRow: async () => "missing",
      deleteBlobs: async () => {
        blobsCalled = true;
      },
    });
    assert.deepEqual(outcome, { outcome: "not-found" });
    assert.equal(blobsCalled, false);
  });

  test("row-delete failure removes nothing and reports", async () => {
    const calls: string[] = [];
    const recorder = makeReport();
    const outcome = await runPostDeleteFlow({
      postId: "p1",
      userId: "u1",
      mediaPathnames: ["media/u1/p1/a.png"],
      deletePostRow: async () => {
        calls.push("row");
        throw new Error("db down");
      },
      deleteBlobs: async () => {
        calls.push("blobs");
      },
      report: recorder.report,
    });
    assert.deepEqual(outcome, { outcome: "failed" });
    assert.deepEqual(calls, ["row"]);
    assert.deepEqual(recorder.events, [
      { scope: "media", event: "post row delete failed" },
    ]);
  });

  test("blob failure after row delete reports sweepable orphans", async () => {
    const calls: string[] = [];
    const recorder = makeReport();
    const outcome = await runPostDeleteFlow({
      postId: "p1",
      userId: "u1",
      mediaPathnames: ["media/u1/p1/a.png"],
      deletePostRow: async () => {
        calls.push("row");
        return "deleted";
      },
      deleteBlobs: async () => {
        calls.push("blobs");
        throw new Error("blob store down");
      },
      report: recorder.report,
    });
    assert.deepEqual(outcome, {
      outcome: "blobs-failed",
      orphanPathnames: ["media/u1/p1/a.png"],
    });
    // Row first, then blobs: the orphan direction the sweeper reclaims.
    assert.deepEqual(calls, ["row", "blobs"]);
    assert.deepEqual(recorder.events, [
      { scope: "media", event: "post blob delete failed after row delete" },
    ]);
  });

  test("post without media skips blob work", async () => {
    let blobsCalled = false;
    const outcome = await runPostDeleteFlow({
      postId: "p1",
      userId: "u1",
      mediaPathnames: [],
      deletePostRow: async () => "deleted",
      deleteBlobs: async () => {
        blobsCalled = true;
      },
    });
    assert.deepEqual(outcome, { outcome: "deleted" });
    assert.equal(blobsCalled, false);
  });
});

describe("runMediaDeleteFlow", () => {
  test("happy path deletes the row then the blob", async () => {
    const calls: string[] = [];
    const outcome = await runMediaDeleteFlow({
      mediaId: "m1",
      userId: "u1",
      pathname: "media/u1/p1/a.png",
      deleteMediaRow: async () => {
        calls.push("row");
        return "deleted";
      },
      deleteBlobs: async (pathnames) => {
        calls.push(`blobs:${pathnames.join(",")}`);
      },
    });
    assert.deepEqual(outcome, { outcome: "deleted" });
    assert.deepEqual(calls, ["row", "blobs:media/u1/p1/a.png"]);
  });

  test("missing row attempts no blob work", async () => {
    let blobsCalled = false;
    const outcome = await runMediaDeleteFlow({
      mediaId: "gone",
      userId: "u1",
      pathname: "media/u1/p1/a.png",
      deleteMediaRow: async () => "missing",
      deleteBlobs: async () => {
        blobsCalled = true;
      },
    });
    assert.deepEqual(outcome, { outcome: "not-found" });
    assert.equal(blobsCalled, false);
  });

  test("blob failure after row delete reports the orphan pathname", async () => {
    const recorder = makeReport();
    const outcome = await runMediaDeleteFlow({
      mediaId: "m1",
      userId: "u1",
      pathname: "media/u1/p1/a.png",
      deleteMediaRow: async () => "deleted",
      deleteBlobs: async () => {
        throw new Error("blob store down");
      },
      report: recorder.report,
    });
    assert.deepEqual(outcome, {
      outcome: "blobs-failed",
      orphanPathnames: ["media/u1/p1/a.png"],
    });
    assert.deepEqual(recorder.events, [
      { scope: "media", event: "media blob delete failed after row delete" },
    ]);
  });
});
