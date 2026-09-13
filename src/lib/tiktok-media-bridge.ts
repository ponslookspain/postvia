import { createHmac, timingSafeEqual } from "node:crypto";
import { PRODUCTION_URL, resolveBaseURL } from "@/lib/base-url";

/**
 * First-party delivery bridge for TikTok PHOTO PULL_FROM_URL.
 *
 * Why this exists: `createSignedGetUrl()` returns a presigned URL on
 * `https://{storeId}.private.blob.vercel-storage.com/...` — a hostname
 * Postvia can never prove ownership of, so TikTok's URL-ownership
 * verification (domain or URL-prefix, DNS/TikTok-portal verified,
 * https, no redirects, accessible for 1h after the download starts)
 * can never cover it. Production photo posts would always fail with
 * `url_ownership_unverified`.
 *
 * These URLs instead live under Postvia's own verified host/path:
 *   https://postvia.online/api/tiktok/media/{mediaId}?expires=...&sig=...
 * so the TikTok portal's URL-prefix verification
 * (`https://postvia.online/api/tiktok/media/`) actually applies.
 *
 * Security model (no session, no cookies — pure server-to-server fetch):
 * - each URL is HMAC-SHA256 bound to ONE media id + expiry with a
 *   server-only secret (`BETTER_AUTH_SECRET`, never exposed);
 * - media ids are unguessable cuids, so URLs cannot be enumerated;
 * - a token for media A never validates for media B;
 * - the Blob store stays private; the route streams bytes server-side and
 *   never reveals Blob tokens, pathnames, or other users' media;
 * - only TikTok-allowlisted photo mimes (JPEG/WebP) are served here.
 */

export const TIKTOK_BRIDGE_URL_TTL_MS = 90 * 60_000;
export const TIKTOK_BRIDGE_PATH_PREFIX = "/api/tiktok/media/";
/** Small leeway for clock skew between Postvia and TikTok on expiry. */
const BRIDGE_CLOCK_SKEW_MS = 5 * 60_000;

const MEDIA_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidTiktokBridgeMediaId(mediaId: string): boolean {
  return MEDIA_ID_PATTERN.test(mediaId);
}

function getBridgeSecret(): string {
  return process.env.BETTER_AUTH_SECRET?.trim() ?? "";
}

