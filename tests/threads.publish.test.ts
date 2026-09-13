import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.THREADS_POLL_DELAY_MS = "5";
process.env.THREADS_POLL_MAX_ATTEMPTS = "3";
process.env.THREADS_POLL_TIMEOUT_MS = "100";
process.env.THREADS_VIDEO_POLL_DELAY_MS = "5";
process.env.THREADS_VIDEO_POLL_MAX_ATTEMPTS = "3";
process.env.THREADS_VIDEO_POLL_TIMEOUT_MS = "100";

type ThreadsProviderType = typeof import("../src/lib/social/threads").ThreadsProvider;
let ThreadsProviderClass: ThreadsProviderType;

describe("ThreadsProvider.publishPost", () => {
  before(async () => {
    const mod = await import("../src/lib/social/threads");
    ThreadsProviderClass = mod.ThreadsProvider;
  });

  const originalFetch = globalThis.fetch;
  let statusQueue: Array<{ status: string; error_message?: string }> = [];
  let createHandler: () => Response;
  let publishHandler: () => Response;
  let statusFetches = 0;
  let publishFetches = 0;
  let lastCreateBody = "";

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  async function mockFetch(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (method === "GET") {
      statusFetches++;
      const next = statusQueue.shift() ?? { status: "IN_PROGRESS" };
      return json(200, { id: "779", ...next });
    }
    if (url.includes("threads_publish")) {
      publishFetches++;
      return publishHandler();
    }
    if (typeof init?.body === "string") lastCreateBody = init.body;
    return createHandler();
  }

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    statusFetches = 0;
    publishFetches = 0;
    statusQueue = [];
    lastCreateBody = "";
    createHandler = () => json(200, { id: "779" });
    publishHandler = () => json(200, { id: "888" });
    globalThis.fetch = mockFetch;
  });

  test("publishes once after container IN_PROGRESS -> FINISHED", async () => {
    statusQueue = [{ status: "IN_PROGRESS" }, { status: "FINISHED" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello world", "12345");

    assert.equal(res.success, true);
    assert.equal(res.externalPostId, "888");
    assert.equal(statusFetches, 2);
    assert.equal(publishFetches, 1);
  });

  test("publishes immediately when container is already FINISHED", async () => {
    statusQueue = [{ status: "FINISHED" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, true);
    assert.equal(res.externalPostId, "888");
    assert.equal(statusFetches, 1);
    assert.equal(publishFetches, 1);
  });

  test("publish is never called when container status is ERROR", async () => {
    statusQueue = [{ status: "ERROR", error_message: "media rejected" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /failed to process/);
    assert.match(res.error ?? "", /media rejected/);
    assert.equal(statusFetches, 1);
    assert.equal(publishFetches, 0);
  });

  test("fails with timeout after bounded polling while container stays IN_PROGRESS", async () => {
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /not ready/);
    assert.match(res.error ?? "", /3 attempts/);
    assert.equal(statusFetches, 3);
    assert.equal(publishFetches, 0);
  });

  test("returns diagnostic Meta error on threads_publish #100", async () => {
    statusQueue = [{ status: "FINISHED" }];
    publishHandler = () =>
      json(400, {
        error: {
          message: "The requested resource does not exist",
          type: "OAuthException",
          code: 100,
          error_subcode: 4279009,
          fbtrace_id: "AbC123",
        },
      });

    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /HTTP 400/);
    assert.match(res.error ?? "", /code=100/);
    assert.match(res.error ?? "", /subcode=4279009/);
    assert.match(res.error ?? "", /fbtrace_id=AbC123/);
    assert.match(res.error ?? "", /The requested resource does not exist/);
    assert.equal(publishFetches, 1);
  });

  test("prevents duplicate publish attempts on success path", async () => {
    statusQueue = [{ status: "IN_PROGRESS" }, { status: "FINISHED" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, true);
    assert.equal(publishFetches, 1);
  });

  test("returns diagnostic error on container creation failure", async () => {
    createHandler = () =>
      json(400, {
        error: { message: "Invalid parameter", code: 100 },
      });

    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /HTTP 400/);
    assert.match(res.error ?? "", /code=100/);
    assert.match(res.error ?? "", /Invalid parameter/);
    assert.equal(statusFetches, 0);
    assert.equal(publishFetches, 0);
  });

  test("code 190 on container creation maps to reconnect", async () => {
    createHandler = () =>
      json(400, {
        error: { message: "Invalid OAuth 2.0 Access Token", code: 190 },
      });

    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.equal(
      res.error,
      "Threads access expired or was revoked. Reconnect your Threads account."
    );
    assert.equal(statusFetches, 0);
    assert.equal(publishFetches, 0);
  });

  test("text-only posts keep the existing TEXT container flow", async () => {
    statusQueue = [{ status: "FINISHED" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    const params = new URLSearchParams(lastCreateBody);
    assert.equal(res.success, true);
    assert.equal(params.get("media_type"), "TEXT");
    assert.equal(params.get("text"), "hello");
    assert.equal(params.get("image_url"), null);
    assert.equal(publishFetches, 1);
  });

  test("one image creates an IMAGE container with image_url", async () => {
    statusQueue = [{ status: "IN_PROGRESS" }, { status: "FINISHED" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost(
      "token",
      "caption text",
      "12345",
      {
        url: "https://signed.example/media/u1/photo.jpg?expiry=111111&sig=abc",
        kind: "IMAGE",
      }
    );

    const params = new URLSearchParams(lastCreateBody);
    assert.equal(res.success, true);
    assert.equal(res.externalPostId, "888");
    assert.equal(params.get("media_type"), "IMAGE");
    assert.equal(
      params.get("image_url"),
      "https://signed.example/media/u1/photo.jpg?expiry=111111&sig=abc"
    );
    assert.equal(params.get("video_url"), null);
    assert.equal(params.get("text"), "caption text");
    assert.equal(statusFetches, 2, "image containers still poll until FINISHED");
    assert.equal(publishFetches, 1);
  });

  test("one video creates a VIDEO container with video_url and publishes after polling", async () => {
    statusQueue = [
      { status: "IN_PROGRESS" },
      { status: "IN_PROGRESS" },
      { status: "FINISHED" },
    ];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost(
      "token",
      "watch this",
      "12345",
      {
        url: "https://signed.example/media/u1/clip.mp4?expiry=222222&sig=abc",
        kind: "VIDEO",
      }
    );

    const params = new URLSearchParams(lastCreateBody);
    assert.equal(res.success, true);
    assert.equal(res.externalPostId, "888");
    assert.equal(params.get("media_type"), "VIDEO");
    assert.equal(
      params.get("video_url"),
      "https://signed.example/media/u1/clip.mp4?expiry=222222&sig=abc"
    );
    assert.equal(params.get("image_url"), null);
    assert.equal(params.get("text"), "watch this");
    assert.equal(statusFetches, 3, "video containers poll until FINISHED");
    assert.equal(publishFetches, 1);
  });

  test("video publishing fails with 'not ready' when container stays IN_PROGRESS", async () => {
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345", {
      url: "https://signed.example/clip.mp4",
      kind: "VIDEO",
    });

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /not ready/);
    assert.equal(statusFetches, 3);
    assert.equal(publishFetches, 0);
  });

  test("EXPIRED container is reported and never published", async () => {
    statusQueue = [{ status: "EXPIRED" }];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345", {
      url: "https://signed.example/clip.mp4",
      kind: "VIDEO",
    });

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /expired/);
    assert.equal(publishFetches, 0);
  });

  test("image container failure is reported as FAILED with the Meta error", async () => {
    statusQueue = [
      {
        status: "ERROR",
        error_message: "image_url is not publicly accessible",
      },
    ];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost(
      "token",
      "caption",
      "12345",
      { url: "https://signed.example/image.jpg", kind: "IMAGE" }
    );

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /failed to process/);
    assert.match(res.error ?? "", /image_url is not publicly accessible/);
    assert.equal(publishFetches, 0);
  });

  test("video container failure surfaces the Meta error_message", async () => {
    statusQueue = [
      {
        status: "ERROR",
        error_message: "video_url failed to download",
      },
    ];
    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "caption", "12345", {
      url: "https://signed.example/clip.mp4",
      kind: "VIDEO",
    });

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /failed to process/);
    assert.match(res.error ?? "", /video_url failed to download/);
    assert.equal(publishFetches, 0);
  });

  test("fails safely when create response has no container id", async () => {
    createHandler = () => json(200, {});

    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /missing container id/);
    assert.equal(publishFetches, 0);
  });
});