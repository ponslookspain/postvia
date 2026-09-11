import { after, before, beforeEach, describe, test } from "node:test";
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
let responses: Array<{ match: (url: string, body: string) => boolean; run: (call: FetchCall) => Response }> = [];
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

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const UPLOAD_URL = "https://upload.example.tiktok/video/?upload_id=7&upload_token=t";

function tokenResponse() {
  return json(200, {
    access_token: "AT-1",
    expires_in: 86400,
    refresh_token: "RT-2",
    refresh_expires_in: 999999,
    open_id: "oid-9",
    scope: "user.info.basic video.publish",
    token_type: "Bearer",
  });
}

function creatorResponse(overrides: Record<string, unknown> = {}) {
  return json(200, {
    data: {
      creator_avatar_url: "https://avatar",
      creator_username: "ponslookspain",
      creator_nickname: "Pons Look",
      privacy_level_options: ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS"],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: true,
      max_video_post_duration_sec: 300,
      ...overrides,
    },
    error: { code: "ok", message: "", log_id: "l1" },
  });
}

let tiktok: typeof import("../src/lib/social/tiktok");

describe("TikTok social layer", () => {
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

  describe("authorize + token exchange", () => {
    test("authorize URL uses v2 endpoint, comma scopes and exact redirect URI", () => {
      const url = tiktok.getTiktokAuthorizeUrl("state-123");
      assert.ok(url.startsWith("https://www.tiktok.com/v2/auth/authorize/"));
      const params = new URL(url).searchParams;
      assert.equal(params.get("client_key"), "test-client-key");
      assert.equal(params.get("response_type"), "code");

      // TikTok contract: scope is a comma-separated string of scopes.
      const scope = params.get("scope");
      assert.equal(scope, "user.info.basic,video.publish");
      const scopes = (scope ?? "").split(",");
      assert.deepEqual(scopes, ["user.info.basic", "video.publish"]);
      assert.ok(
        !url.includes("user.info.basic+video.publish"),
        "space-joined scopes would encode as '+' and TikTok rejects them"
      );
      assert.ok(
        /scope=user\.info\.basic(%2C|,)video\.publish/.test(url),
        `raw URL must carry comma-separated scopes, got: ${url}`
      );

      assert.equal(
        params.get("redirect_uri"),
        "https://postvia.vercel.app/api/auth/tiktok/callback"
      );
      assert.equal(params.get("state"), "state-123");
      assert.ok(!url.includes("test-client-secret"), "secret never in the URL");
    });

    test("code exchange posts form body with matching redirect_uri", async () => {
      route("oauth/token", () => tokenResponse());
      const tokens = await tiktok.exchangeTiktokCode("the-code");
      assert.equal(tokens.access_token, "AT-1");
      assert.equal(tokens.refresh_token, "RT-2");
      assert.equal(tokens.open_id, "oid-9");

      const call = calls.find((item) => item.url === TOKEN_URL)!;
      assert.equal(call.method, "POST");
      const form = new URLSearchParams(call.body);
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("code"), "the-code");
      assert.equal(form.get("client_secret"), "test-client-secret");
      assert.equal(
        form.get("redirect_uri"),
        "https://postvia.vercel.app/api/auth/tiktok/callback"
      );
    });

    test("refresh uses refresh_token grant and rotated tokens come back", async () => {
      route("oauth/token", () => tokenResponse());
      const tokens = await tiktok.refreshTiktokToken("RT-old");
      assert.equal(tokens.access_token, "AT-1");
      assert.equal(tokens.refresh_token, "RT-2");
      const form = new URLSearchParams(calls[0].body);
      assert.equal(form.get("grant_type"), "refresh_token");
      assert.equal(form.get("refresh_token"), "RT-old");
    });

    test("user info uses basic fields", async () => {
      route(
        "user/info",
        () =>
          json(200, {
            data: { user: { open_id: "oid-9", display_name: "Pons Look", avatar_url: "a" } },
            error: { code: "ok" },
          })
      );
      const user = await tiktok.fetchTiktokUserInfo("AT-1");
      assert.equal(user.openId, "oid-9");
      assert.equal(user.displayName, "Pons Look");
    });

    test("revoke is best-effort and never throws", async () => {
      route("oauth/revoke", () => json(200, { data: {}, error: { code: "ok" } }));
      assert.equal(await tiktok.revokeTiktokToken("AT-1"), true);
      const form = new URLSearchParams(calls[0].body);
      assert.equal(form.get("token"), "AT-1");
    });
  });

  describe("creator info", () => {
    test("parses privacy options and permission flags", async () => {
      route("creator_info", () => creatorResponse());
      const info = await tiktok.queryTiktokCreatorInfo("AT-1");
      assert.deepEqual(info.privacyLevelOptions, [
        "SELF_ONLY",
        "MUTUAL_FOLLOW_FRIENDS",
      ]);
      assert.equal(info.creatorUsername, "ponslookspain");
      assert.equal(info.stitchDisabled, true);
      assert.equal(info.maxVideoPostDurationSec, 300);
    });
  });

  describe("chunk planning", () => {
    const MB = 1024 * 1024;

    test("files up to 64 MB upload as one whole chunk", () => {
      assert.deepEqual(tiktok.planTiktokChunks(4 * MB), { chunkSize: 4 * MB, totalChunkCount: 1 });
      assert.deepEqual(tiktok.planTiktokChunks(64 * MB), {
        chunkSize: 64 * MB,
        totalChunkCount: 1,
      });
    });

    test("larger files split with the final chunk absorbing the remainder", () => {
      const size = 100 * MB;
      const plan = tiktok.planTiktokChunks(size);
      assert.ok(plan.totalChunkCount >= 2);
      const ranges = tiktok.tiktokChunkRanges(size, plan);
      assert.equal(ranges[0].start, 0);
      assert.equal(ranges.at(-1)!.end, size - 1);
      assert.equal(ranges.at(-1)!.last, true);
      for (const range of ranges.slice(0, -1)) {
        assert.equal(range.length, plan.chunkSize);
        assert.ok(range.length >= 5 * MB && range.length <= 64 * MB);
      }
      const covered = ranges.reduce((sum, range) => sum + range.length, 0);
      assert.equal(covered, size);
    });
  });

  describe("publishTiktokDirectVideo", () => {
    function deps(overrides: Partial<import("../src/lib/social/tiktok").TiktokDirectPostDeps> = {}) {
      const saved: string[] = [];
      let clock = 0;
      return {
        saved,
        deps: {
          readChunk: async (range: { start: number; end: number; length: number }) =>
            new Uint8Array(range.length).buffer,
          onPublishId: async (publishId: string) => {
            saved.push(publishId);
          },
          sleep: async () => {
            clock += 1000;
          },
          pollIntervalMs: 1000,
          pollBudgetMs: 5000,
          now: () => clock,
          ...overrides,
        },
      };
    }

    test("runs creator-info → init → upload → status and persists publish_id BEFORE upload", async () => {
      const statusQueue = [
        json(200, {
          data: { status: "PROCESSING_UPLOAD", publicaly_available_post_id: [] },
          error: { code: "ok" },
        }),
        json(200, {
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["9001"] },
          error: { code: "ok" },
        }),
      ];
      route("creator_info", () => creatorResponse());
      route("video/init", () =>
        json(200, { data: { publish_id: "PUB-1", upload_url: UPLOAD_URL }, error: { code: "ok" } })
      );
      let uploadSeen = false;
      route("upload.example", (call) => {
        uploadSeen = true;
        assert.equal(call.method, "PUT");
        assert.equal(call.headers["Content-Type"], "video/mp4");
        assert.match(call.headers["Content-Range"], /^bytes 0-\d+\/\d+$/);
        return json(201, {});
      });
      route("status/fetch", () => statusQueue.shift()!);
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        {
          title: "hello #fyp",
          settings: { privacyLevel: "SELF_ONLY" },
          videoSize: 4 * 1024 * 1024,
          videoContentType: "video/mp4",
        },
        d.deps
      );
      assert.deepEqual(result, { state: "published", externalPostId: "9001" });
      assert.deepEqual(d.saved, ["PUB-1"]);
      assert.ok(uploadSeen);
    });

    test("init payload carries title, enforced privacy and creator-disabled flags", async () => {
      route("creator_info", () => creatorResponse({ duet_disabled: true }));
      let initBody: {
        post_info: Record<string, unknown>;
        source_info: Record<string, unknown>;
      } | null = null;
      route(
        "video/init",
        (call) => {
          initBody = JSON.parse(call.body);
          return json(200, { data: { publish_id: "PUB-2", upload_url: UPLOAD_URL }, error: { code: "ok" } });
        }
      );
      route("upload.example", () => json(201, {}));
      route("status/fetch", () =>
        json(200, { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [] }, error: { code: "ok" } })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        {
          title: "caption",
          settings: {
            privacyLevel: "SELF_ONLY",
            disableComment: false,
            disableDuet: false, // user wanted duet…
            videoCoverTimestampMs: 1000,
          },
          videoSize: 1024,
          videoContentType: "video/mp4",
        },
        d.deps
      );
      assert.equal(result.state, "published");
      const captured = initBody as unknown as {
        post_info: Record<string, unknown>;
        source_info: Record<string, unknown>;
      };
      const postInfo = captured.post_info;
      assert.equal(postInfo.title, "caption");
      assert.equal(postInfo.privacy_level, "SELF_ONLY");
      assert.equal(postInfo.disable_duet, true, "creator duet_disabled wins");
      assert.equal(postInfo.disable_comment, false);
      assert.equal(postInfo.disable_stitch, true);
      assert.equal(postInfo.video_cover_timestamp_ms, 1000);
      const sourceInfo = captured.source_info;
      assert.equal(sourceInfo.source, "FILE_UPLOAD");
      assert.equal(sourceInfo.video_size, 1024);
      assert.equal(sourceInfo.total_chunk_count, 1);
      assert.equal(sourceInfo.chunk_size, 1024);
    });

    test("privacy not in creator options fails BEFORE init (no publish_id, no upload)", async () => {
      route("creator_info", () => creatorResponse());
      route("video/init", () => {
        throw new Error("init must not be called for invalid privacy");
      });
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        {
          title: "hi",
          settings: { privacyLevel: "PUBLIC_TO_EVERYONE" },
          videoSize: 1024,
          videoContentType: "video/mp4",
        },
        d.deps
      );
      assert.equal(result.state, "invalid");
      assert.deepEqual(d.saved, []);
      assert.ok(!calls.some((call) => call.url.includes("video/init")));
    });

    test("FAILED status surfaces the TikTok fail_reason", async () => {
      route("creator_info", () => creatorResponse());
      route("video/init", () =>
        json(200, { data: { publish_id: "PUB-3", upload_url: UPLOAD_URL }, error: { code: "ok" } })
      );
      route("upload.example", () => json(201, {}));
      route("status/fetch", () =>
        json(200, {
          data: { status: "FAILED", fail_reason: "video_duration_exceeds_limit" },
          error: { code: "ok" },
        })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        { title: "hi", settings: {}, videoSize: 1024, videoContentType: "video/mp4" },
        d.deps
      );
      assert.equal(result.state, "failed");
      if (result.state === "failed") {
        assert.match(result.error, /video_duration_exceeds_limit/);
      }
    });

    test("existing publish_id only fetches status — a second init can never happen", async () => {
      route("status/fetch", () =>
        json(200, {
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["555"] },
          error: { code: "ok" },
        })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        {
          title: "hi",
          settings: {},
          videoSize: 1024,
          videoContentType: "video/mp4",
          existingPublishId: "PUB-existing",
        },
        d.deps
      );
      assert.deepEqual(result, { state: "published", externalPostId: "555" });
      assert.ok(!calls.some((call) => call.url.includes("video/init")));
      assert.ok(!calls.some((call) => call.url.includes("creator_info")));
      const statusBody = JSON.parse(calls.find((call) => call.url.includes("status/fetch"))!.body);
      assert.equal(statusBody.publish_id, "PUB-existing");
    });

    test("poll budget exhausted keeps the job resumable (state processing)", async () => {
      route("creator_info", () => creatorResponse());
      route("video/init", () =>
        json(200, { data: { publish_id: "PUB-4", upload_url: UPLOAD_URL }, error: { code: "ok" } })
      );
      route("upload.example", () => json(206, {}));
      route("status/fetch", () =>
        json(200, { data: { status: "PROCESSING_TRANSCODING", publicaly_available_post_id: [] }, error: { code: "ok" } })
      );
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        { title: "hi", settings: {}, videoSize: 1024, videoContentType: "video/mp4" },
        d.deps
      );
      assert.deepEqual(result, { state: "processing", publishId: "PUB-4" });
      assert.deepEqual(d.saved, ["PUB-4"]);
      assert.equal(
        calls.filter((call) => call.url.includes("video/init")).length,
        1,
        "only one init ever"
      );
    });

    test("transient status-fetch failure keeps monitoring instead of failing", async () => {
      route("creator_info", () => creatorResponse());
      route("video/init", () =>
        json(200, { data: { publish_id: "PUB-5", upload_url: UPLOAD_URL }, error: { code: "ok" } })
      );
      route("upload.example", () => json(201, {}));
      let statusCalls = 0;
      route("status/fetch", () => {
        statusCalls++;
        if (statusCalls === 1) throw new Error("network blip");
        return json(200, {
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["777"] },
          error: { code: "ok" },
        });
      });
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        { title: "hi", settings: {}, videoSize: 1024, videoContentType: "video/mp4" },
        d.deps
      );
      assert.deepEqual(result, { state: "published", externalPostId: "777" });
    });

    test("upload failure is reported and publish_id stays for safe resume", async () => {
      route("creator_info", () => creatorResponse());
      route("video/init", () =>
        json(200, { data: { publish_id: "PUB-6", upload_url: UPLOAD_URL }, error: { code: "ok" } })
      );
      route("upload.example", () => json(403, {}));
      const d = deps();
      const result = await tiktok.publishTiktokDirectVideo(
        "AT-1",
        { title: "hi", settings: {}, videoSize: 1024, videoContentType: "video/mp4" },
        d.deps
      );
      assert.equal(result.state, "failed");
      assert.deepEqual(d.saved, ["PUB-6"]);
    });
  });

  describe("error mapping", () => {
    test("known TikTok error codes become user-readable messages", () => {
      assert.match(
        tiktok.tiktokErrorMessage(new tiktok.TiktokApiError("rate_limit_exceeded", "", 429)),
        /rate limit/i
      );
      assert.match(
        tiktok.tiktokErrorMessage(
          new tiktok.TiktokApiError("scope_not_authorized", "", 403)
        ),
        /Reconnect your TikTok account/
      );
      assert.match(
        tiktok.tiktokErrorMessage(
          new tiktok.TiktokApiError(
            "unaudited_client_can_only_post_to_private_accounts",
            "",
            403
          )
        ),
        /not audited yet/
      );
    });
  });
});
