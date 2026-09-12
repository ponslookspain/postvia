import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.INSTAGRAM_APP_ID = "ig-client-id";
process.env.INSTAGRAM_APP_SECRET = "ig-client-secret";
delete process.env.INSTAGRAM_REDIRECT_URI;

type FetchCall = { url: string; method: string; body: string };

let calls: FetchCall[] = [];
let routes: Array<{
  match: (url: string, method: string, body: string) => boolean;
  run: (url: string, method: string, body: string) => Response;
}> = [];
let originalFetch: typeof globalThis.fetch;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function router(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const url =
    input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : "";
  calls.push({ url, method, body });
  for (const r of routes) {
    if (r.match(url, method, body)) return r.run(url, method, body);
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
}

function route(match: (url: string, method: string, body: string) => boolean, run: (url: string, method: string, body: string) => Response) {
  routes.push({ match, run });
}

function form(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] ?? "");
}
function bodyForm(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

let insta: typeof import("../src/lib/social/instagram");
let composer: typeof import("../src/lib/composer-previews");
let caps: typeof import("../src/lib/platforms/capabilities");
let publish: typeof import("../src/lib/publish");

const IG_ID = "17841111111111111";

describe("Instagram social layer", () => {
  before(async () => {
    insta = await import("../src/lib/social/instagram");
    composer = await import("../src/lib/composer-previews");
    caps = await import("../src/lib/platforms/capabilities");
    publish = await import("../src/lib/publish");
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = router;
    calls = [];
    routes = [];
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  describe("OAuth", () => {
    test("authorize URL uses Instagram login endpoint, comma scopes, state and exact redirect", () => {
      const url = insta.getInstagramAuthorizeUrl("st-42");
      assert.ok(url.startsWith("https://www.instagram.com/oauth/authorize"));
      const params = new URL(url).searchParams;
      assert.equal(params.get("client_id"), "ig-client-id");
      assert.equal(params.get("response_type"), "code");
      assert.equal(
        params.get("scope"),
        "instagram_business_basic,instagram_business_content_publish"
      );
      assert.equal(
        params.get("redirect_uri"),
        "https://postvia.online/api/auth/instagram/callback"
      );
      assert.equal(params.get("state"), "st-42");
      assert.ok(!url.includes("ig-client-secret"), "secret never in the URL");
    });

    test("code exchange does short -> long-lived and persists no secrets", async () => {
      route((u) => u.includes("api.instagram.com/oauth/access_token"), () =>
        json(200, { access_token: "SHORT", expires_in: 3600, user_id: IG_ID })
      );
      route((u) => u.includes("graph.instagram.com") && u.includes("access_token"), () =>
        json(200, { access_token: "LONG", token_type: "bearer", expires_in: 5184000, user_id: IG_ID })
      );
      const tokens = await insta.exchangeInstagramCode("the-code");
      assert.equal(tokens.accessToken, "LONG");
      // redirect_uri in the first (code) call must match the authorize redirect
      const firstBody = bodyForm(calls[0].body);
      assert.equal(firstBody.get("grant_type"), "authorization_code");
      assert.equal(firstBody.get("code"), "the-code");
      assert.equal(
        firstBody.get("redirect_uri"),
        "https://postvia.online/api/auth/instagram/callback"
      );
      assert.ok(tokens.expiresAt.getTime() > Date.now());
    });

    test("refresh uses ig_refresh_token grant", async () => {
      route((u) => u.includes("refresh_access_token"), () =>
        json(200, { access_token: "NEW", token_type: "bearer", expires_in: 5184000 })
      );
      const tokens = await insta.refreshInstagramToken("OLD");
      assert.equal(tokens.accessToken, "NEW");
      assert.equal(form(calls[0].url).get("grant_type"), "ig_refresh_token");
    });

    test("ensureFresh returns cached token when far from expiry (no refresh call)", async () => {
      const token = await insta.ensureFreshInstagramToken({
        id: "acc",
        accessToken: "LIVE",
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
      assert.equal(token, "LIVE");
      assert.equal(calls.length, 0);
    });

    test("revoke is best-effort", async () => {
      route((u, m) => m === "DELETE" && u.includes("/access_tokens"), () => json(200, { ok: true }));
      assert.equal(await insta.revokeInstagramToken(IG_ID, "tok"), true);
    });

    test("profile fetch returns id + username", async () => {
      route((u) => u.includes("/me"), () =>
        json(200, { id: IG_ID, username: "ponslook", account_type: "BUSINESS" })
      );
      const profile = await insta.fetchInstagramProfile("tok");
      assert.equal(profile.id, IG_ID);
      assert.equal(profile.username, "ponslook");
    });
  });

  describe("container publish flow", () => {
    function happyPhotoRoutes(statusQueue: Response[]) {
      route((u, m) => m === "POST" && /\/media$/.test(u.split("?")[0]), () =>
        json(200, { id: "CONTAINER-1" })
      );
      route((u, m) => m === "GET" && u.includes("CONTAINER-1") && u.includes("status_code"), () =>
        statusQueue.shift()!
      );
      route((u, m) => m === "POST" && u.includes("media_publish"), () =>
        json(200, { id: "MEDIA-99" })
      );
    }

    test("photo: create container -> persist id -> FINISHED -> publish", async () => {
      happyPhotoRoutes([json(200, { status_code: "FINISHED", id: "CONTAINER-1" })]);
      const saved: string[] = [];
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "https://signed/photo.jpg", caption: "hi" },
        { onContainerId: async (id) => { saved.push(id); }, sleep: async () => {} }
      );
      assert.deepEqual(outcome, { state: "published", externalPostId: "MEDIA-99" });
      assert.deepEqual(saved, ["CONTAINER-1"]);
      const containerCall = calls.find((c) => c.method === "POST" && /\/media$/.test(c.url.split("?")[0]))!;
      const body = bodyForm(containerCall.body);
      assert.equal(body.get("image_url"), "https://signed/photo.jpg");
      assert.equal(body.get("caption"), "hi");
      assert.equal(body.get("media_type"), null);
    });

    test("reel: creates REELS container with video_url", async () => {
      happyPhotoRoutes([json(200, { status_code: "FINISHED" })]);
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "VIDEO", mediaUrl: "https://signed/clip.mp4", caption: "watch" },
        { onContainerId: async () => {}, sleep: async () => {} }
      );
      assert.equal(outcome.state, "published");
      const containerCall = calls.find((c) => c.method === "POST" && /\/media$/.test(c.url.split("?")[0]))!;
      const body = bodyForm(containerCall.body);
      assert.equal(body.get("media_type"), "REELS");
      assert.equal(body.get("video_url"), "https://signed/clip.mp4");
    });

    test("IN_PROGRESS -> FINISHED -> publish polls until ready", async () => {
      let clock = 0;
      happyPhotoRoutes([
        json(200, { status_code: "IN_PROGRESS" }),
        json(200, { status_code: "FINISHED" }),
      ]);
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "u", caption: "hi" },
        {
          onContainerId: async () => {},
          sleep: async () => { clock += 1000; },
          pollIntervalMs: 1000,
          pollBudgetMs: 30000,
          now: () => clock,
        }
      );
      assert.equal(outcome.state, "published");
    });

    test("ERROR container -> failed (no publish)", async () => {
      route((u, m) => m === "POST" && /\/media$/.test(u.split("?")[0]), () => json(200, { id: "C" }));
      route((u, m) => m === "GET", () => json(200, { status_code: "ERROR", status: "Unsupported image" }));
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "u", caption: "hi" },
        { onContainerId: async () => {}, sleep: async () => {} }
      );
      assert.equal(outcome.state, "failed");
      assert.ok(!calls.some((c) => c.url.includes("media_publish")));
    });

    test("EXPIRED container -> failed with retry wording", async () => {
      route((u, m) => m === "POST" && /\/media$/.test(u.split("?")[0]), () => json(200, { id: "C" }));
      route((u, m) => m === "GET", () => json(200, { status_code: "EXPIRED" }));
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "u", caption: "hi" },
        { onContainerId: async () => {}, sleep: async () => {} }
      );
      assert.equal(outcome.state, "failed");
      if (outcome.state === "failed") assert.match(outcome.error, /expired/i);
    });

    test("caption too long is invalid before any network call", async () => {
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "u", caption: "x".repeat(2201) },
        { onContainerId: async () => {}, sleep: async () => {} }
      );
      assert.equal(outcome.state, "invalid");
      assert.equal(calls.length, 0);
    });
  });

  describe("resume (no second container)", () => {
    test("resume PUBLISHED container publishes nothing new", async () => {
      route((u, m) => m === "GET", () => json(200, { status_code: "PUBLISHED" }));
      const outcome = await insta.monitorInstagramContainer(
        "tok",
        { igUserId: IG_ID, containerId: "EXISTING" },
        { sleep: async () => {} }
      );
      assert.deepEqual(outcome, { state: "published", externalPostId: null });
      assert.ok(!calls.some((c) => c.method === "POST" && /\/media$/.test(c.url.split("?")[0])));
    });

    test("resume FINISHED container publishes WITHOUT creating a second container", async () => {
      route((u, m) => m === "GET", () => json(200, { status_code: "FINISHED" }));
      route((u, m) => m === "POST" && u.includes("media_publish"), () =>
        json(200, { id: "MEDIA-7" })
      );
      const saved: string[] = [];
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "u", caption: "hi", existingContainerId: "EXISTING" },
        { onContainerId: async (id) => { saved.push(id); }, sleep: async () => {} }
      );
      assert.deepEqual(outcome, { state: "published", externalPostId: "MEDIA-7" });
      assert.equal(saved.length, 0, "no new container persisted on resume");
      assert.ok(!calls.some((c) => c.method === "POST" && /\/media$/.test(c.url.split("?")[0])));
    });

    test("poll budget exhausted keeps the job resumable (processing)", async () => {
      route((u, m) => m === "POST" && /\/media$/.test(u.split("?")[0]), () => json(200, { id: "C" }));
      route((u, m) => m === "GET", () => json(200, { status_code: "IN_PROGRESS" }));
      let clock = 0;
      const outcome = await insta.publishInstagramMedia(
        "tok",
        { igUserId: IG_ID, kind: "IMAGE", mediaUrl: "u", caption: "hi" },
        {
          onContainerId: async () => {},
          sleep: async () => { clock += 5000; },
          pollIntervalMs: 5000,
          pollBudgetMs: 10000,
          now: () => clock,
        }
      );
      assert.deepEqual(outcome, { state: "processing", containerId: "C" });
    });
  });

  describe("error mapping", () => {
    test("professional-account / permission errors", () => {
      assert.match(
        insta.instagramErrorMessage(
          new insta.InstagramApiError("10", "This account must be a Business or Creator account", 400)
        ),
        /Business\/Creator|permission/i
      );
    });
    test("publishing rate limit", () => {
      assert.match(
        insta.instagramErrorMessage(
          new insta.InstagramApiError("9", "publishing limit reached", 429)
        ),
        /100 posts/i
      );
    });
    test("token / session errors ask to reconnect", () => {
      assert.match(
        insta.instagramErrorMessage(
          new insta.InstagramApiError("190", "Error validating access token", 401, "OAuthException")
        ),
        /Reconnect/i
      );
    });
  });

  describe("capabilities + media gate + aggregate", () => {
    test("INSTAGRAM capability is implemented, media-only, jpeg+mp4, caption 2200", () => {
      const c = caps.getPlatformCapabilities("INSTAGRAM");
      assert.equal(c.implemented, true);
      assert.equal(c.supportsText, false);
      assert.equal(c.media.image, true);
      assert.equal(c.media.video, true);
      assert.equal(c.media.maxItems, 1);
      assert.deepEqual(c.media.mimeTypes, ["image/jpeg", "video/mp4"]);
      assert.equal(c.fields[0].maxLength, 2200);
    });

    function gate(media: { type: "IMAGE" | "VIDEO"; mimeType: string }[]) {
      return composer.buildComposerMediaErrors(
        [{ id: "a", platform: "INSTAGRAM" as never, username: "ponslook" }],
        media
      );
    }

    test("media gate: JPEG or MP4 accepted", () => {
      assert.deepEqual(gate([{ type: "IMAGE", mimeType: "image/jpeg" }]), []);
      assert.deepEqual(gate([{ type: "VIDEO", mimeType: "video/mp4" }]), []);
    });
    test("media gate: png / webm / gif rejected with clear message", () => {
      assert.match(gate([{ type: "IMAGE", mimeType: "image/png" }]).join(" "), /does not support image\/png/i);
      assert.match(gate([{ type: "VIDEO", mimeType: "video/webm" }]).join(" "), /does not support video\/webm/i);
      assert.match(gate([{ type: "IMAGE", mimeType: "image/gif" }]).join(" "), /gif/i);
    });
    test("media gate: 0 media rejected for Instagram", () => {
      assert.match(gate([]).join(" "), /requires exactly one media/i);
    });
    test("media gate: >1 media rejected", () => {
      const errors = gate([
        { type: "IMAGE", mimeType: "image/jpeg" },
        { type: "IMAGE", mimeType: "image/jpeg" },
      ]);
      assert.match(errors.join(" "), /at most 1 media/i);
    });

    test("text-only does not block X/Threads (no Instagram selected)", () => {
      const errors = composer.buildComposerMediaErrors(
        [
          { id: "x", platform: "X" as never, username: "design" },
          { id: "t", platform: "THREADS" as never, username: "look" },
        ],
        []
      );
      assert.deepEqual(errors, []);
    });

    test("aggregate: Threads published + Instagram failed => PARTIALLY_PUBLISHED", () => {
      assert.equal(
        publish.derivePostStatus([
          { status: "PUBLISHED" },
          { status: "FAILED" },
        ]),
        "PARTIALLY_PUBLISHED"
      );
    });
    test("aggregate: all published => PUBLISHED", () => {
      assert.equal(
        publish.derivePostStatus([{ status: "PUBLISHED" }, { status: "PUBLISHED" }]),
        "PUBLISHED"
      );
    });
    test("retry selects only non-published targets", () => {
      assert.deepEqual(
        publish.selectPublishableTargetIds([
          { id: "threads", status: "PUBLISHED" },
          { id: "ig", status: "FAILED" },
        ]),
        ["ig"]
      );
    });
  });
});
