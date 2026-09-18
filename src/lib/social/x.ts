import {
  decryptToken,
  encryptRotatedTokens,
} from "@/lib/social-token-crypto";
import { prisma } from "@/lib/prisma";
import type { SocialProvider, PublishResult } from "./provider";
import {
  XApiError,
  isXAuthErrorCode,
  xErrorMessage,
  X_ATTEMPT_MARKER_PREFIX,
  type XMediaCategory,
} from "@/domain/social/policies/x";

/**
 * Pure X policies (error classification, media routing, attempt/retry
 * decisions) live in `@/domain/social/policies/x` and are re-exported here
 * so existing `@/lib/social/x` imports keep working. OAuth, token refresh,
 * Prisma CAS, fetch, chunked upload and orchestration stay in this module.
 * No behavior change.
 */
export * from "@/domain/social/policies/x";
export type * from "@/domain/social/policies/x";

const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const X_API_BASE = "https://api.x.com/2";

const X_SCOPES = ["tweet.read", "users.read", "tweet.write", "offline.access"];

function getClientId(): string {
  const id = process.env.X_CLIENT_ID;
  if (!id) throw new Error("X_CLIENT_ID is not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.X_CLIENT_SECRET;
  if (!secret) throw new Error("X_CLIENT_SECRET is not configured");
  return secret;
}

function getRedirectUri(): string {
  return process.env.X_REDIRECT_URI || "http://localhost:3000/api/auth/x/callback";
}

function getBasicAuthHeader(): string {
  const credentials = `${getClientId()}:${getClientSecret()}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/** Exchange a refresh token for a new token pair (server-side only). */
export async function refreshXToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: getClientId(),
  });

  const res = await globalThis.fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: getBasicAuthHeader(),
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new XApiError(
      res.status === 400 || res.status === 401 ? "invalid_refresh_token" : `http_${res.status}`,
      `X token refresh failed: ${res.status} ${error}`,
      res.status
    );
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new XApiError(
      "token_refresh_failed",
      "X did not return a new access token",
      502
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  };
}

type XTokenStore = {
  findUnique: (args: {
    where: { id: string };
    select: { accessToken: boolean; refreshToken: boolean; expiresAt: boolean };
  }) => Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  } | null>;
  updateMany: (args: {
    where: { id: string; accessToken: string };
    data: { accessToken: string; refreshToken?: string; expiresAt?: Date };
  }) => Promise<{ count: number }>;
  update: (args: {
    where: { id: string };
    data: { accessToken: string; refreshToken?: string; expiresAt?: Date };
  }) => Promise<unknown>;
};

/**
 * Returns a fresh access token for a stored X account, refreshing and
 * persisting rotated tokens when close to expiry. Never logs secrets.
 *
 * Race-safe (same contract as TikTok): the stored row is re-read first so
 * a concurrent worker's rotation is reused, and the rotated pair is
 * persisted with a conditional update keyed on the previously seen access
 * token — the loser of the race re-reads the winner instead of
 * overwriting fresh tokens or reusing a consumed refresh token.
 */
export async function ensureFreshXToken(
  account: {
    id: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  },
  store?: XTokenStore
): Promise<string> {
  const db: XTokenStore = store ?? prisma.socialAccount;
  const now = Date.now();
  // Stored tokens may be encrypted at rest. Ciphertext stays OPAQUE through
  // the rotation compare-and-swap below (the `where` clause compares stored
  // value to stored value, never a re-encryption — AES-GCM is randomized, so
  // a re-encrypted comparand would never match). Decryption happens only
  // where a token is actually used or returned.
  if (account.expiresAt && account.expiresAt.getTime() > now + 5 * 60_000) {
    return decryptToken(account.accessToken);
  }
  const stored = await db.findUnique({
    where: { id: account.id },
    select: { accessToken: true, refreshToken: true, expiresAt: true },
  });
  const current = stored ?? account;
  if (
    current.expiresAt &&
    current.expiresAt.getTime() > Date.now() + 5 * 60_000 &&
    current.accessToken !== account.accessToken
  ) {
    // Another worker refreshed concurrently; reuse its rotated tokens.
    return decryptToken(current.accessToken);
  }
  const refreshToken = current.refreshToken;
  if (!refreshToken) {
    throw new XApiError(
      "token_expired",
      "X access expired. Reconnect your X account.",
      401
    );
  }
  let tokens: { accessToken: string; refreshToken?: string; expiresAt?: Date };
  try {
    tokens = await refreshXToken(decryptToken(refreshToken));
  } catch (error) {
    // Preserve terminal refresh codes so callers can map them to
    // "reconnect" without parsing messages. Never attach tokens.
    if (error instanceof XApiError && isXAuthErrorCode(error.code)) {
      throw error;
    }
    throw error;
  }
  const next: { accessToken: string; refreshToken?: string; expiresAt?: Date } = {
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}),
  };
  // What goes to the database is encrypted; `next` stays plaintext because
  // it is also what this function returns to the caller.
  const persisted = encryptRotatedTokens(next);
  try {
    const claimed = await db.updateMany({
      // Unchanged CAS: `current.accessToken` is the value as read from the
      // row, so it matches byte-for-byte whether or not it is encrypted.
      where: { id: account.id, accessToken: current.accessToken },
      data: persisted,
    });
    if (claimed.count === 0) {
      // Lost the rotation race: re-read the winner's tokens.
      const winner = await db.findUnique({
        where: { id: account.id },
        select: { accessToken: true, refreshToken: true, expiresAt: true },
      });
      if (winner && winner.accessToken !== current.accessToken) {
        return decryptToken(winner.accessToken);
      }
    }
  } catch {
    // Conditional update unsupported (or transient DB error): fall back
    // to a plain update so tokens still rotate, then return them.
    await db.update({ where: { id: account.id }, data: persisted });
  }
  return next.accessToken;
}

/* ------------------------------ media upload ------------------------------ */

/** APPEND segments must stay at or below 5 MB (server max 8 MB). */
const X_APPEND_CHUNK_SIZE = 4 * 1024 * 1024;

export type XUploadOutcome =
  | { state: "ready"; mediaId: string }
  | { state: "failed"; error: string };

export type XMediaUploadDeps = {
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  now?: () => number;
};

/**
 * Where the bytes for a chunked upload come from.
 *
 * Deliberately a reader, not a buffer. X's upload is INIT -> APPEND(n) ->
 * FINALIZE, and INIT needs only `total_bytes` — which the Media row already
 * knows — so the whole file never has to exist in memory at once. The publish
 * path used to do `new Response(stream).arrayBuffer()` first, pinning up to
 * the full 100 MB video limit in a function that (on Hobby) has 60s and finite
 * memory, and then `.slice()`-ing another copy per segment.
 *
 * `readChunk` is given INCLUSIVE bounds, matching HTTP Range semantics so a
 * private-blob ranged read maps to it one-to-one.
 */
export type XMediaSource = {
  totalBytes: number;
  readChunk: (start: number, endInclusive: number) => Promise<ArrayBuffer>;
};

/**
 * Adapter for callers that genuinely already hold the whole file (tests, and
 * any future in-memory producer). Slices lazily, so it behaves exactly like a
 * ranged reader from `uploadXMedia`'s point of view.
 */
export function bufferedXMediaSource(bytes: ArrayBuffer): XMediaSource {
  return {
    totalBytes: bytes.byteLength,
    readChunk: async (start, endInclusive) =>
      bytes.slice(start, endInclusive + 1),
  };
}

const X_DEFAULT_POLL_INTERVAL_MS = 2000;
const X_DEFAULT_POLL_BUDGET_MS = 120_000;

type XProcessingInfo = {
  state: string;
  checkAfterSecs?: number;
  errorCode?: string;
  errorMessage?: string;
};

function xProcessingInfo(data: Record<string, unknown>): XProcessingInfo | null {
  const info = (data as { processing_info?: unknown }).processing_info;
  if (!info || typeof info !== "object") return null;
  const record = info as Record<string, unknown>;
  const error = (record.error ?? {}) as Record<string, unknown>;
  return {
    state: String(record.state ?? ""),
    checkAfterSecs:
      typeof record.check_after_secs === "number" ? record.check_after_secs : undefined,
    errorCode: error.code !== undefined ? String(error.code) : undefined,
    errorMessage: error.message !== undefined ? String(error.message) : undefined,
  };
}

async function readXJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

function xUploadError(res: Response, data: Record<string, unknown> | null, fallback: string): XApiError {
  const errors = data?.errors;
  const firstMessage =
    Array.isArray(errors) && errors.length > 0
      ? (errors[0] as { message?: unknown } | undefined)?.message
      : undefined;
  const detail =
    (typeof data?.detail === "string" ? data.detail : undefined) ??
    (firstMessage !== undefined ? String(firstMessage) : undefined);
  return new XApiError(
    res.status === 401 || res.status === 403 ? "unauthorized" : `http_${res.status}`,
    detail ?? `${fallback} (HTTP ${res.status})`,
    res.status
  );
}

/** INIT: start a chunked upload session, returns the media_id. */
export async function initializeXMediaUpload(
  accessToken: string,
  input: { mediaType: string; totalBytes: number; mediaCategory: XMediaCategory }
): Promise<string> {
  if (!Number.isInteger(input.totalBytes) || input.totalBytes <= 0) {
    throw new XApiError("invalid_media", "X media upload requires a non-empty file.", 400);
  }
  const res = await globalThis.fetch(`${X_API_BASE}/media/upload/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      media_type: input.mediaType,
      total_bytes: input.totalBytes,
      media_category: input.mediaCategory,
    }),
  });
  const data = await readXJson(res);
  if (!res.ok) throw xUploadError(res, data, "X rejected the media upload");
  const mediaId = String((data?.data as Record<string, unknown> | undefined)?.id ?? "");
  if (!mediaId) {
    throw new XApiError("upload_failed", "X did not return a media id for the upload.", 502);
  }
  return mediaId;
}

