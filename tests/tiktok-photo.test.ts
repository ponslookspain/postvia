import { before, beforeEach, after, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.TIKTOK_CLIENT_KEY = "test-client-key";
process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
delete process.env.TIKTOK_REDIRECT_URI;

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

let calls: FetchCall[] = [];
let responses: Array<{
  match: (url: string, body: string) => boolean;
  run: (call: FetchCall) => Response;
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
  const call: FetchCall = {
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: typeof init?.body === "string" ? init.body : "",
  };
  calls.push(call);
  for (const route of responses) {
    if (route.match(call.url, call.body)) return route.run(call);
  }
  throw new Error(`unexpected fetch: ${call.method} ${url}`);
}

function creatorResponse(overrides: Record<string, unknown> = {}) {
  return json(200, {
    data: {
      creator_username: "ponslookspain",
      creator_nickname: "Pons Look",
      privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: false,
      max_video_post_duration_sec: 300,
      ...overrides,
    },
    error: { code: "ok", message: "", log_id: "l1" },
  });
}

let tiktok: typeof import("../src/lib/social/tiktok");

function img(id: string, mime = "image/jpeg", size = 1024) {
  return { id, type: "IMAGE", mimeType: mime, size };
}

describe("TikTok photo support", () => {
  before(async () => {
    tiktok = await import("../src/lib/social/tiktok");
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
    run: (call: FetchCall) => Response,
    matchBody?: (body: string) => boolean
  ) {
    responses.push({
      match: (url, body) => url.includes(urlIncludes) && (matchBody ? matchBody(body) : true),
      run,
    });
  }

  describe("resolveTiktokMediaPolicy", () => {
    test("empty media is an error", () => {
      const result = tiktok.resolveTiktokMediaPolicy([]);
      assert.equal(result.kind, "error");
    });

    test("single JPEG routes to photo with cover 0", () => {
      const result = tiktok.resolveTiktokMediaPolicy([img("m1")]);
      assert.deepEqual(result, {
        kind: "photo",
        mediaIds: ["m1"],
        coverIndex: 0,
      });
    });

    test("single WebP routes to photo", () => {
      const result = tiktok.resolveTiktokMediaPolicy([img("m1", "image/webp")]);
      assert.equal(result.kind, "photo");
    });

    test("PNG is rejected for TikTok (global allows it, TikTok does not)", () => {
      const result = tiktok.resolveTiktokMediaPolicy([img("m1", "image/png")]);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /JPEG and WebP/);
    });

    test("GIF is rejected for TikTok", () => {
      const result = tiktok.resolveTiktokMediaPolicy([img("m1", "image/gif")]);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /JPEG and WebP/);
    });

    test("photo over 20 MB is rejected", () => {
      const result = tiktok.resolveTiktokMediaPolicy([
        img("m1", "image/jpeg", 21 * 1024 * 1024),
      ]);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /20 MB/);
    });

    test("more than 35 photos rejected by TikTok-specific validation", () => {
      const many = Array.from({ length: 36 }, (_, i) => img(`m${i}`));
      const result = tiktok.resolveTiktokMediaPolicy(many);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /35/);
    });

    test("multiple images accepted in order", () => {
      const result = tiktok.resolveTiktokMediaPolicy([
        img("a"),
        img("b", "image/webp"),
        img("c"),
      ]);
      assert.deepEqual(result, {
        kind: "photo",
        mediaIds: ["a", "b", "c"],
        coverIndex: 0,
      });
    });

    test("explicit cover index is honored, out-of-range rejected", () => {
      const ok = tiktok.resolveTiktokMediaPolicy([img("a"), img("b")], 1);
      assert.deepEqual(ok, { kind: "photo", mediaIds: ["a", "b"], coverIndex: 1 });
      const bad = tiktok.resolveTiktokMediaPolicy([img("a"), img("b")], 5);
      assert.equal(bad.kind, "error");
    });

    test("mixed image/video is rejected fail-closed", () => {
      const result = tiktok.resolveTiktokMediaPolicy([
        { id: "v", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
        img("m1"),
      ]);
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /mixing/);
    });

    test("single video still routes to video", () => {
      const result = tiktok.resolveTiktokMediaPolicy([
        { id: "v", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
      ]);
      assert.deepEqual(result, { kind: "video", mediaId: "v" });
    });

    test("multiple videos rejected", () => {
      const result = tiktok.resolveTiktokMediaPolicy([
        { id: "v1", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
        { id: "v2", type: "VIDEO", mimeType: "video/mp4", size: 1024 },
      ]);
      assert.equal(result.kind, "error");
    });
  });

  describe("buildTiktokPhotoInitPayload", () => {
    const creator = {
      creatorUsername: "u",
      creatorNickname: "n",
      privacyLevelOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: false,
      maxVideoPostDurationSec: 300,
    };

    test("exact payload contract", () => {
      const result = tiktok.buildTiktokPhotoInitPayload({
        title: "hello",
        settings: { privacyLevel: "SELF_ONLY" },
        creatorInfo: creator,
        photoUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.webp"],
        coverIndex: 0,
      });
      assert.ok("payload" in result);
      if (!("payload" in result)) return;
      assert.equal(result.payload.media_type, "PHOTO");
      assert.equal(result.payload.post_mode, "DIRECT_POST");
      assert.equal(result.payload.source_info.source, "PULL_FROM_URL");
      assert.deepEqual(result.payload.source_info.photo_images, [
        "https://cdn.example/a.jpg",
        "https://cdn.example/b.webp",
      ]);
      assert.equal(result.payload.source_info.photo_cover_index, 0);
      assert.equal(
        (result.payload.post_info as Record<string, unknown>).title,
        "hello"
      );
      assert.equal(
        (result.payload.post_info as Record<string, unknown>).privacy_level,
        "SELF_ONLY"
      );
      // Photo payload must not carry video-only fields.
      assert.ok(!("video_cover_timestamp_ms" in result.payload.post_info));
      assert.ok(!("disable_duet" in result.payload.post_info));
      assert.ok(!("disable_stitch" in result.payload.post_info));
    });

    test("order of photo_images is preserved, cover index kept", () => {
      const urls = ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg", "https://cdn.example/3.jpg"];
      const result = tiktok.buildTiktokPhotoInitPayload({
        title: "t",
        settings: {},
        creatorInfo: creator,
        photoUrls: urls,
        coverIndex: 2,
      });
      assert.ok("payload" in result);
      if (!("payload" in result)) return;
      assert.deepEqual(result.payload.source_info.photo_images, urls);
      assert.equal(result.payload.source_info.photo_cover_index, 2);
    });

    test("missing privacy options fail before network", () => {
      const result = tiktok.buildTiktokPhotoInitPayload({
        title: "t",
        settings: {},
        creatorInfo: { ...creator, privacyLevelOptions: [] },
        photoUrls: ["https://cdn.example/a.jpg"],
        coverIndex: 0,
      });
      assert.ok("error" in result);
    });
  });

  describe("publishTiktokDirectPhoto", () => {
    function deps() {
      const saved: string[] = [];
      let clock = 0;
      return {
        saved,
        deps: {
          onPublishId: async (publishId: string) => {
            saved.push(publishId);
          },
          sleep: async () => {
            clock += 1000;
          },
          pollIntervalMs: 1000,
          pollBudgetMs: 5000,
          now: () => clock,
        },
      };
    }

    test("creator-info → content/init → status, publish_id persisted immediately", async () => {
      route("creator_info", () => creatorResponse());
      let initBody: Record<string, unknown> | null = null;
      route("content/init", (call) => {
        initBody = JSON.parse(call.body);
        return json(200, {
          data: { publish_id: "PUB-PHOTO-1" },
          error: { code: "ok" },
        });
      });
      const statusQueue = [
        json(200, {
          data: { status: "PROCESSING_DOWNLOAD", publicaly_available_post_id: [] },
          error: { code: "ok" },
        }),
        json(200, {
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["9001"] },
          error: { code: "ok" },
        }),
      ];
      route("status/fetch", () => statusQueue.shift()!);

      const d = deps();
      const result = await tiktok.publishTiktokDirectPhoto(
        "AT-1",
        {
          title: "my carousel",
          settings: { privacyLevel: "SELF_ONLY" },
          photoUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.webp"],
          coverIndex: 0,
        },
        d.deps
      );
      assert.deepEqual(result, { state: "published", externalPostId: "9001" });
      assert.deepEqual(d.saved, ["PUB-PHOTO-1"]);
      const body = initBody as unknown as {
        media_type: string;
        post_mode: string;
        source_info: { source: string; photo_images: string[]; photo_cover_index: number };
      };
      assert.equal(body.media_type, "PHOTO");
      assert.equal(body.post_mode, "DIRECT_POST");
      assert.equal(body.source_info.source, "PULL_FROM_URL");
      assert.deepEqual(body.source_info.photo_images, [
        "https://cdn.example/a.jpg",
        "https://cdn.example/b.webp",
      ]);
      assert.equal(body.source_info.photo_cover_index, 0);
      assert.ok(!calls.some((c) => c.url.includes("video/init")), "never hits video endpoint");
    });

    test("existing publish_id only polls status — no second init", async () => {
      route("status/fetch", () =>
        json(200, {
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["555"] },
          error: { code: "ok" },
        })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectPhoto(
        "AT-1",
        {
          title: "hi",
          settings: {},
          photoUrls: ["https://cdn.example/a.jpg"],
          coverIndex: 0,
          existingPublishId: "PUB-existing",
        },
        d.deps
      );
      assert.deepEqual(result, { state: "published", externalPostId: "555" });
      assert.ok(!calls.some((c) => c.url.includes("content/init")));
      assert.ok(!calls.some((c) => c.url.includes("creator_info")));
      assert.deepEqual(d.saved, []);
    });

    test("poll budget exhausted stays resumable", async () => {
      route("creator_info", () => creatorResponse());
      route("content/init", () =>
        json(200, { data: { publish_id: "PUB-PHOTO-4" }, error: { code: "ok" } })
      );
      route("status/fetch", () =>
        json(200, {
          data: { status: "PROCESSING_PUBLISH", publicaly_available_post_id: [] },
          error: { code: "ok" },
        })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectPhoto(
        "AT-1",
        {
          title: "hi",
          settings: {},
          photoUrls: ["https://cdn.example/a.jpg"],
          coverIndex: 0,
        },
        d.deps
      );
      assert.deepEqual(result, { state: "processing", publishId: "PUB-PHOTO-4" });
      assert.deepEqual(d.saved, ["PUB-PHOTO-4"]);
    });

    test("missing title and description is invalid before creator-info", async () => {
      const d = deps();
      const result = await tiktok.publishTiktokDirectPhoto(
        "AT-1",
        { title: "   ", settings: {}, photoUrls: ["https://cdn.example/a.jpg"], coverIndex: 0 },
        d.deps
      );
      assert.equal(result.state, "invalid");
      assert.ok(!calls.some((c) => c.url.includes("creator_info")));
    });

    test("FAILED status maps fail reason", async () => {
      route("creator_info", () => creatorResponse());
      route("content/init", () =>
        json(200, { data: { publish_id: "PUB-PHOTO-5" }, error: { code: "ok" } })
      );
      route("status/fetch", () =>
        json(200, {
          data: { status: "FAILED", fail_reason: "spam_risk_too_many_posts" },
          error: { code: "ok" },
        })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectPhoto(
        "AT-1",
        {
          title: "hi",
          settings: {},
          photoUrls: ["https://cdn.example/a.jpg"],
          coverIndex: 0,
        },
        d.deps
      );
      assert.equal(result.state, "failed");
    });
  });

  describe("photo error mapping", () => {
    test("url_ownership_unverified explains domain verification", () => {
      const message = tiktok.tiktokErrorMessage(
        new tiktok.TiktokApiError("url_ownership_unverified", "", 400)
      );
      assert.match(message, /not verified|verified/i);
      assert.match(message, /TikTok/);
    });

    test("invalid_param and photo validation map to friendly messages", () => {
      assert.match(
        tiktok.tiktokErrorMessage(new tiktok.TiktokApiError("invalid_param", "", 400)),
        /photo/i
      );
      assert.match(
        tiktok.tiktokErrorMessage(new tiktok.TiktokApiError("scope_not_authorized", "", 403)),
        /Reconnect/
      );
    });

    test("fail reason keeps raw code for unknown reasons", () => {
      assert.match(tiktok.tiktokFailReasonMessage("mystery_xyz"), /mystery_xyz/);
    });
  });
});
