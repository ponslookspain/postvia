/**
 * Envelope encryption for stored social OAuth tokens (audit H1).
 *
 * `SocialAccount.accessToken` / `refreshToken` are live publishing
 * credentials and were stored in plaintext. Anything that can read a row — a
 * backup, a read replica, Prisma Studio, an accidental log of a full row —
 * handed over every user's Instagram/TikTok/X/Threads account.
 *
 * DESIGN CONSTRAINTS that shaped this (all three are load-bearing):
 *
 * 1. **No schema change.** Production carries no `_prisma_migrations`
 *    history (see docs/database.md), so a column migration plus backfill is
 *    the riskiest class of change available. The ciphertext is therefore
 *    self-describing and lives in the existing `String` columns — the key id
 *    travels inside the value, so rotation needs no extra column.
 *
 * 2. **The refresh compare-and-swap must not change.** Every provider's
 *    `ensureFresh*Token` persists a rotated pair with
 *    `updateMany({ where: { id, accessToken: <previously seen value> } })`.
 *    That CAS is what makes concurrent refreshes safe. Ciphertext is treated
 *    as OPAQUE through that path: the value read from the database is the
 *    value compared against it, never a re-encryption. This matters because
 *    AES-GCM uses a random IV, so encrypting the same token twice produces
 *    different bytes — a CAS against a re-encrypted value would never match.
 *    Callers decrypt only at the point of use.
 *
 * 3. **Rollout must be reversible and zero-downtime.** Reads accept both
 *    plaintext and ciphertext, so encrypted and legacy rows coexist
 *    indefinitely. Writes encrypt only when a key is configured, so
 *    deploying this code with no key set is a literal no-op.
 *
 * Better Auth's own `Account` table (Google OAuth login, `accessToken` /
 * `refreshToken`) is encrypted separately, through the library's own
 * built-in `account.encryptOAuthTokens` option in `src/lib/auth.ts` —
 * not this module. That flag reuses `BETTER_AUTH_SECRET` and every
 * adapter write path (initial callback, account linking, refresh-token),
 * so it needed no Prisma-level change here either.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** Marks a value as produced by this module. Legacy plaintext has no prefix. */
export const TOKEN_CIPHER_PREFIX = "pvenc";
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SocialTokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialTokenCryptoError";
  }
}

/**
 * Derives the 32-byte AES key from the configured secret.
 *
 * The env var holds an arbitrary-length secret rather than raw key bytes, so
 * operators can generate it the same way as every other secret in this
 * project. SHA-256 gives the fixed width AES-256 needs.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Short, non-secret identifier for the key that produced a ciphertext.
 * Stored inside the value so rotation is possible without a schema column:
 * a future key can be added while old values remain decryptable.
 */
export function keyIdFor(secret: string): string {
  return createHash("sha256")
    .update(`social-token-key:${secret}`, "utf8")
    .digest("hex")
    .slice(0, 8);
}

export type TokenCryptoConfig = { secret: string; keyId: string } | null;

/**
 * Resolves the active key, or null when encryption is not configured.
 *
 * Returning null (rather than throwing) is what makes the rollout safe:
 * shipping this code before setting `SOCIAL_TOKEN_KEY` changes nothing, and
 * setting the key later starts encrypting new writes while existing plaintext
 * rows keep working. See `docs/backend-audit-followup.md` for the sequence.
 */
export function resolveTokenCrypto(
  env: Record<string, string | undefined> = process.env
): TokenCryptoConfig {
  const secret = env.SOCIAL_TOKEN_KEY?.trim();
  if (!secret) return null;
  if (secret.length < 32) {
    throw new SocialTokenCryptoError(
      "SOCIAL_TOKEN_KEY must be at least 32 characters"
    );
  }
  return { secret, keyId: keyIdFor(secret) };
}

/** True when the value was produced by this module (so it must be decrypted). */
export function isEncryptedToken(value: string): boolean {
  return value.startsWith(`${TOKEN_CIPHER_PREFIX}.${VERSION}.`);
}