/** APPEND: upload one segment (index from 0, at most 5 MB each). */
export async function appendXMediaChunk(
  accessToken: string,
  input: { mediaId: string; segmentIndex: number; chunk: ArrayBuffer }
): Promise<void> {
  if (input.chunk.byteLength === 0 || input.chunk.byteLength > 8 * 1024 * 1024) {
    throw new XApiError("invalid_media", "X media segment has an invalid size.", 400);
  }
  const form = new FormData();
  form.append("segment_index", String(input.segmentIndex));
  form.append("media", new Blob([input.chunk]), "chunk");
  const res = await globalThis.fetch(
    `${X_API_BASE}/media/upload/${encodeURIComponent(input.mediaId)}/append`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  // Any 2xx (200/201/204) means the segment was accepted.
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw xUploadError(res, data as Record<string, unknown> | null, "X rejected a media chunk");
  }
}

/** FINALIZE: complete the upload; returns processing info when async processing applies. */
export async function finalizeXMediaUpload(
  accessToken: string,
  mediaId: string
): Promise<XProcessingInfo | null> {
  const res = await globalThis.fetch(
    `${X_API_BASE}/media/upload/${encodeURIComponent(mediaId)}/finalize`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await readXJson(res);
  if (!res.ok) throw xUploadError(res, data, "X could not finalize the media upload");
  const payload = data?.data;
  return xProcessingInfo(
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  );
}

/** STATUS: poll async media processing until it succeeds or fails. */
export async function fetchXMediaProcessingStatus(
  accessToken: string,
  mediaId: string
): Promise<XProcessingInfo | null> {
  const res = await globalThis.fetch(
    `${X_API_BASE}/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await readXJson(res);
  if (!res.ok) throw xUploadError(res, data, "X media status check failed");
  const payload = data?.data;
  return xProcessingInfo(
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  );
}

/**
 * Full chunked upload for one file: INIT → APPEND segments → FINALIZE →
 * STATUS polling while processing applies. Images usually finalize
 * synchronously (no processing_info); videos poll until `succeeded`.
 */
export async function uploadXMedia(
  accessToken: string,
  input: {
    source: XMediaSource;
    mediaType: string;
    mediaCategory: XMediaCategory;
  },
  deps: XMediaUploadDeps = {}
): Promise<XUploadOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? X_DEFAULT_POLL_INTERVAL_MS;
  const pollBudgetMs = deps.pollBudgetMs ?? X_DEFAULT_POLL_BUDGET_MS;
  const now = deps.now ?? (() => Date.now());

  const totalBytes = input.source?.totalBytes;
  if (!Number.isInteger(totalBytes) || !totalBytes || totalBytes <= 0) {
    return { state: "failed", error: "X media upload requires a non-empty file." };
  }

  // INIT needs only the length, which the caller knows without reading a byte.
  let mediaId: string;
  try {
    mediaId = await initializeXMediaUpload(accessToken, {
      mediaType: input.mediaType,
      totalBytes,
      mediaCategory: input.mediaCategory,
    });
  } catch (error) {
    return { state: "failed", error: xErrorMessage(error) };
  }

  // One segment resident at a time: peak memory is the chunk size (4 MB),
  // not the file size.
  try {
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += X_APPEND_CHUNK_SIZE) {
      const endInclusive = Math.min(offset + X_APPEND_CHUNK_SIZE, totalBytes) - 1;
      const chunk = await input.source.readChunk(offset, endInclusive);
      const expected = endInclusive - offset + 1;
      if (chunk.byteLength !== expected) {
        // A short read means the stored object disagrees with the length we
        // told X at INIT; FINALIZE would fail anyway, so stop with a clear
        // cause instead of uploading a corrupt segment sequence.
        throw new XApiError(
          "invalid_media",
          "The stored media could not be read completely for X upload. Retry the post.",
          502
        );
      }
      await appendXMediaChunk(accessToken, { mediaId, segmentIndex, chunk });
      segmentIndex += 1;
    }
  } catch (error) {
    return { state: "failed", error: xErrorMessage(error) };
  }

  let processing: XProcessingInfo | null;
  try {
    processing = await finalizeXMediaUpload(accessToken, mediaId);
  } catch (error) {
    return { state: "failed", error: xErrorMessage(error) };
  }
  if (!processing) return { state: "ready", mediaId };

  const deadline = now() + pollBudgetMs;
  for (;;) {
    if (processing.state === "succeeded") return { state: "ready", mediaId };
    if (processing.state === "failed") {
      const detail = processing.errorMessage ?? processing.errorCode;
      return {
        state: "failed",
        error: `X could not process the media${detail ? `: ${detail}` : ". The file may be corrupt or use an unsupported codec."}`,
      };
    }
    const waitMs = processing.checkAfterSecs !== undefined
      ? Math.max(0, Math.min(processing.checkAfterSecs * 1000, pollIntervalMs * 4))
      : pollIntervalMs;
    if (now() + waitMs > deadline) {
      return {
        state: "failed",
        error: "X is still processing the media. Wait a minute and retry the post.",
      };
    }
    await sleep(waitMs);
    try {
      const next = await fetchXMediaProcessingStatus(accessToken, mediaId);
      if (next) processing = next;
    } catch (error) {
      return { state: "failed", error: xErrorMessage(error) };
    }
  }
}

/* ------------------ idempotency / ambiguous outcomes ------------------ */

export function createXAttemptMarker(): string {
  return `${X_ATTEMPT_MARKER_PREFIX}${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}

export class XProvider implements SocialProvider {
  getAuthorizeUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: getClientId(),
      redirect_uri: getRedirectUri(),
      scope: X_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${X_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: getClientId(),
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier,
    });

    const res = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: getBasicAuthHeader(),
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`X token exchange failed: ${res.status} ${error}`);
    }

    const data = await res.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    };
  }

  async getCurrentUser(
    accessToken: string
  ): Promise<{ externalId: string; username: string }> {
    const res = await fetch(`${X_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to get X user info: ${res.status}`);
    }

    const data = await res.json();
    return {
      externalId: data.data.id,
      username: data.data.username,
    };
  }

  async publishPost(
    accessToken: string,
    text: string
  ): Promise<PublishResult> {
    return this.publishPostWithMedia(accessToken, text);
  }

  /**
   * Create a tweet, optionally attaching previously uploaded media_ids
   * (official `media.media_ids` field on POST /2/tweets). Kept as a
   * separate method so `publishPost` keeps the shared SocialProvider
   * signature untouched.
   */
  async publishPostWithMedia(
    accessToken: string,
    text: string,
    mediaIds?: string[]
  ): Promise<PublishResult> {
    const res = await fetch(`${X_API_BASE}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        ...(mediaIds && mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}),
      }),
    });

    if (!res.ok) {
      let errorMessage = `X API error: ${res.status}`;
      try {
        const errorData = await res.json();
        if (errorData.errors?.[0]?.message) {
          errorMessage = errorData.errors[0].message;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } catch {
        // Use default error message
      }
      return { success: false, error: errorMessage };
    }

    const data = await res.json();
    return {
      success: true,
      externalPostId: data.data?.id,
    };
  }

  async revokeToken(accessToken: string): Promise<boolean> {
    const body = new URLSearchParams({
      token: accessToken,
      client_id: getClientId(),
    });

    const res = await fetch(X_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    return res.ok;
  }
}
