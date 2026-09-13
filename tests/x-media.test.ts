import { before, beforeEach, after, describe, test } from "node:test";
import assert from "node:assert/strict";

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string;
  form: { segmentIndex: string | null; chunkBytes: number | null } | null;
};

let calls: FetchCall[] = [];
let responses: Array<{
  match: (url: string, method: string) => boolean;
  run: (call: FetchCall) => Response | Promise<Response>;
}> = [];
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
  const rawBody = init?.body;
  let bodyText = "";
  let form: FetchCall["form"] = null;
  if (typeof rawBody === "string") {
    bodyText = rawBody;
  } else if (rawBody instanceof FormData) {
    const segmentIndex = rawBody.get("segment_index");
    const media = rawBody.get("media");
    form = {
      segmentIndex: typeof segmentIndex === "string" ? segmentIndex : null,
      chunkBytes: typeof media === "string" ? null : (media?.size ?? null),
    };
  }
  const call: FetchCall = {
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    headers: (init?.headers ?? {}) as Record<string, string>,
    bodyText,
    form,
  };
  calls.push(call);
  for (const route of responses) {
    if (route.match(call.url, call.method)) return route.run(call);
  }
  throw new Error(`unexpected fetch: ${call.method} ${url}`);
}

let xmod: typeof import("../src/lib/social/x");

function img(id: string, mime = "image/jpeg", size = 1024) {
  return { id, type: "IMAGE", mimeType: mime, size };
}

function bytes(length: number): ArrayBuffer {
  return new Uint8Array(length).buffer as ArrayBuffer;
}