export function signTiktokMediaToken(input: {
  mediaId: string;
  expiresSec: number;
  secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.mediaId}.${input.expiresSec}`)
    .digest("base64url");
}

/**
 * Builds the absolute first-party URL handed to TikTok as a `photo_images`
 * entry. Pure except for env (secret + host); every argument is
 * injectable so the contract is unit-testable.
 */
export function createTiktokMediaUrl(input: {
  mediaId: string;
  ttlMs?: number;
  nowMs?: number;
  baseUrl?: string;
  secret?: string;
}): string {
  if (!isValidTiktokBridgeMediaId(input.mediaId)) {
    throw new Error("Invalid media id for TikTok delivery URL");
  }
  const secret = input.secret ?? getBridgeSecret();
  if (!secret) {
    throw new Error(
      "TikTok photo delivery is not configured (missing signing secret)."
    );
  }
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlMs ?? TIKTOK_BRIDGE_URL_TTL_MS;
  // 90 min validity comfortably exceeds TikTok's 1-hour PULL_FROM_URL
  // download timeout (the download starts seconds after init).
  const expiresSec = Math.floor((now + ttl) / 1000);
  const sig = signTiktokMediaToken({ mediaId: input.mediaId, expiresSec, secret });
  const base = (input.baseUrl ?? resolveBaseURL() ?? PRODUCTION_URL).replace(/\/+$/, "");
  return `${base}${TIKTOK_BRIDGE_PATH_PREFIX}${input.mediaId}?expires=${expiresSec}&sig=${sig}`;
}

export type BridgeTokenVerification =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "unconfigured" };

export function verifyTiktokMediaToken(input: {
  mediaId: string;
  expires: string | number | null | undefined;
  sig: string | null | undefined;
  secret?: string;
  nowMs?: number;
}): BridgeTokenVerification {
  const secret = input.secret ?? getBridgeSecret();
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (!isValidTiktokBridgeMediaId(input.mediaId)) return { ok: false, reason: "invalid" };
  const expiresSec = typeof input.expires === "number" ? input.expires : Number(input.expires);
  if (!Number.isInteger(expiresSec) || expiresSec <= 0) {
    return { ok: false, reason: "invalid" };
  }
  const now = input.nowMs ?? Date.now();
  if (expiresSec * 1000 + BRIDGE_CLOCK_SKEW_MS <= now) {
    return { ok: false, reason: "expired" };
  }
  if (typeof input.sig !== "string" || input.sig.length === 0) {
    return { ok: false, reason: "invalid" };
  }
  const expected = signTiktokMediaToken({
    mediaId: input.mediaId,
    expiresSec,
    secret,
  });
  const actual = Buffer.from(input.sig, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (actual.length !== want.length || !timingSafeEqual(actual, want)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

/**
 * Strict parser for the URL contract TikTok receives: https, exact
 * first-party path prefix, single media id (no traversal), and both
 * query params present. Returns null for anything else.
 */
export function parseTiktokBridgeUrl(
  url: string
): { mediaId: string; expires: string; sig: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!parsed.pathname.startsWith(TIKTOK_BRIDGE_PATH_PREFIX)) return null;
  const mediaId = parsed.pathname.slice(TIKTOK_BRIDGE_PATH_PREFIX.length);
  if (!isValidTiktokBridgeMediaId(mediaId) || mediaId.includes("/")) return null;
  const expires = parsed.searchParams.get("expires");
  const sig = parsed.searchParams.get("sig");
  if (!expires || !sig) return null;
  return { mediaId, expires, sig };
}

/* ------------------------- serving (route logic) ------------------------- */

export type BridgeMediaRow = {
  mimeType: string;
  pathname: string;
  size: number;
};

export type BridgeBlobBytes = {
  stream: unknown;
  contentLength: string | null;
};

export type BridgeServeDeps = {
  findMedia: (mediaId: string) => Promise<BridgeMediaRow | null>;
  fetchBlob: (pathname: string) => Promise<BridgeBlobBytes | null>;
};

export type BridgeServeResult =
  | { status: 200; headers: Record<string, string>; body: unknown }
  | { status: 404 };

/**
 * Authorizes (HMAC, no session) and resolves one bridge request to either
 * directly-streamed bytes (never a redirect) or a generic 404. Every
 * failure mode collapses to 404 so the endpoint is not an oracle for
 * media ids, expiries, or signatures.
 */
export async function serveTiktokBridgeMedia(
  request: {
    mediaId: string;
    expires: string | null;
    sig: string | null;
    method: string;
  },
  env: { secret?: string; nowMs?: number } = {},
  deps: BridgeServeDeps
): Promise<BridgeServeResult> {
  const verified = verifyTiktokMediaToken({
    mediaId: request.mediaId,
    expires: request.expires,
    sig: request.sig,
    secret: env.secret,
    nowMs: env.nowMs,
  });
  if (!verified.ok) return { status: 404 };
  const row = await deps.findMedia(request.mediaId);
  if (!row) return { status: 404 };
  // Defense-in-depth: the bridge only ever serves TikTok-allowlisted
  // photo mimes. Publish policy already blocks PNG/GIF before URLs are
  // minted; this keeps a forged-but-valid token from exfiltrating any
  // other stored object type.
  if (row.mimeType !== "image/jpeg" && row.mimeType !== "image/webp") {
    return { status: 404 };
  }
  const blob = await deps.fetchBlob(row.pathname);
  if (!blob || blob.stream == null) return { status: 404 };
  const headers: Record<string, string> = {
    "Content-Type": row.mimeType,
    // Token-gated URL: keep shared caches out, allow brief private reuse
    // while TikTok retries its own fetch.
    "Cache-Control": "private, max-age=60",
    ETag: `"${request.mediaId}"`,
  };
  if (blob.contentLength) headers["Content-Length"] = blob.contentLength;
  if (request.method === "HEAD") return { status: 200, headers, body: null };
  return { status: 200, headers, body: blob.stream };
}
