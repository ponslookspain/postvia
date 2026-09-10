import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.THREADS_POLL_DELAY_MS = "5";
process.env.THREADS_POLL_MAX_ATTEMPTS = "3";
process.env.THREADS_POLL_TIMEOUT_MS = "100";

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
    return createHandler();
  }

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    statusFetches = 0;
    publishFetches = 0;
    statusQueue = [];
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
        error: { message: "Invalid OAuth 2.0 Access Token", code: 190 },
      });

    const provider = new ThreadsProviderClass();
    const res = await provider.publishPost("token", "hello", "12345");

    assert.equal(res.success, false);
    assert.match(res.error ?? "", /HTTP 400/);
    assert.match(res.error ?? "", /code=190/);
    assert.match(res.error ?? "", /Invalid OAuth 2.0 Access Token/);
    assert.equal(statusFetches, 0);
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