import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOB_DELETE_CHUNK,
  chunkPathnames,
  runAccountDeleteFlow,
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

/**
 * Account deletion (P1.6).
 *
 * Contract: DB-first, exactly like the flows above. A failed transaction must
 * remove NOTHING (the previous implementation deleted the bytes first, so a
 * failed transaction left the user alive with rows pointing at missing
 * bytes), and a failed blob delete must still report success — the account is
 * gone, and the leftovers are orphans the 24h sweep reclaims.
 */
describe("runAccountDeleteFlow", () => {
  test("happy path: rows first, then the blobs", async () => {
    const calls: string[] = [];
    const outcome = await runAccountDeleteFlow({
      userId: "u1",
      mediaPathnames: ["media/u1/p1/a.png", "media/u1/p2/b.mp4"],
      deleteAccountRows: async () => {
        calls.push("rows");
      },
      deleteBlobs: async (pathnames) => {
        calls.push(`blobs:${pathnames.join(",")}`);
      },
      report: makeReport().report,
    });

    assert.deepEqual(outcome, { outcome: "deleted" });
    assert.deepEqual(calls, [
      "rows",
      "blobs:media/u1/p1/a.png,media/u1/p2/b.mp4",
    ]);
  });

  test("a failed transaction touches NO storage", async () => {
    const calls: string[] = [];
    const recorder = makeReport();
    const outcome = await runAccountDeleteFlow({
      userId: "u1",
      mediaPathnames: ["media/u1/p1/a.png"],
      deleteAccountRows: async () => {
        throw new Error("P2028 transaction timeout");
      },
      deleteBlobs: async (pathnames) => {
        calls.push(`blobs:${pathnames.join(",")}`);
      },
      report: recorder.report,
    });

    assert.deepEqual(outcome, { outcome: "failed" });
    assert.deepEqual(
      calls,
      [],
      "the bytes must survive so the user can retry the delete"
    );
    assert.deepEqual(recorder.events, [
      { scope: "account", event: "account delete transaction failed" },
    ]);
  });

  test("a failed blob delete still deletes the account", async () => {
    const recorder = makeReport();
    const outcome = await runAccountDeleteFlow({
      userId: "u1",
      mediaPathnames: ["media/u1/p1/a.png"],
      deleteAccountRows: async () => {},
      deleteBlobs: async () => {
        throw new Error("blob store down");
      },
      report: recorder.report,
    });

    assert.deepEqual(outcome, {
      outcome: "deleted-with-orphans",
      orphanPathnames: ["media/u1/p1/a.png"],
    });
    assert.deepEqual(recorder.events, [
      { scope: "account", event: "account blob delete failed after row delete" },
    ]);
  });

  test("an unbounded media set is deleted in bounded chunks", async () => {
    const pathnames = Array.from({ length: 250 }, (_, i) => `media/u1/p/${i}`);
    const chunks: number[] = [];

    const outcome = await runAccountDeleteFlow({
      userId: "u1",
      mediaPathnames: pathnames,
      deleteAccountRows: async () => {},
      deleteBlobs: async (batch) => {
        chunks.push(batch.length);
      },
      chunkSize: 100,
      report: makeReport().report,
    });

    assert.deepEqual(outcome, { outcome: "deleted" });
    assert.deepEqual(
      chunks,
      [100, 100, 50],
      "never one call with every key a user ever stored"
    );
  });

  test("one failing chunk does not strand the others", async () => {
    const pathnames = Array.from({ length: 30 }, (_, i) => `media/u1/p/${i}`);
    const deleted: string[] = [];
    const recorder = makeReport();

    const outcome = await runAccountDeleteFlow({
      userId: "u1",
      mediaPathnames: pathnames,
      deleteAccountRows: async () => {},
      deleteBlobs: async (batch) => {
        if (batch[0] === "media/u1/p/10") throw new Error("chunk failed");
        deleted.push(...batch);
      },
      chunkSize: 10,
      report: recorder.report,
    });

    assert.equal(outcome.outcome, "deleted-with-orphans");
    if (outcome.outcome !== "deleted-with-orphans") return;
    assert.equal(outcome.orphanPathnames.length, 10, "only the failed chunk");
    assert.equal(deleted.length, 20, "the other chunks still went through");
    assert.equal(recorder.events.length, 1);
  });

  test("an account with no media skips blob work entirely", async () => {
    const calls: string[] = [];
    const outcome = await runAccountDeleteFlow({
      userId: "u1",
      mediaPathnames: [],
      deleteAccountRows: async () => {
        calls.push("rows");
      },
      deleteBlobs: async () => {
        calls.push("blobs");
      },
      report: makeReport().report,
    });

    assert.deepEqual(outcome, { outcome: "deleted" });
    assert.deepEqual(calls, ["rows"]);
  });
});

describe("chunkPathnames", () => {
  test("splits evenly and keeps the remainder", () => {
    assert.deepEqual(chunkPathnames(["a", "b", "c", "d", "e"], 2), [
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });

  test("an empty list yields no chunks (no empty delete call)", () => {
    assert.deepEqual(chunkPathnames([], 10), []);
  });

  test("a list shorter than the chunk stays one chunk", () => {
    assert.deepEqual(chunkPathnames(["a"], 100), [["a"]]);
  });

  test("the default chunk size is bounded", () => {
    assert.ok(BLOB_DELETE_CHUNK > 0 && BLOB_DELETE_CHUNK <= 1000);
  });
});
