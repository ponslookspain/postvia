/**
 * Session cookie cache configuration (P1.7).
 *
 * The cache trades a bounded staleness window for removing a DB read from
 * every authenticated request. These tests pin the bound and the properties
 * that make it acceptable — a future bump toward the library's 5-minute
 * default, or an accidental `refreshCache: true`, should fail here rather
 * than silently widen the revocation window in production.
 *
 * Behaviours verified against better-auth 1.7.4 and asserted structurally
 * (the library's own routes are not re-tested here):
 * - sign-out expires the session-data cookie alongside the token cookie,
 * - a token mismatch discards the cache,
 * - `refreshCache` defaults to false, so the cache cannot self-extend.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auth, SESSION_COOKIE_CACHE_MAX_AGE_SECONDS } from "../src/lib/auth";

type SessionOptions = {
  cookieCache?: {
    enabled?: boolean;
    maxAge?: number;
    refreshCache?: unknown;
  };
};

function sessionOptions(): SessionOptions {
  return (auth.options as { session?: SessionOptions }).session ?? {};
}

describe("session cookie cache is enabled and bounded", () => {
  test("the cache is on", () => {
    assert.equal(sessionOptions().cookieCache?.enabled, true);
  });

  test("the staleness window is at most one minute", () => {
    const maxAge = sessionOptions().cookieCache?.maxAge;
    assert.equal(maxAge, SESSION_COOKIE_CACHE_MAX_AGE_SECONDS);
    assert.ok(
      typeof maxAge === "number" && maxAge > 0 && maxAge <= 60,
      `a revoked session stays usable for maxAge seconds; ${maxAge}s is ` +
        `wider than this change intends`
    );
  });

  test("the cache can never extend itself past maxAge", () => {
    // `refreshCache: true` would let the cookie renew WITHOUT a database
    // read, turning a bounded window into an unbounded one.
    assert.ok(
      !sessionOptions().cookieCache?.refreshCache,
      "refreshCache must stay disabled — it is what bounds the window"
    );
  });
});

describe("the properties that make the window acceptable", () => {
  test("sign-out expires the cache cookie, so logout is immediate", () => {
    const source = readFileSync(
      new URL("../node_modules/better-auth/dist/cookies/index.mjs", import.meta.url),
      "utf8"
    );
    const body = source.slice(source.indexOf("function deleteSessionCookie"));
    const fn = body.slice(0, body.indexOf("\n}"));
    assert.match(
      fn,
      /expireCookie\(ctx, ctx\.context\.authCookies\.sessionData\)/,
      "sign-out must clear the cached session, not just the token"
    );
    assert.match(
      fn,
      /expireCookie\(ctx, ctx\.context\.authCookies\.sessionToken\)/
    );
  });

  test("a rotated session token discards the cache", () => {
    const source = readFileSync(
      new URL("../node_modules/better-auth/dist/api/routes/session.mjs", import.meta.url),
      "utf8"
    );
    assert.match(
      source,
      /shouldExpireCookieCache\s*=\s*session\.session\.token\s*!==\s*sessionCookieToken/,
      "a cached session whose token no longer matches must not be trusted"
    );
  });
});

describe("the cache never becomes an authorization source", () => {
  test("entitlements are read from the database, never from the session", () => {
    // The cache holds the session user (id/email/name). If a plan check ever
    // read a plan off that object, a stale cookie would become a billing
    // bypass. getEffectivePlan must keep going to the Subscription row.
    const source = readFileSync(
      new URL("../src/lib/entitlements.ts", import.meta.url),
      "utf8"
    );
    assert.match(
      source,
      /prisma\.subscription\.findUnique/,
      "plan resolution must hit the database"
    );
    assert.ok(
      !/session\s*\.\s*(plan|entitlements)/.test(source),
      "no entitlement may be derived from session state"
    );
  });

  test("the admin gate resolves its allowlist from the environment per call", () => {
    const source = readFileSync(
      new URL("../src/lib/entitlements.ts", import.meta.url),
      "utf8"
    );
    const fn = source.slice(source.indexOf("export function isAdminEmail"));
    assert.match(
      fn.slice(0, fn.indexOf("\n}")),
      /process\.env\.ADMIN_EMAILS/,
      "admin status must not be cacheable alongside the session"
    );
  });
});
