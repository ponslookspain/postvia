import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatElapsed,
  pollPostSettled,
  publishPhaseLabel,
  PUBLISH_POLL_MS,
  PUBLISH_POLL_TIMEOUT_MS,
  type SettledPost,
} from "../src/lib/publish-poll";

function publishingPost(): SettledPost {
  return {
    status: "PUBLISHING",
    targets: [
      { status: "PUBLISHED", platform: "THREADS", externalPostId: "t1" },
      { status: "PUBLISHING", platform: "X", externalPostId: null },
      { status: "FAILED", platform: "TIKTOK", externalPostId: null },
    ],
  };
}

function publishedPost(): SettledPost {
  return {
    status: "PUBLISHED",
    targets: [
      { status: "PUBLISHED", platform: "THREADS", externalPostId: "t1" },
    ],
  };
}

describe("pollPostSettled", () => {
  test("keeps the server polling contract (2s interval, 330s timeout)", () => {
    assert.equal(PUBLISH_POLL_MS, 2000);
    assert.equal(PUBLISH_POLL_TIMEOUT_MS, 330_000);
  });

  test("settles on the first successful fetch", async () => {
    let calls = 0;
    const result = await pollPostSettled({
      postId: "post-1",
      pollIntervalMs: 1,
      timeoutMs: 1000,
      fetchPost: async () => {
        calls += 1;
        return publishedPost();
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.outcome, "settled");
    assert.equal(
      result.outcome === "settled" ? result.post.status : null,
      "PUBLISHED"
    );
  });

  test("transient failures keep polling until settled", async () => {
    let calls = 0;
    const seen: string[] = [];
    const result = await pollPostSettled({
      postId: "post-1",
      pollIntervalMs: 1,
      timeoutMs: 1000,
      fetchPost: async () => {
        calls += 1;
        if (calls < 3) return null;
        return publishedPost();
      },
      onProgress: (progress) => {
        seen.push(progress.known ? "known" : "unknown");
      },
    });
    assert.equal(calls, 3);
    assert.equal(result.outcome, "settled");
    assert.deepEqual(seen, ["unknown", "unknown"]);
  });

  test("timeout while still publishing", async () => {
    let calls = 0;
    const result = await pollPostSettled({
      postId: "post-1",
      pollIntervalMs: 5,
      timeoutMs: 25,
      fetchPost: async () => {
        calls += 1;
        return publishingPost();
      },
    });
    assert.ok(calls >= 1);
    assert.equal(result.outcome, "timeout");
  });

  test("pre-aborted signal never fetches", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await pollPostSettled({
      postId: "post-1",
      signal: controller.signal,
      pollIntervalMs: 1,
      timeoutMs: 1000,
      fetchPost: async () => {
        calls += 1;
        return publishedPost();
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.outcome, "aborted");
  });

  test("abort during sleep stops without fetching", async () => {
    const controller = new AbortController();
    let calls = 0;
    const pending = pollPostSettled({
      postId: "post-1",
      signal: controller.signal,
      pollIntervalMs: 60_000,
      timeoutMs: 60_000,
      fetchPost: async () => {
        calls += 1;
        return publishedPost();
      },
    });
    setTimeout(() => controller.abort(), 10);
    const result = await pending;
    assert.equal(calls, 0);
    assert.equal(result.outcome, "aborted");
  });

  test("abort mid-flight fetches once and never polls again", async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await pollPostSettled({
      postId: "post-1",
      signal: controller.signal,
      pollIntervalMs: 1,
      timeoutMs: 1000,
      fetchPost: async () => {
        calls += 1;
        controller.abort();
        await new Promise((r) => setTimeout(r, 5));
        return publishingPost();
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.outcome, "aborted");
  });

  test("progress reports only backend-known counts", async () => {
    const seen: { publishedTargets: number; known: boolean }[] = [];
    const result = await pollPostSettled({
      postId: "post-1",
      pollIntervalMs: 1,
      timeoutMs: 20,
      fetchPost: async () => publishingPost(),
      onProgress: (progress) => {
        seen.push({
          publishedTargets: progress.publishedTargets,
          known: progress.known,
        });
      },
    });
    assert.ok(seen.length >= 1);
    for (const entry of seen) {
      assert.deepEqual(entry, { publishedTargets: 1, known: true });
    }
    assert.equal(result.outcome, "timeout");
  });
});

describe("formatElapsed", () => {
  test("renders mm:ss", () => {
    assert.equal(formatElapsed(0), "00:00");
    assert.equal(formatElapsed(59_999), "00:59");
    assert.equal(formatElapsed(61_000), "01:01");
    assert.equal(formatElapsed(-100), "00:00");
  });
});

describe("publishPhaseLabel", () => {
  test("honest labels without inventing progress", () => {
    assert.equal(publishPhaseLabel(null), "Contacting platforms…");
    assert.equal(
      publishPhaseLabel({
        elapsedMs: 0,
        attempts: 1,
        publishedTargets: 0,
        failedTargets: 0,
        totalTargets: 0,
        known: false,
      }),
      "Contacting platforms…"
    );
    assert.equal(
      publishPhaseLabel({
        elapsedMs: 2000,
        attempts: 1,
        publishedTargets: 0,
        failedTargets: 0,
        totalTargets: 0,
        known: true,
      }),
      "Waiting for platforms…"
    );
    assert.equal(
      publishPhaseLabel({
        elapsedMs: 4000,
        attempts: 2,
        publishedTargets: 1,
        failedTargets: 0,
        totalTargets: 3,
        known: true,
      }),
      "Publishing… 1/3 published"
    );
    assert.equal(
      publishPhaseLabel({
        elapsedMs: 6000,
        attempts: 3,
        publishedTargets: 2,
        failedTargets: 1,
        totalTargets: 3,
        known: true,
      }),
      "Finishing…"
    );
  });
});
