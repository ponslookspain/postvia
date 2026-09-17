/**
 * Envelope encryption for stored social tokens (audit H1).
 *
 * Two things are under test and the second matters more than the first:
 *   1. the crypto itself round-trips and fails loudly when it should;
 *   2. enabling it does NOT change the rotation compare-and-swap that makes
 *      concurrent token refresh safe. That CAS compares a stored value to a
 *      stored value; because AES-GCM is randomized, re-encrypting a token
 *      would produce a different string every time and the CAS would never
 *      match. The suite below pins that ciphertext stays opaque through it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptAccountTokens,
  decryptToken,
  encryptNullableToken,
  encryptRotatedTokens,
  encryptToken,
  isEncryptedToken,
  keyIdFor,
  resolveTokenCrypto,
  SocialTokenCryptoError,
  TOKEN_CIPHER_PREFIX,
} from "../src/lib/social-token-crypto";
import { encryptAccountTokens } from "../src/lib/social-accounts";
import { ensureFreshXToken } from "../src/lib/social/x";

const SECRET = "test-social-token-key-at-least-32-characters-long";
const OTHER = "another-social-token-key-also-32-characters-long!!";
const KEY = { secret: SECRET, keyId: keyIdFor(SECRET) };
const OTHER_KEY = { secret: OTHER, keyId: keyIdFor(OTHER) };

const TOKEN = "xoxb-super-secret-access-token-value";

describe("resolveTokenCrypto", () => {
  test("absent key means encryption is off (deploy-before-configure)", () => {
    assert.equal(resolveTokenCrypto({}), null);
    assert.equal(resolveTokenCrypto({ SOCIAL_TOKEN_KEY: "" }), null);
    assert.equal(resolveTokenCrypto({ SOCIAL_TOKEN_KEY: "   " }), null);
  });

  test("a too-short key is rejected rather than silently weakening", () => {
    assert.throws(
      () => resolveTokenCrypto({ SOCIAL_TOKEN_KEY: "short" }),
      SocialTokenCryptoError
    );
  });

  test("a usable key yields a stable, non-secret key id", () => {
    const config = resolveTokenCrypto({ SOCIAL_TOKEN_KEY: SECRET });
    assert.equal(config?.keyId, keyIdFor(SECRET));
    assert.notEqual(keyIdFor(SECRET), keyIdFor(OTHER));
    assert.ok(!keyIdFor(SECRET).includes(SECRET));
  });
});

describe("encrypt / decrypt round trip", () => {
  test("a token survives the round trip exactly", () => {
    const sealed = encryptToken(TOKEN, KEY);
    assert.notEqual(sealed, TOKEN);
    assert.ok(!sealed.includes(TOKEN), "plaintext must not appear in the value");
    assert.equal(decryptToken(sealed, KEY), TOKEN);
  });

  test("the stored value is self-describing (no schema column needed)", () => {
    const sealed = encryptToken(TOKEN, KEY);
    assert.ok(sealed.startsWith(`${TOKEN_CIPHER_PREFIX}.v1.${KEY.keyId}.`));
    assert.equal(sealed.split(".").length, 6);
    assert.ok(isEncryptedToken(sealed));
  });

  test("encryption is randomized: the same token seals differently each time", () => {
    const a = encryptToken(TOKEN, KEY);
    const b = encryptToken(TOKEN, KEY);
    assert.notEqual(a, b, "a fresh IV per call");
    assert.equal(decryptToken(a, KEY), decryptToken(b, KEY));
  });

  test("unicode and long tokens survive", () => {
    for (const value of ["ключ-доступа", "a".repeat(4096), "tok.with.dots"]) {
      assert.equal(decryptToken(encryptToken(value, KEY), KEY), value);
    }
  });

  test("encryption is idempotent (never double-wraps)", () => {
    const once = encryptToken(TOKEN, KEY);
    const twice = encryptToken(once, KEY);
    assert.equal(twice, once);
    assert.equal(decryptToken(twice, KEY), TOKEN);
  });
});

describe("rollout safety: plaintext and ciphertext coexist", () => {
  test("with no key configured, encryption is a literal no-op", () => {
    assert.equal(encryptToken(TOKEN, null), TOKEN);
    assert.equal(encryptNullableToken(TOKEN, null), TOKEN);
  });

  test("legacy plaintext reads back unchanged", () => {
    assert.equal(decryptToken(TOKEN, KEY), TOKEN);
    assert.equal(decryptToken(TOKEN, null), TOKEN);
    assert.ok(!isEncryptedToken(TOKEN));
  });

  test("a missed write site degrades to 'not encrypted yet', never to broken", () => {
    // Simulates a row written before the key was set, read after.
    const row = { accessToken: TOKEN, refreshToken: "legacy-refresh" };
    const read = decryptAccountTokens(row, KEY);
    assert.equal(read.accessToken, TOKEN);
    assert.equal(read.refreshToken, "legacy-refresh");
  });

  test("a mixed row (one field sealed, one legacy) reads correctly", () => {
    const row = {
      accessToken: encryptToken(TOKEN, KEY),
      refreshToken: "legacy-refresh",
    };
    const read = decryptAccountTokens(row, KEY);
    assert.equal(read.accessToken, TOKEN);
    assert.equal(read.refreshToken, "legacy-refresh");
  });

  test("null refresh tokens stay null in both directions", () => {
    assert.equal(encryptNullableToken(null, KEY), null);
    assert.equal(encryptNullableToken(undefined, KEY), null);
    const read = decryptAccountTokens(
      { accessToken: encryptToken(TOKEN, KEY), refreshToken: null },
      KEY
    );
    assert.equal(read.refreshToken, null);
  });
});

describe("failures are loud, never silent", () => {
  test("a ciphertext from a different key is refused", () => {
    const sealed = encryptToken(TOKEN, OTHER_KEY);
    assert.throws(() => decryptToken(sealed, KEY), SocialTokenCryptoError);
  });

  test("encrypted data with no key configured is refused", () => {
    // Returning the ciphertext would send a garbage bearer token upstream.
    const sealed = encryptToken(TOKEN, KEY);
    assert.throws(() => decryptToken(sealed, null), SocialTokenCryptoError);
  });

  test("tampering with the ciphertext is detected (GCM auth tag)", () => {
    const sealed = encryptToken(TOKEN, KEY);
    const parts = sealed.split(".");
    // Flip a byte in the ciphertext segment.
    const ct = Buffer.from(parts[5], "base64url");
    ct[0] ^= 0xff;
    parts[5] = ct.toString("base64url");
    assert.throws(() => decryptToken(parts.join("."), KEY), SocialTokenCryptoError);
  });

  test("tampering with the auth tag is detected", () => {
    const parts = encryptToken(TOKEN, KEY).split(".");
    const tag = Buffer.from(parts[4], "base64url");
    tag[0] ^= 0xff;
    parts[4] = tag.toString("base64url");
    assert.throws(() => decryptToken(parts.join("."), KEY), SocialTokenCryptoError);
  });

  test("structurally malformed values are refused", () => {
    for (const bad of [
      `${TOKEN_CIPHER_PREFIX}.v1.${KEY.keyId}.short`,
      `${TOKEN_CIPHER_PREFIX}.v1.${KEY.keyId}...`,
      `${TOKEN_CIPHER_PREFIX}.v1.${KEY.keyId}.AAAA.BBBB.CCCC`,
    ]) {
      assert.throws(() => decryptToken(bad, KEY), SocialTokenCryptoError);
    }
  });
});

describe("the rotation compare-and-swap is unaffected", () => {
  /**
   * The load-bearing test. `ensureFreshXToken` persists a rotated pair with
   * `updateMany({ where: { id, accessToken: <value as read> } })`. If any
   * layer re-encrypted that comparand, the CAS would never match and every
   * refresh would silently fall into the "lost the race" branch.
   */
  function encryptedStore(storedPlaintextAccess: string) {
    const row = {
      accessToken: encryptToken(storedPlaintextAccess, KEY),
      refreshToken: encryptToken("stored-refresh", KEY),
      expiresAt: new Date(Date.now() - 1000),
    };
    const casComparands: string[] = [];
    return {
      row,
      casComparands,
      store: {
        findUnique: async () => ({ ...row }),
        updateMany: async (args: {
          where: { id: string; accessToken: string };
          data: { accessToken: string; refreshToken?: string; expiresAt?: Date };
        }) => {
          casComparands.push(args.where.accessToken);
          // Exactly the semantics Postgres gives: match on the stored value.
          if (args.where.accessToken !== row.accessToken) return { count: 0 };
          row.accessToken = args.data.accessToken;
          if (args.data.refreshToken) row.refreshToken = args.data.refreshToken;
          return { count: 1 };
        },
        update: async () => undefined,
      },
    };
  }

  test("the CAS comparand is the stored ciphertext, never a re-encryption", async (t) => {
    const fixture = encryptedStore("old-access-token");
    const before = fixture.row.accessToken;

    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
      delete process.env.SOCIAL_TOKEN_KEY;
      delete process.env.X_CLIENT_ID;
      delete process.env.X_CLIENT_SECRET;
    });
    process.env.SOCIAL_TOKEN_KEY = SECRET;
    process.env.X_CLIENT_ID = "cid";
    process.env.X_CLIENT_SECRET = "csecret";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          access_token: "rotated-access",
          refresh_token: "rotated-refresh",
          expires_in: 7200,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof globalThis.fetch;

    const result = await ensureFreshXToken(
      {
        id: "acc-1",
        accessToken: before,
        refreshToken: fixture.row.refreshToken,
        expiresAt: new Date(Date.now() - 1000),
      },
      fixture.store
    );

    assert.deepEqual(
      fixture.casComparands,
      [before],
      "the CAS used the value as stored — not a fresh encryption of it"
    );
    assert.equal(result, "rotated-access", "the CALLER gets plaintext");
    assert.ok(
      isEncryptedToken(fixture.row.accessToken),
      "the DATABASE got ciphertext"
    );
    assert.equal(decryptToken(fixture.row.accessToken, KEY), "rotated-access");
  });

  test("encryptRotatedTokens seals the stored pair but leaves the return value alone", () => {
    const next = {
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: new Date(),
    };
    const persisted = encryptRotatedTokens(next, KEY);

    assert.equal(next.accessToken, "fresh-access", "input is not mutated");
    assert.ok(isEncryptedToken(persisted.accessToken));
    assert.ok(isEncryptedToken(persisted.refreshToken));
    assert.equal(persisted.expiresAt, next.expiresAt, "non-token fields pass through");
    assert.equal(decryptToken(persisted.accessToken, KEY), "fresh-access");
  });

  test("encryptRotatedTokens omits an absent refresh token", () => {
    const persisted = encryptRotatedTokens({ accessToken: "a" }, KEY);
    assert.ok(!("refreshToken" in persisted));
  });
});

