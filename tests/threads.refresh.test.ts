import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

let threads: typeof import("../src/lib/social/threads");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Threads race-safe refresh", () => {
  before(async () => {
    threads = await import("../src/lib/social/threads");
  });

  const originalFetch = globalThis.fetch;
  let calls = 0;

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return json(200, {
        access_token: "TH-new",
        token_type: "bearer",
        expires_in: 5184000,
      });
    }) as typeof globalThis.fetch;
  });

  function memoryStore(state: { accessToken: string; expiresAt: Date | null }) {
    const backing = { ...state };
    return {
      backing,
      store: {
        findUnique: async () => ({ ...backing }),
        updateMany: async (args: {
          where: { id: string; accessToken: string };
          data: { accessToken: string; expiresAt?: Date };
        }) => {
          // Conditional write: only the holder of the current token wins.
          if (args.where.accessToken !== backing.accessToken) return { count: 0 };
          backing.accessToken = args.data.accessToken;
          if (args.data.expiresAt) backing.expiresAt = args.data.expiresAt;
          return { count: 1 };
        },
        update: async () => ({}),
      },
    };
  }

  test("fresh token returns without network", async () => {
    const token = await threads.ensureFreshThreadsToken({
      id: "acc",
      accessToken: "TH-live",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    assert.equal(token, "TH-live");
    assert.equal(calls, 0);
  });

  test("expired token refreshes and persists", async () => {
    const mem = memoryStore({
      accessToken: "TH-old",
      expiresAt: new Date(Date.now() - 1000),
    });
    const token = await threads.ensureFreshThreadsToken(
      { id: "acc", accessToken: "TH-old", expiresAt: new Date(Date.now() - 1000) },
      mem.store
    );
    assert.equal(token, "TH-new");
    assert.equal(mem.backing.accessToken, "TH-new");
    assert.equal(calls, 1);
  });

  test("stale snapshot adopts the concurrently refreshed winner without network", async () => {
    const mem = memoryStore({
      accessToken: "TH-winner",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const token = await threads.ensureFreshThreadsToken(
      { id: "acc", accessToken: "TH-stale", expiresAt: new Date(Date.now() - 1000) },
      mem.store
    );
    assert.equal(token, "TH-winner");
    assert.equal(calls, 0);
  });

  test("lost rotation race re-reads the winner instead of overwriting", async () => {
    let refreshes = 0;
    globalThis.fetch = (async () => {
      refreshes++;
      return json(200, {
        access_token: refreshes === 1 ? "TH-first" : "TH-second",
        token_type: "bearer",
        expires_in: 5184000,
      });
    }) as typeof globalThis.fetch;
    const backing = {
      accessToken: "TH-old",
      expiresAt: new Date(Date.now() - 1000) as Date | null,
    };
    const store = {
      findUnique: async () => ({ ...backing }),
      updateMany: async (args: {
        where: { id: string; accessToken: string };
        data: { accessToken: string; expiresAt?: Date };
      }) => {
        if (args.where.accessToken !== backing.accessToken) return { count: 0 };
        backing.accessToken = args.data.accessToken;
        if (args.data.expiresAt) backing.expiresAt = args.data.expiresAt;
        return { count: 1 };
      },
      update: async () => ({}),
    };
    const stale = {
      id: "acc",
      accessToken: "TH-old",
      expiresAt: new Date(Date.now() - 1000),
    };
    const [first, second] = await Promise.all([
      threads.ensureFreshThreadsToken(stale, store),
      threads.ensureFreshThreadsToken(stale, store),
    ]);
    assert.equal(first, "TH-first");
    assert.equal(second, "TH-first");
    assert.equal(backing.accessToken, "TH-first");
  });

  test("revoked token surfaces a reconnect error", async () => {
    globalThis.fetch = (async () =>
      json(400, {
        error: { code: 190, message: "Access token expired" },
      })) as typeof globalThis.fetch;
    const mem = memoryStore({
      accessToken: "TH-dead",
      expiresAt: new Date(Date.now() - 1000),
    });
    await assert.rejects(
      threads.ensureFreshThreadsToken(
        { id: "acc", accessToken: "TH-dead", expiresAt: new Date(Date.now() - 1000) },
        mem.store
      ),
      (error: unknown) => {
        assert.ok(error instanceof threads.ThreadsApiError);
        assert.equal(
          threads.threadsErrorMessage(error),
          "Threads access expired or was revoked. Reconnect your Threads account."
        );
        return true;
      }
    );
  });
});

describe("isThreadsAuthError (resume classification)", () => {
  before(async () => {
    threads = await import("../src/lib/social/threads");
  });

  test("401/403 and code 190 are auth failures", () => {
    assert.equal(
      threads.isThreadsAuthError(new threads.ThreadsApiError("10", "x", 401)),
      true
    );
    assert.equal(
      threads.isThreadsAuthError(new threads.ThreadsApiError("10", "x", 403)),
      true
    );
    assert.equal(
      threads.isThreadsAuthError(new threads.ThreadsApiError("190", "x", 400)),
      true
    );
  });

  test("transient provider errors stay resumable", () => {
    assert.equal(
      threads.isThreadsAuthError(new threads.ThreadsApiError("800", "rate limited", 429)),
      false
    );
    assert.equal(
      threads.isThreadsAuthError(new threads.ThreadsApiError("1", "oops", 500)),
      false
    );
    assert.equal(threads.isThreadsAuthError(new Error("boom")), false);
  });
});
