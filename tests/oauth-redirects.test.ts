import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRedirectOrigin } from "../src/lib/oauth-redirect";

/**
 * Regression test for the ngrok OAuth redirect bug: after a successful
 * social connect, the browser landed on `https://localhost:3000/...`
 * instead of the ngrok origin.
 *
 * Root cause (proven live): Next.js builds `request.url` from the
 * server's listen address (`localhost:3000` in dev, protocol still taken
 * from X-Forwarded-Proto) while the real Host arrives in headers — so
 * `NextResponse.redirect(new URL(path, request.url))` pinned the redirect
 * host to localhost. (NextResponse.redirect() rejects relative URLs, so a
 * root-relative Location was not an option either.)
 *
 * Contract enforced here:
 * - callbacks redirect only via oauthRedirect() (validated proxy-header
 *   origin), never via `new URL(path, request.url)`;
 * - `request.url` is read exactly once per callback, for query params
 *   (host-independent);
 * - resolveRedirectOrigin() maps the observed header combinations to the
 *   browser's real origin and never to an unvalidated host;
 * - `https://localhost` is never generated in auth/social code.
 */
const AUTH_DIR = join(import.meta.dirname, "..", "src", "app", "api", "auth");
const SOCIAL_DIR = join(import.meta.dirname, "..", "src", "lib", "social");

const CALLBACKS = [
  "x/callback/route.ts",
  "threads/callback/route.ts",
  "tiktok/callback/route.ts",
  "instagram/callback/route.ts",
];

function readCallback(relative: string): string {
  return readFileSync(join(AUTH_DIR, relative), "utf8");
}

/**
 * Strip `//` line comments so explanatory comments (which legitimately
 * mention `request.url` or the old `https://localhost:3000` symptom) never
 * pollute the code-shape assertions below. Safe here: no string literal
 * under test contains `//` (all redirect targets are root-relative paths
 * or the path parameter).
 */
function stripLineComments(source: string): string {
  return source.replace(/\/\/.*$/gm, "");
}

describe("OAuth callbacks redirect via oauthRedirect()", () => {
  for (const relative of CALLBACKS) {
    test(`${relative}: request.url read only for query params`, () => {
      const source = stripLineComments(readCallback(relative));
      const uses = source.match(/request\.url/g) ?? [];
      assert.equal(
        uses.length,
        1,
        `${relative} must reference request.url exactly once (searchParams destructure)`
      );
      assert.ok(
        source.includes("searchParams"),
        `${relative} must still parse query params from request.url`
      );
    });

    test(`${relative}: no absolute redirect built from request.url`, () => {
      const source = stripLineComments(readCallback(relative));
      // The only allowed `new URL(` is `new URL(request.url)` for params.
      const constructions = source.match(/new URL\(/g) ?? [];
      assert.equal(
        constructions.length,
        1,
        `${relative} must not build redirect URLs from request.url`
      );
    });

    test(`${relative}: redirects go through oauthRedirect()`, () => {
      const source = stripLineComments(readCallback(relative));
      assert.ok(
        source.includes('from "@/lib/oauth-redirect"'),
        `${relative} must import the shared redirect helper`
      );
      assert.ok(
        !source.includes("NextResponse.redirect("),
        `${relative} must not call NextResponse.redirect directly`
      );
    });
  }

  test("no https://localhost URL is generated in auth/social code", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!full.endsWith(".ts") && !full.endsWith(".tsx")) continue;
        const content = stripLineComments(readFileSync(full, "utf8"));
        if (content.includes("https://localhost")) {
          offenders.push(full);
        }
      }
    };
    for (const dir of [AUTH_DIR, SOCIAL_DIR]) walk(dir);
    assert.deepEqual(offenders, []);
  });
});

describe("resolveRedirectOrigin()", () => {
  const NGROK = "lavish-passion-dipped.ngrok-free.dev";
  // The ngrok dev origin is allowlisted via env, exactly like production
  // wires it through BETTER_AUTH_TRUSTED_ORIGINS in .env.local.
  const DEV_ENV = { BETTER_AUTH_TRUSTED_ORIGINS: `https://${NGROK}` };

  test("ngrok behind proxy: forwarded host wins (live-observed case)", () => {
    // Exact headers observed on the dev server when visited via ngrok:
    // Host = ngrok host, yet request.url = https://localhost:3000/...
    assert.equal(
      resolveRedirectOrigin(
        {
          requestUrl:
            "https://localhost:3000/api/auth/threads/callback?code=x",
          hostHeader: NGROK,
          forwardedHost: NGROK,
        },
        DEV_ENV
      ),
      `https://${NGROK}`
    );
  });

  test("direct localhost dev keeps http localhost", () => {
    assert.equal(
      resolveRedirectOrigin({
        requestUrl: "http://localhost:3000/api/auth/x/callback",
        hostHeader: "localhost:3000",
        forwardedHost: null,
      }),
      "http://localhost:3000"
    );
  });

  test("production host resolves to https", () => {
    assert.equal(
      resolveRedirectOrigin({
        requestUrl: "https://postvia.online/api/auth/x/callback",
        hostHeader: "postvia.online",
        forwardedHost: "postvia.online",
      }),
      "https://postvia.online"
    );
  });

  test("vercel preview host resolves to itself", () => {
    assert.equal(
      resolveRedirectOrigin({
        requestUrl: "https://postvia-abc123-postvia.vercel.app/api/auth/x/callback",
        hostHeader: "postvia-abc123-postvia.vercel.app",
        forwardedHost: "postvia-abc123-postvia.vercel.app",
      }),
      "https://postvia-abc123-postvia.vercel.app"
    );
  });

  test("spoofed forwarded host falls back, never redirects off-app", () => {
    const resolved = resolveRedirectOrigin({
      requestUrl: "http://localhost:3000/api/auth/x/callback",
      hostHeader: "localhost:3000",
      forwardedHost: "evil.example.com",
    });
    assert.ok(!resolved.includes("evil"));
    assert.equal(resolved, "http://localhost:3000");
  });

  test("garbage input never throws and never yields localhost https", () => {
    const resolved = resolveRedirectOrigin({
      requestUrl: "not-a-url",
      hostHeader: "http://[invalid",
      forwardedHost: "",
    });
    assert.ok(!resolved.startsWith("https://localhost"));
  });

  test("localhost is never upgraded to https", () => {
    const resolved = resolveRedirectOrigin({
      requestUrl: "https://localhost:3000/api/auth/x/callback",
      hostHeader: "localhost:3000",
      forwardedHost: "localhost:3000",
    });
    assert.equal(resolved, "http://localhost:3000");
  });
});
