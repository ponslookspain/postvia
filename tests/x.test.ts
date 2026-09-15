import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.X_CLIENT_ID = "x-client-id";
process.env.X_CLIENT_SECRET = "x-client-secret";
process.env.X_REDIRECT_URI = "https://postvia.online/api/auth/x/callback";

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

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
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const body = typeof init?.body === "string" ? init.body : "";
  calls.push({ url, method, headers, body });
  for (const r of routes) {
    if (r.match(url, method, body)) return r.run(url, method, body);
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
}

function route(
  match: (url: string, method: string, body: string) => boolean,
  run: (url: string, method: string, body: string) => Response
) {
  routes.push({ match, run });
}

function bodyForm(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

let x: typeof import("../src/lib/social/x");

const TOKEN_URL = "https://api.x.com/2/oauth2/token";

function refreshResponse(overrides: Record<string, unknown> = {}) {
  return json(200, {
    access_token: "AT-new",
    refresh_token: "RT-new",
    expires_in: 7200,
    token_type: "bearer",
    ...overrides,
  });
}

describe("X social layer", () => {
  before(async () => {
    x = await import("../src/lib/social/x");
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

  describe("authorize + exchange", () => {
    test("authorize URL carries PKCE challenge, state and exact redirect URI", () => {
      const url = new x.XProvider().getAuthorizeUrl("st-1", "challenge-abc");
      assert.ok(url.startsWith("https://x.com/i/oauth2/authorize"));
      const params = new URL(url).searchParams;
      assert.equal(params.get("response_type"), "code");
      assert.equal(params.get("client_id"), "x-client-id");
      assert.equal(
        params.get("redirect_uri"),
        "https://postvia.online/api/auth/x/callback"
      );
      assert.equal(params.get("state"), "st-1");
      assert.equal(params.get("code_challenge"), "challenge-abc");
      assert.equal(params.get("code_challenge_method"), "S256");
      assert.ok((params.get("scope") ?? "").includes("offline.access"));
      assert.ok(!url.includes("x-client-secret"), "secret never in the URL");
    });

    test("exchange posts code + verifier with Basic auth", async () => {
      route(
        (u, m) => u === TOKEN_URL && m === "POST",
        () =>
          json(200, {
            access_token: "AT-1",
            refresh_token: "RT-1",
            expires_in: 7200,
          })
      );
      const tokens = await new x.XProvider().exchangeCode("code-1", "verifier-1");
      assert.equal(tokens.accessToken, "AT-1");
      assert.equal(tokens.refreshToken, "RT-1");
      assert.ok((tokens.expiresAt?.getTime() ?? 0) > Date.now());
      const form = bodyForm(calls[0].body);
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("code"), "code-1");
      assert.equal(form.get("code_verifier"), "verifier-1");
      assert.equal(
        form.get("redirect_uri"),
        "https://postvia.online/api/auth/x/callback"
      );
      const expectedBasic = `Basic ${Buffer.from("x-client-id:x-client-secret").toString("base64")}`;
      assert.equal(calls[0].headers.Authorization, expectedBasic);
    });
  });

  describe("refresh", () => {
    test("refresh posts refresh_token grant and rotates the pair", async () => {
      route(
        (u, m) => u === TOKEN_URL && m === "POST",
        () => refreshResponse()
      );
      const tokens = await x.refreshXToken("RT-old");
      assert.equal(tokens.accessToken, "AT-new");
      assert.equal(tokens.refreshToken, "RT-new");
      const form = bodyForm(calls[0].body);
      assert.equal(form.get("grant_type"), "refresh_token");
      assert.equal(form.get("refresh_token"), "RT-old");
    });

    test("refresh failure maps 401 to invalid_refresh_token", async () => {
      route(
        (u) => u === TOKEN_URL,
        () => json(401, { error: "invalid_grant", error_description: "revoked" })
      );
      await assert.rejects(x.refreshXToken("RT-dead"), (error: unknown) => {
        assert.ok(error instanceof x.XApiError);
        assert.equal(error.code, "invalid_refresh_token");
        return true;
      });
    });
  });

  describe("ensureFreshXToken", () => {
    function memoryStore(state: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: Date | null;
    }) {
      const backing = { ...state };
      return {
        backing,
        store: {
          findUnique: async () => ({ ...backing }),
          updateMany: async (args: {
            where: { id: string; accessToken: string };
            data: { accessToken: string; refreshToken?: string; expiresAt?: Date };
          }) => {
            // Conditional write: only the holder of the current token wins.
            if (args.where.accessToken !== backing.accessToken) return { count: 0 };
            backing.accessToken = args.data.accessToken;
            if (args.data.refreshToken) backing.refreshToken = args.data.refreshToken;
            if (args.data.expiresAt) backing.expiresAt = args.data.expiresAt;
            return { count: 1 };
          },
          update: async () => ({}),
        },
      };
    }

    test("fresh token returns without network", async () => {
      const token = await x.ensureFreshXToken({
        id: "acc-1",
        accessToken: "AT-fresh",
        refreshToken: "RT-1",
        expiresAt: new Date(Date.now() + 3600_000),
      });
      assert.equal(token, "AT-fresh");
      assert.equal(calls.length, 0);
    });

    test("expired token refreshes and persists rotation", async () => {
      route(
        (u) => u === TOKEN_URL,
        () => refreshResponse()
      );
      const mem = memoryStore({
        accessToken: "AT-old",
        refreshToken: "RT-old",
        expiresAt: new Date(Date.now() - 1000),
      });
      const token = await x.ensureFreshXToken(
        {
          id: "acc-1",
          accessToken: "AT-old",
          refreshToken: "RT-old",
          expiresAt: new Date(Date.now() - 1000),
        },
        mem.store
      );
      assert.equal(token, "AT-new");
      assert.equal(mem.backing.accessToken, "AT-new");
      assert.equal(mem.backing.refreshToken, "RT-new");
    });

    test("concurrent rotation winner is reused without second refresh", async () => {
      const mem = memoryStore({
        accessToken: "AT-winner",
        refreshToken: "RT-winner",
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const token = await x.ensureFreshXToken(
        {
          id: "acc-1",
          accessToken: "AT-stale",
          refreshToken: "RT-stale",
          expiresAt: new Date(Date.now() - 1000),
        },
        mem.store
      );
      assert.equal(token, "AT-winner");
      assert.equal(
        calls.filter((call) => call.url === TOKEN_URL).length,
        0
      );
    });

    test("lost rotation race re-reads the winner instead of overwriting", async () => {
      // Two workers start from the same stale token. The first wins the
      // conditional write; the second must adopt the winner's token even
      // though its own refresh succeeded.
      const backing = {
        accessToken: "AT-old",
        refreshToken: "RT-old",
        expiresAt: new Date(Date.now() - 1000) as Date | null,
      };
      let refreshes = 0;
      route(
        (u) => u === TOKEN_URL,
        () => {
          refreshes++;
          return refreshResponse({
            access_token: refreshes === 1 ? "AT-first" : "AT-second",
            refresh_token: refreshes === 1 ? "RT-first" : "RT-second",
          });
        }
      );
      const store = {
        findUnique: async () => ({ ...backing }),
        updateMany: async (args: {
          where: { id: string; accessToken: string };
          data: { accessToken: string; refreshToken?: string; expiresAt?: Date };
        }) => {
          if (args.where.accessToken !== backing.accessToken) return { count: 0 };
          backing.accessToken = args.data.accessToken;
          if (args.data.refreshToken) backing.refreshToken = args.data.refreshToken;
          if (args.data.expiresAt) backing.expiresAt = args.data.expiresAt;
          return { count: 1 };
        },
        update: async () => ({}),
      };
      const stale = {
        id: "acc-1",
        accessToken: "AT-old",
        refreshToken: "RT-old",
        expiresAt: new Date(Date.now() - 1000),
      };
      const [first, second] = await Promise.all([
        x.ensureFreshXToken(stale, store),
        x.ensureFreshXToken(stale, store),
      ]);
      assert.equal(first, "AT-first");
      // The loser must converge on the winner, never resurrect its own token.
      assert.equal(second, "AT-first");
      assert.equal(backing.accessToken, "AT-first");
    });

    test("missing refresh token fails with reconnect code", async () => {
      const mem = memoryStore({
        accessToken: "AT-old",
        refreshToken: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await assert.rejects(
        x.ensureFreshXToken(
          {
            id: "acc-1",
            accessToken: "AT-old",
            refreshToken: null,
            expiresAt: new Date(Date.now() - 1000),
          },
          mem.store
        ),
        (error: unknown) =>
          error instanceof x.XApiError && error.code === "token_expired"
      );
    });

    test("revoked refresh token preserves the terminal code", async () => {
      route(
        (u) => u === TOKEN_URL,
        () => json(400, { error: "invalid_grant", error_description: "revoked" })
      );
      const mem = memoryStore({
        accessToken: "AT-old",
        refreshToken: "RT-dead",
        expiresAt: new Date(Date.now() - 1000),
      });
      await assert.rejects(
        x.ensureFreshXToken(
          {
            id: "acc-1",
            accessToken: "AT-old",
            refreshToken: "RT-dead",
            expiresAt: new Date(Date.now() - 1000),
          },
          mem.store
        ),
        (error: unknown) =>
          error instanceof x.XApiError && error.code === "invalid_refresh_token"
      );
    });
  });

  describe("error mapping", () => {
    test("401 publish failure maps to reconnect", () => {
      assert.equal(
        x.xErrorMessage(new Error("X API error: 401 Unauthorized")),
        "X access expired or was revoked. Reconnect your X account."
      );
    });

    test("non-auth errors keep the provider message", () => {
      assert.equal(
        x.xErrorMessage(new Error("X API error: 429 rate limited")),
        "X API error: 429 rate limited"
      );
    });

    test("auth error codes map to reconnect", () => {
      assert.equal(
        x.xErrorMessage(new x.XApiError("token_expired", "expired", 401)),
        "X access expired or was revoked. Reconnect your X account."
      );
    });

    test("depleted credits map to top-up guidance, never reconnect", () => {
      assert.equal(
        x.xErrorMessage(new Error("credits depleted")),
        "Your X API credits are depleted. Top up credit in the X developer portal, then retry this post — no need to reconnect your account."
      );
    });

    test("403-shaped credit rejection maps to top-up, not reconnect", () => {
      // Live shape: media upload rejects with 403 while the detail names
      // credits. The auth-shaped status must not win over billing text.
      assert.equal(
        x.xErrorMessage(
          new x.XApiError("unauthorized", "HTTP 403 credits depleted", 403)
        ),
        "Your X API credits are depleted. Top up credit in the X developer portal, then retry this post — no need to reconnect your account."
      );
    });

    test("genuine 401 without billing text still maps to reconnect", () => {
      assert.equal(
        x.xErrorMessage(
          new x.XApiError("unauthorized", "HTTP 401 Unauthorized", 401)
        ),
        "X access expired or was revoked. Reconnect your X account."
      );
    });
  });

  describe("publishPost", () => {
    test("posts text and returns the tweet id", async () => {
      route(
        (u, m) => u.endsWith("/tweets") && m === "POST",
        () => json(200, { data: { id: "tw-1", text: "hi" } })
      );
      const res = await new x.XProvider().publishPost("AT", "hi");
      assert.equal(res.success, true);
      assert.equal(res.externalPostId, "tw-1");
      assert.equal(JSON.parse(calls[0].body).text, "hi");
      assert.equal(calls[0].headers.Authorization, "Bearer AT");
    });

    test("API error returns failure with provider detail", async () => {
      route(
        (u, m) => u.endsWith("/tweets") && m === "POST",
        () => json(403, { detail: "You are not allowed to create a Tweet" })
      );
      const res = await new x.XProvider().publishPost("AT", "hi");
      assert.equal(res.success, false);
      assert.match(res.error ?? "", /not allowed/);
    });
  });

  describe("revoke", () => {
    test("revoke posts token + client_id", async () => {
      route(
        (u, m) => u.includes("oauth2/revoke") && m === "POST",
        () => json(200, {})
      );
      assert.equal(await new x.XProvider().revokeToken("AT"), true);
      const form = bodyForm(calls[0].body);
      assert.equal(form.get("token"), "AT");
      assert.equal(form.get("client_id"), "x-client-id");
    });
  });
});