/**
 * Encrypts a token for storage. Returns the input unchanged when no key is
 * configured, so an unconfigured environment behaves exactly as before.
 *
 * Never call this on a value destined for a CAS `where` clause — see the
 * header note. Encrypt on the way IN to storage only.
 */
export function encryptToken(
  plaintext: string,
  config: TokenCryptoConfig = resolveTokenCrypto()
): string {
  if (!config) return plaintext;
  // Idempotent: re-encrypting an already-encrypted value would produce a
  // nested blob that decrypts to ciphertext.
  if (isEncryptedToken(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(config.secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_CIPHER_PREFIX,
    VERSION,
    config.keyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a stored token.
 *
 * Plaintext passes through untouched — that is what lets encrypted and
 * legacy rows coexist during (and after) rollout, and what makes a missed
 * write site degrade to "not encrypted yet" rather than "broken".
 *
 * Throws only when a value IS ours but cannot be decrypted (wrong key,
 * tampering, truncation). That must be loud: silently returning ciphertext
 * would send a garbage bearer token to a provider.
 */
export function decryptToken(
  stored: string,
  config: TokenCryptoConfig = resolveTokenCrypto()
): string {
  if (!isEncryptedToken(stored)) return stored;
  if (!config) {
    throw new SocialTokenCryptoError(
      "Stored token is encrypted but SOCIAL_TOKEN_KEY is not configured"
    );
  }

  const parts = stored.split(".");
  if (parts.length !== 6) {
    throw new SocialTokenCryptoError("Encrypted token is malformed");
  }
  const [, , keyId, ivPart, tagPart, ctPart] = parts;

  // Constant-time key-id check: it is not secret, but comparing it this way
  // keeps the failure path uniform.
  const expected = Buffer.from(config.keyId, "utf8");
  const actual = Buffer.from(keyId, "utf8");
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw new SocialTokenCryptoError(
      "Stored token was encrypted with a different key"
    );
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SocialTokenCryptoError("Encrypted token is malformed");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, deriveKey(config.secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ctPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM authentication failure: the value was altered or the key is wrong.
    throw new SocialTokenCryptoError("Stored token could not be decrypted");
  }
}

/** Nullable convenience for `refreshToken`, which is optional on the row. */
export function encryptNullableToken(
  plaintext: string | null | undefined,
  config: TokenCryptoConfig = resolveTokenCrypto()
): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  return encryptToken(plaintext, config);
}

export function decryptNullableToken(
  stored: string | null | undefined,
  config: TokenCryptoConfig = resolveTokenCrypto()
): string | null {
  if (stored === null || stored === undefined) return null;
  return decryptToken(stored, config);
}

/**
 * Encrypts the rotated pair a provider's `ensureFresh*Token` is about to
 * persist. All four providers share this exact shape.
 *
 * The caller keeps the PLAINTEXT object for its own return value and passes
 * the result of this to the database, so the rotation CAS and the returned
 * token never get confused with each other.
 */
export function encryptRotatedTokens<
  T extends { accessToken: string; refreshToken?: string; expiresAt?: Date },
>(next: T, config: TokenCryptoConfig = resolveTokenCrypto()): T {
  return {
    ...next,
    accessToken: encryptToken(next.accessToken, config),
    ...(next.refreshToken !== undefined
      ? { refreshToken: encryptToken(next.refreshToken, config) }
      : {}),
  };
}

/**
 * Decrypts the token fields of a stored row, leaving every other field
 * untouched. For read sites that hand the whole account to provider code.
 *
 * NOT for the refresh CAS path — that one needs the raw stored value.
 */
export function decryptAccountTokens<
  T extends { accessToken: string; refreshToken?: string | null },
>(account: T, config: TokenCryptoConfig = resolveTokenCrypto()): T {
  return {
    ...account,
    accessToken: decryptToken(account.accessToken, config),
    ...(account.refreshToken !== undefined
      ? { refreshToken: decryptNullableToken(account.refreshToken, config) }
      : {}),
  };
}