describe("X media support (v2 chunked upload)", () => {
  before(async () => {
    xmod = await import("../src/lib/social/x");
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = recordingFetch;
    calls = [];
    responses = [];
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  function route(
    urlIncludes: string,
    run: (call: FetchCall) => Response | Promise<Response>,
    method = "POST"
  ) {
    responses.push({
      match: (url, actualMethod) => actualMethod === method && url.includes(urlIncludes),
      run,
    });
  }

  describe("resolveXMediaPolicy", () => {
    test("empty media keeps the text-only flow", () => {
      assert.deepEqual(xmod.resolveXMediaPolicy([]), { kind: "text" });
    });

    test("1-4 photos route to photo in order", () => {
      assert.deepEqual(xmod.resolveXMediaPolicy([img("a")]), {
        kind: "photo",
        mediaIds: ["a"],
      });
      const four = [img("a"), img("b", "image/png"), img("c", "image/webp"), img("d")];
      assert.deepEqual(xmod.resolveXMediaPolicy(four), {
        kind: "photo",
        mediaIds: ["a", "b", "c", "d"],
      });
    });

    test("5 photos are rejected", () => {
      const five = [img("a"), img("b"), img("c"), img("d"), img("e")];
      const result = xmod.resolveXMediaPolicy(five);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /at most 4/);
    });

    test("photo over 5 MB is rejected", () => {
      const result = xmod.resolveXMediaPolicy([img("a", "image/jpeg", 6 * 1024 * 1024)]);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /5 MB/);
    });

    test("single GIF routes to gif; oversized GIF rejected", () => {
      assert.deepEqual(xmod.resolveXMediaPolicy([img("g", "image/gif", 1024)]), {
        kind: "gif",
        mediaId: "g",
      });
      const big = xmod.resolveXMediaPolicy([img("g", "image/gif", 16 * 1024 * 1024)]);
      assert.equal(big.kind, "error");
      if (big.kind === "error") assert.match(big.message, /15 MB/);
    });

    test("GIF combined with anything else is rejected", () => {
      const result = xmod.resolveXMediaPolicy([img("g", "image/gif"), img("a")]);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /GIF/);
    });

    test("single MP4/MOV video routes to video; WebM rejected", () => {
      assert.deepEqual(
        xmod.resolveXMediaPolicy([{ id: "v", type: "VIDEO", mimeType: "video/mp4", size: 1024 }]),
        { kind: "video", mediaId: "v" }
      );
      assert.deepEqual(
        xmod.resolveXMediaPolicy([{ id: "v", type: "VIDEO", mimeType: "video/quicktime", size: 1024 }]),
        { kind: "video", mediaId: "v" }
      );
      const webm = xmod.resolveXMediaPolicy([
        { id: "v", type: "VIDEO", mimeType: "video/webm", size: 1024 },
      ]);
      assert.equal(webm.kind, "error");
      if (webm.kind === "error") assert.match(webm.message, /MP4 and MOV/);
    });

    test("two videos rejected; mixed photo+video fails closed", () => {
      const two = xmod.resolveXMediaPolicy([
        { id: "v1", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
        { id: "v2", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
      ]);
      assert.equal(two.kind, "error");
      const mixed = xmod.resolveXMediaPolicy([
        { id: "v", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
        img("a"),
      ]);
      assert.equal(mixed.kind, "error");
      if (mixed.kind === "error") assert.match(mixed.message, /mixing/);
    });
  });

  describe("xMediaCategoryForMime", () => {
    test("maps gif/video/image to official categories", () => {
      assert.equal(xmod.xMediaCategoryForMime("image/gif"), "tweet_gif");
      assert.equal(xmod.xMediaCategoryForMime("video/mp4"), "tweet_video");
      assert.equal(xmod.xMediaCategoryForMime("video/quicktime"), "tweet_video");
      assert.equal(xmod.xMediaCategoryForMime("image/jpeg"), "tweet_image");
      assert.equal(xmod.xMediaCategoryForMime("image/png"), "tweet_image");
    });
  });

  describe("uploadXMedia", () => {
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

    test("image: INIT → APPEND → FINALIZE without processing → ready", async () => {
      route("media/upload/initialize", (call) => {
        const body = JSON.parse(call.bodyText);
        assert.equal(body.media_type, "image/jpeg");
        assert.equal(body.total_bytes, 1024);
        assert.equal(body.media_category, "tweet_image");
        assert.equal(call.headers["Authorization"], "Bearer AT-1");
        return json(200, { data: { id: "mid-1", expires_after_secs: 86400 } });
      });
      route("media/upload/mid-1/append", (call) => {
        assert.equal(call.form?.segmentIndex, "0");
        assert.equal(call.form?.chunkBytes, 1024);
        return new Response(null, { status: 204 });
      });
      route("media/upload/mid-1/finalize", () =>
        json(200, { data: { id: "mid-1", size: 1024 } })
      );
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes: bytes(1024), mediaType: "image/jpeg", mediaCategory: "tweet_image" },
        deps()
      );
      assert.deepEqual(result, { state: "ready", mediaId: "mid-1" });
      assert.equal(calls.filter((c) => c.url.includes("initialize")).length, 1);
    });

    test("9 MB file splits into 4 MB segments with rising indexes", async () => {
      route("media/upload/initialize", () =>
        json(200, { data: { id: "mid-9", expires_after_secs: 86400 } })
      );
      route("media/upload/mid-9/append", () => json(200, {}));
      route("media/upload/mid-9/finalize", () => json(200, { data: { id: "mid-9" } }));
      const size = 9 * 1024 * 1024;
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes: bytes(size), mediaType: "video/mp4", mediaCategory: "tweet_video" },
        deps()
      );
      assert.deepEqual(result, { state: "ready", mediaId: "mid-9" });
      const appends = calls.filter((c) => c.url.includes("/append"));
      assert.deepEqual(
        appends.map((c) => c.form?.segmentIndex),
        ["0", "1", "2"]
      );
      assert.deepEqual(
        appends.map((c) => c.form?.chunkBytes),
        [4 * 1024 * 1024, 4 * 1024 * 1024, 1024 * 1024]
      );
    });

    test("video: pending → succeeded polls STATUS with the official endpoint", async () => {
      route("media/upload/initialize", () =>
        json(200, { data: { id: "mid-v", expires_after_secs: 86400 } })
      );
      route("media/upload/mid-v/append", () => json(200, {}));
      route("media/upload/mid-v/finalize", () =>
        json(200, {
          data: { id: "mid-v", processing_info: { state: "pending", check_after_secs: 1 } },
        })
      );
      const states = ["in_progress", "succeeded"];
      responses.push({
        match: (url, method) =>
          method === "GET" && url.includes("media/upload") && url.includes("command=STATUS"),
        run: () => {
          const state = states.shift() ?? "succeeded";
          return json(200, { data: { processing_info: { state, check_after_secs: 1 } } });
        },
      });
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes: bytes(2048), mediaType: "video/mp4", mediaCategory: "tweet_video" },
        deps()
      );
      assert.deepEqual(result, { state: "ready", mediaId: "mid-v" });
      const statusCall = calls.find((c) => c.method === "GET")!;
      assert.ok(statusCall.url.includes("command=STATUS"));
      assert.ok(statusCall.url.includes("media_id=mid-v"));
      assert.ok(!calls.some((c) => c.url.includes("initialize") && calls.indexOf(c) !== 0));
    });

    test("failed processing state maps to a user-readable error", async () => {
      route("media/upload/initialize", () =>
        json(200, { data: { id: "mid-f", expires_after_secs: 86400 } })
      );
      route("media/upload/mid-f/append", () => json(200, {}));
      route("media/upload/mid-f/finalize", () =>
        json(200, {
          data: {
            id: "mid-f",
            processing_info: { state: "failed", error: { code: 400, message: "bad codec" } },
          },
        })
      );
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes: bytes(128), mediaType: "video/mp4", mediaCategory: "tweet_video" },
        deps()
      );
      assert.equal(result.state, "failed");
      if (result.state === "failed") assert.match(result.error, /bad codec/);
    });

    test("INIT rejection maps through the error dictionary", async () => {
      route("media/upload/initialize", () =>
        json(400, { detail: "total_bytes exceeds the allowed maximum" })
      );
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes: bytes(64), mediaType: "image/jpeg", mediaCategory: "tweet_image" },
        deps()
      );
      assert.equal(result.state, "failed");
      if (result.state === "failed") assert.match(result.error, /exceeds/);
    });

    test("empty bytes fail without any network call", async () => {
      const result = await xmod.uploadXMedia(
        "AT-1",
        { bytes: bytes(0), mediaType: "image/jpeg", mediaCategory: "tweet_image" },
        deps()
      );
      assert.equal(result.state, "failed");
      assert.equal(calls.length, 0);
    });
  });

  describe("publishPostWithMedia", () => {
    test("tweet body carries media_ids when provided", async () => {
      route("2/tweets", (call) => {
        const body = JSON.parse(call.bodyText);
        assert.equal(body.text, "hello");
        assert.deepEqual(body.media, { media_ids: ["m1", "m2"] });
        return json(201, { data: { id: "tweet-1" } });
      });
      const provider = new xmod.XProvider();
      const result = await provider.publishPostWithMedia("AT-1", "hello", ["m1", "m2"]);
      assert.deepEqual(result, { success: true, externalPostId: "tweet-1" });
    });

    test("no media key without media ids (text path unchanged)", async () => {
      route("2/tweets", (call) => {
        const body = JSON.parse(call.bodyText);
        assert.equal(body.text, "hi");
        assert.ok(!("media" in body));
        return json(201, { data: { id: "tweet-2" } });
      });
      const provider = new xmod.XProvider();
      const result = await provider.publishPost("AT-1", "hi");
      assert.deepEqual(result, { success: true, externalPostId: "tweet-2" });
    });

    test("403 video-too-long detail maps to a friendly message via xErrorMessage", async () => {
      route("2/tweets", () =>
        json(403, { title: "Forbidden", detail: "This user is not allowed to post a video longer than 20 minutes." })
      );
      const provider = new xmod.XProvider();
      const result = await provider.publishPostWithMedia("AT-1", "hi", ["mv"]);
      assert.equal(result.success, false);
      assert.match(
        xmod.xErrorMessage(new Error(result.error ?? "")),
        /longer than your X account/i
      );
    });
  });
});
