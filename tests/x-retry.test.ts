import { before, beforeEach, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { selectPublishableTargetIds } from "../src/lib/publish";

type FetchCall = { url: string; method: string; bodyText: string };
let calls: FetchCall[] = [];
let initIds = 0;
let originalFetch: typeof globalThis.fetch;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function recordingFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const url =
    input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
  calls.push({
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    bodyText: typeof init?.body === "string" ? init.body : "",
  });
  if (url.includes("media/upload/initialize")) {
    initIds += 1;
    return json(200, { data: { id: `mid-retry-${initIds}`, expires_after_secs: 86400 } });
  }
  if (url.includes("/append")) return json(200, {});
  if (url.includes("/finalize")) {
    return json(200, { data: { id: `mid-retry-${initIds}` } });
  }
  throw new Error(`unexpected fetch: ${url}`);
}

let xmod: typeof import("../src/lib/social/x");

const NOW = 1_800_000_000_000;
const MARKER = "x-req-0123456789abcdef0123456789abcdef";

describe("X retry / idempotency hardening", () => {
  before(async () => {
    xmod = await import("../src/lib/social/x");
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = recordingFetch;
    calls = [];
    initIds = 0;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  describe("attempt markers", () => {
    test("marker format is namespaced and unguessable, never a tweet id", () => {
      const a = xmod.createXAttemptMarker();
      const b = xmod.createXAttemptMarker();
      assert.ok(a.startsWith("x-req-"));
      assert.notEqual(a, b);
      assert.ok(!/^[0-9]+$/.test(a), "must not collide with numeric tweet ids");
      assert.equal(xmod.isXAttemptMarker(a), true);
    });

    test("non-markers are rejected (null, undefined, empty, numeric ids)", () => {
      assert.equal(xmod.isXAttemptMarker(null), false);
      assert.equal(xmod.isXAttemptMarker(undefined), false);
      assert.equal(xmod.isXAttemptMarker(""), false);
      assert.equal(xmod.isXAttemptMarker("x-req-"), false);
      assert.equal(xmod.isXAttemptMarker("1880028106020515840"), false);
      assert.equal(xmod.isXAttemptMarker("PUB-123"), false);
    });
  });

  describe("decideXStaleAttempt", () => {
    test("non-X platform returns skip (generic path untouched)", () => {
      assert.equal(
        xmod.decideXStaleAttempt({
          platform: "THREADS",
          status: "PUBLISHING",
          externalJobId: MARKER,
          updatedAtMs: NOW - 60_000,
          nowMs: NOW,
        }),
        "skip"
      );
    });

    test("non-PUBLISHING status returns skip", () => {
      for (const status of ["PENDING", "FAILED", "PUBLISHED"]) {
        assert.equal(
          xmod.decideXStaleAttempt({
            platform: "X",
            status,
            externalJobId: MARKER,
            updatedAtMs: NOW - 60_000,
            nowMs: NOW,
          }),
          "skip",
          status
        );
      }
    });

    test("PUBLISHING without a marker returns skip (legacy rows reset as before)", () => {
      for (const job of [null, undefined, "", "some-container"]) {
        assert.equal(
          xmod.decideXStaleAttempt({
            platform: "X",
            status: "PUBLISHING",
            externalJobId: job,
            updatedAtMs: NOW - 60_000,
            nowMs: NOW,
          }),
          "skip"
        );
      }
    });

    test("fresh marker stays pending: no auto-reset, no second POST", () => {
      assert.equal(
        xmod.decideXStaleAttempt({
          platform: "X",
          status: "PUBLISHING",
          externalJobId: MARKER,
          updatedAtMs: NOW - 60_000,
          nowMs: NOW,
        }),
        "pending"
      );
    });

    test("boundary: exactly at the timeout stays pending (strictly-greater rule)", () => {
      assert.equal(
        xmod.decideXStaleAttempt({
          platform: "X",
          status: "PUBLISHING",
          externalJobId: MARKER,
          updatedAtMs: NOW - xmod.X_AMBIGUOUS_ATTEMPT_MS,
          nowMs: NOW,
        }),
        "pending"
      );
      assert.equal(
        xmod.decideXStaleAttempt({
          platform: "X",
          status: "PUBLISHING",
          externalJobId: MARKER,
          updatedAtMs: NOW - xmod.X_AMBIGUOUS_ATTEMPT_MS - 1,
          nowMs: NOW,
        }),
        "unknown"
      );
    });

    test("stale marker converts to unknown (informed manual retry, never auto-POST)", () => {
      assert.equal(
        xmod.decideXStaleAttempt({
          platform: "X",
          status: "PUBLISHING",
          externalJobId: MARKER,
          updatedAtMs: NOW - 30 * 60_000,
          nowMs: NOW,
        }),
        "unknown"
      );
    });

    test("broken clocks fail closed to pending (never auto-convert)", () => {
      assert.equal(
        xmod.decideXStaleAttempt({
          platform: "X",
          status: "PUBLISHING",
          externalJobId: MARKER,
          updatedAtMs: Number.NaN,
          nowMs: NOW,
        }),
        "pending"
      );
    });

    test("ambiguity window is bounded and far below schedule validity", () => {
      assert.ok(xmod.X_AMBIGUOUS_ATTEMPT_MS >= 6 * 60_000);
      assert.ok(xmod.X_AMBIGUOUS_ATTEMPT_MS <= 60 * 60_000);
    });
  });

  describe("ambiguous failure message", () => {
    test("tells the user to check X first and warns about duplicates", () => {
      const message = xmod.xAmbiguousRetryMessage();
      assert.match(message, /check your X profile/i);
      assert.match(message, /duplicate/i);
      assert.match(message, /do not retry/i);
      assert.ok(!message.includes("Bearer"));
    });
  });

  describe("media upload has no cross-attempt reuse", () => {
    function deps() {
      let clock = 0;
      return {
        sleep: async () => {
          clock += 1000;
        },
        pollIntervalMs: 1000,
        pollBudgetMs: 8000,
        now: () => clock,
      };
    }

    test("each uploadXMedia call mints a fresh INIT (retry never reuses a media_id)", async () => {
      const bytes = new Uint8Array(512).buffer as ArrayBuffer;
      const first = await xmod.uploadXMedia(
        "AT-1",
        { bytes, mediaType: "image/jpeg", mediaCategory: "tweet_image" },
        deps()
      );
      const second = await xmod.uploadXMedia(
        "AT-1",
        { bytes, mediaType: "image/jpeg", mediaCategory: "tweet_image" },
        deps()
      );
      assert.equal(first.state, "ready");
      assert.equal(second.state, "ready");
      if (first.state !== "ready" || second.state !== "ready") return;
      assert.notEqual(first.mediaId, second.mediaId);
      assert.equal(
        calls.filter((c) => c.url.includes("media/upload/initialize")).length,
        2
      );
    });

    test("orphaned uploads expire server-side (24h) and are never attached implicitly", async () => {
      const bytes = new Uint8Array(256).buffer as ArrayBuffer;
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes, mediaType: "image/jpeg", mediaCategory: "tweet_image" },
        deps()
      );
      // uploadXMedia returns the id to the caller only; no tweet is
      // created inside the upload path — attachment happens explicitly
      // in the tweet call, so a failed-then-retried flow cannot attach
      // a stale id by accident.
      assert.equal(result.state, "ready");
      assert.equal(
        calls.filter((c) => c.url.includes("/2/tweets")).length,
        0
      );
    });
  });

  describe("claim mechanics exclude in-flight targets (double-submit guard)", () => {
    test("PUBLISHING targets are never publishable: concurrent retry cannot claim them", () => {
      assert.deepEqual(
        selectPublishableTargetIds([
          { id: "x-1", status: "PUBLISHING" },
          { id: "x-2", status: "FAILED" },
          { id: "x-3", status: "PENDING" },
        ]),
        ["x-2", "x-3"]
      );
    });
  });
});