describe("encryptAccountTokens (the single write boundary)", () => {
  test("seals both credential fields and passes everything else through", (t) => {
    t.after(() => delete process.env.SOCIAL_TOKEN_KEY);
    process.env.SOCIAL_TOKEN_KEY = SECRET;

    const sealed = encryptAccountTokens({
      externalId: "ext-1",
      username: "alice",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: new Date(0),
    });

    assert.ok(isEncryptedToken(sealed.accessToken));
    assert.ok(isEncryptedToken(sealed.refreshToken!));
    assert.equal(sealed.username, "alice", "non-credential fields untouched");
    assert.equal(sealed.externalId, "ext-1");
  });

  test("is a no-op when no key is configured", (t) => {
    t.after(() => delete process.env.SOCIAL_TOKEN_KEY);
    delete process.env.SOCIAL_TOKEN_KEY;

    const passthrough = encryptAccountTokens({
      externalId: "ext-1",
      username: "alice",
      accessToken: "at",
      refreshToken: "rt",
    });
    assert.equal(passthrough.accessToken, "at");
    assert.equal(passthrough.refreshToken, "rt");
  });

  test("handles a payload without a refresh token (Instagram)", (t) => {
    t.after(() => delete process.env.SOCIAL_TOKEN_KEY);
    process.env.SOCIAL_TOKEN_KEY = SECRET;

    const sealed = encryptAccountTokens({
      externalId: "ext-1",
      username: "alice",
      accessToken: "at",
      refreshToken: null,
    });
    assert.ok(isEncryptedToken(sealed.accessToken));
    assert.equal(sealed.refreshToken, null);
  });
});
