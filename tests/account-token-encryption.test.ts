/**
 * Better Auth `Account` token encryption at rest.
 *
 * `Account.accessToken` / `refreshToken` (Google OAuth login) were plaintext
 * — the last open item from the OAuth-token-encryption audit finding, after
 * `SocialAccount` was covered by `src/lib/social-token-crypto.ts`. Better
 * Auth 1.7.4 ships a built-in `account.encryptOAuthTokens` flag
 * (`oauth2/utils.ts`: `setTokenUtil` / `decryptOAuthToken`, keyed off
 * `BETTER_AUTH_SECRET`) that every token write path (initial callback,
 * account linking, `/refresh-token`) already runs through — no schema
 * change, no backfill, no library patch.
 *
 * These tests pin the flag on and, structurally, that the installed
 * library still gates encryption on it — so a dependency bump that renamed
 * or removed the option fails here instead of silently reverting to
 * plaintext.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auth } from "../src/lib/auth";

type AccountOptions = {
  encryptOAuthTokens?: unknown;
  accountLinking?: { trustedProviders?: string[] };
};

function accountOptions(): AccountOptions {
  return (auth.options as { account?: AccountOptions }).account ?? {};
}

describe("Better Auth Account OAuth tokens are encrypted at rest", () => {
  test("encryptOAuthTokens is on", () => {
    assert.equal(accountOptions().encryptOAuthTokens, true);
  });

  test("account linking config is untouched by the encryption flag", () => {
    // Regression guard: the flag lives in the same `account` object as
    // `accountLinking` — make sure adding it did not clobber the sibling key.
    assert.ok(Array.isArray(accountOptions().accountLinking?.trustedProviders));
  });
});

describe("the installed library still gates on this flag", () => {
  test("setTokenUtil only encrypts when account.encryptOAuthTokens is set", () => {
    const source = readFileSync(
      new URL("../node_modules/better-auth/dist/oauth2/utils.mjs", import.meta.url),
      "utf8"
    );
    const fn = source.slice(source.indexOf("function setTokenUtil"));
    assert.match(
      fn.slice(0, fn.indexOf("\n}")),
      /ctx\.options\.account\?\.encryptOAuthTokens/,
      "a library upgrade changed the gating condition for encrypting on write"
    );
  });

  test("decryptOAuthToken only decrypts when account.encryptOAuthTokens is set", () => {
    const source = readFileSync(
      new URL("../node_modules/better-auth/dist/oauth2/utils.mjs", import.meta.url),
      "utf8"
    );
    const fn = source.slice(source.indexOf("function decryptOAuthToken"));
    assert.match(
      fn.slice(0, fn.indexOf("\n}")),
      /ctx\.options\.account\?\.encryptOAuthTokens/,
      "a library upgrade changed the gating condition for decrypting on read"
    );
  });

  test("legacy plaintext rows still decrypt (no backfill needed)", () => {
    // `isLikelyEncrypted` is what lets old plaintext rows and new
    // ciphertext coexist: a value that doesn't look encrypted passes
    // through unchanged instead of failing to decrypt.
    const source = readFileSync(
      new URL("../node_modules/better-auth/dist/oauth2/utils.mjs", import.meta.url),
      "utf8"
    );
    assert.match(source, /function isLikelyEncrypted/);
    const fn = source.slice(source.indexOf("function decryptOAuthToken"));
    assert.match(
      fn.slice(0, fn.indexOf("\n}")),
      /isLikelyEncrypted\(token\)/,
      "decryption must skip values that are not actually encrypted"
    );
  });
});
