import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.INSTAGRAM_APP_ID = "ig-client-id";
process.env.INSTAGRAM_APP_SECRET = "ig-client-secret";
delete process.env.INSTAGRAM_REDIRECT_URI;

let insta: typeof import("../src/lib/social/instagram");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Instagram race-safe refresh", () => {
  before(async () => {
    insta = await import("../src/lib/social/instagram");
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
        access_token: "IG-new",
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
          data: { accessToken: string; expiresAt: Date };
        }) => {
          // Conditional write: only the holder of the current token wins.
          if (args.where.accessToken !== backing.accessToken) return { count: 0 };
          backing.accessToken = args.data.accessToken;
          backing.expiresAt = args.data.expiresAt;
          return { count: 1 };
        },
        update: async () => ({}),
      },
    };
  }

  test("fresh token returns without network", async () => {
    const token = await insta.ensureFreshInstagramToken({
      id: "acc",
      accessToken: "IG-live",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    assert.equal(token, "IG-live");
    assert.equal(calls, 0);
  });

  test("expired token refreshes and persists", async () => {
    const mem = memoryStore({
      accessToken: "IG-old",
      expiresAt: new Date(Date.now() - 1000),
    });
    const token = await insta.ensureFreshInstagramToken(
      { id: "acc", accessToken: "IG-old", expiresAt: new Date(Date.now() - 1000) },
      mem.store
    );
    assert.equal(token, "IG-new");
    assert.equal(mem.backing.accessToken, "IG-new");
    assert.equal(calls, 1);
  });

  test("stale snapshot adopts the concurrently refreshed winner without network", async () => {
    const mem = memoryStore({
      accessToken: "IG-winner",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const token = await insta.ensureFreshInstagramToken(
      { id: "acc", accessToken: "IG-stale", expiresAt: new Date(Date.now() - 1000) },
      mem.store
    );
    assert.equal(token, "IG-winner");
    assert.equal(calls, 0);
  });

  test("lost rotation race re-reads the winner instead of overwriting", async () => {
    let refreshes = 0;
    globalThis.fetch = (async () => {
      refreshes++;
      return json(200, {
        access_token: refreshes === 1 ? "IG-first" : "IG-second",
        token_type: "bearer",
        expires_in: 5184000,
      });
    }) as typeof globalThis.fetch;
    const backing = {
      accessToken: "IG-old",
      expiresAt: new Date(Date.now() - 1000) as Date | null,
    };
    const store = {
      findUnique: async () => ({ ...backing }),
      updateMany: async (args: {
        where: { id: string; accessToken: string };
        data: { accessToken: string; expiresAt: Date };
      }) => {
        if (args.where.accessToken !== backing.accessToken) return { count: 0 };
        backing.accessToken = args.data.accessToken;
        backing.expiresAt = args.data.expiresAt;
        return { count: 1 };
      },
      update: async () => ({}),
    };
    const stale = {
      id: "acc",
      accessToken: "IG-old",
      expiresAt: new Date(Date.now() - 1000),
    };
    const [first, second] = await Promise.all([
      insta.ensureFreshInstagramToken(stale, store),
      insta.ensureFreshInstagramToken(stale, store),
    ]);
    // Both workers refreshed against Meta, but only one conditional write
    // wins; the loser must adopt the winner, never resurrect its own token.
    assert.equal(first, "IG-first");
    assert.equal(second, "IG-first");
    assert.equal(backing.accessToken, "IG-first");
  });
});
