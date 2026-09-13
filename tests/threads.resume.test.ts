import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.THREADS_POLL_DELAY_MS = "5";
process.env.THREADS_POLL_MAX_ATTEMPTS = "3";
process.env.THREADS_POLL_TIMEOUT_MS = "100";
process.env.THREADS_VIDEO_POLL_DELAY_MS = "5";
process.env.THREADS_VIDEO_POLL_MAX_ATTEMPTS = "3";
process.env.THREADS_VIDEO_POLL_TIMEOUT_MS = "100";

let threads: typeof import("../src/lib/social/threads");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Threads resume-safe container flow", () => {
  before(async () => {
    threads = await import("../src/lib/social/threads");
  });

  const originalFetch = globalThis.fetch;
  let statusQueue: Array<{ status: string; error_message?: string } | { http: number }> = [];
  let createHandler: () => Response;
  let publishHandler: () => Response;
  let createCalls = 0;
  let publishCalls = 0;
  let statusCalls = 0;

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
      statusCalls++;
      const next = statusQueue.shift() ?? { status: "IN_PROGRESS" };
      if ("http" in next) {
        return json(next.http, { error: { message: "blip", code: 1 } });
      }
      return json(200, { id: "C-1", ...next });
    }
    if (url.includes("threads_publish")) {
      publishCalls++;
      return publishHandler();
    }
    createCalls++;
    return createHandler();
  }

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    createCalls = 0;
    publishCalls = 0;
    statusCalls = 0;
    statusQueue = [];
    createHandler = () => json(200, { id: "C-1" });
    publishHandler = () => json(200, { id: "P-9" });
    globalThis.fetch = mockFetch;
  });

  test("create persists the container id before publishing", async () => {
    statusQueue = [{ status: "FINISHED" }];
    const saved: string[] = [];
    const outcome = await threads.publishThreadsMedia(
      "tok",
      { threadsUserId: "U-1", text: "hello" },
      { onContainerId: async (id) => { saved.push(id); } }
    );
    assert.deepEqual(outcome, { state: "published", externalPostId: "P-9" });
    assert.deepEqual(saved, ["C-1"]);
    assert.equal(createCalls, 1);
    assert.equal(publishCalls, 1);
  });

  test("resume with an existing container never creates a second one", async () => {
    statusQueue = [{ status: "IN_PROGRESS" }, { status: "FINISHED" }];
    const saved: string[] = [];
    const outcome = await threads.publishThreadsMedia(
      "tok",
      { threadsUserId: "U-1", text: "hello", existingContainerId: "C-old" },
      { onContainerId: async (id) => { saved.push(id); } }
    );
    assert.deepEqual(outcome, { state: "published", externalPostId: "P-9" });
    assert.equal(createCalls, 0);
    assert.deepEqual(saved, []);
    assert.equal(publishCalls, 1);
  });

  test("EXPIRED container fails without publishing", async () => {
    statusQueue = [{ status: "EXPIRED" }];
    const outcome = await threads.publishThreadsMedia(
      "tok",
      { threadsUserId: "U-1", text: "hello", existingContainerId: "C-old" },
      { onContainerId: async () => {} }
    );
    assert.equal(outcome.state, "failed");
    assert.match(
      outcome.state === "failed" ? outcome.error : "",
      /expired/
    );
    assert.equal(createCalls, 0);
    assert.equal(publishCalls, 0);
  });

  test("timeout reports processing and keeps the container id", async () => {
    const outcome = await threads.publishThreadsMedia(
      "tok",
      { threadsUserId: "U-1", text: "hello", existingContainerId: "C-old" },
      { onContainerId: async () => {} }
    );
    assert.equal(outcome.state, "processing");
    assert.equal(
      outcome.state === "processing" ? outcome.containerId : "",
      "C-old"
    );
    assert.match(
      outcome.state === "processing" ? outcome.detail : "",
      /not ready/
    );
    assert.equal(createCalls, 0);
    assert.equal(publishCalls, 0);
  });

  test("transient poll failures keep polling instead of failing", async () => {
    statusQueue = [{ http: 500 }, { status: "FINISHED" }];
    const outcome = await threads.publishThreadsMedia(
      "tok",
      { threadsUserId: "U-1", text: "hello", existingContainerId: "C-old" },
      { onContainerId: async () => {} }
    );
    assert.deepEqual(outcome, { state: "published", externalPostId: "P-9" });
    assert.equal(createCalls, 0);
    assert.equal(publishCalls, 1);
  });

  test("code 190 maps to reconnect", async () => {
    createHandler = () =>
      json(400, {
        error: { message: "Invalid OAuth 2.0 Access Token", code: 190 },
      });
    const outcome = await threads.publishThreadsMedia(
      "tok",
      { threadsUserId: "U-1", text: "hello" },
      { onContainerId: async () => {} }
    );
    assert.equal(outcome.state, "failed");
    assert.equal(
      outcome.state === "failed" ? outcome.error : "",
      "Threads access expired or was revoked. Reconnect your Threads account."
    );
  });

  test("revoke is an honest no-op: no endpoint, returns false", async () => {
    // No network call may happen: the Threads API exposes no revocation
    // endpoint, so disconnect stays local-only by design.
    assert.equal(await new threads.ThreadsProvider().revokeToken("tok"), false);
    assert.equal(createCalls + publishCalls + statusCalls, 0);
  });
});
