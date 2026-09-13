import { prisma } from "@/lib/prisma";
import type { SocialProvider, PublishResult } from "./provider";

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

export class XApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "XApiError";
  }
}

/**
 * Auth/token failures that always mean the user must reconnect — shared
 * by publish, refresh and resume so the contract stays in one place.
 */
export function isXAuthErrorCode(code: string): boolean {
  return (
    code === "unauthorized" ||
    code === "forbidden" ||
    code === "token_expired" ||
    code === "invalid_token" ||
    code === "invalid_refresh_token" ||
    code === "refresh_token_expired" ||
    code === "access_token_expired" ||
    code === "access_token_invalid"
  );
}

/** Classify a raw publish failure message as an auth failure. */
export function isXAuthErrorMessage(message: string): boolean {
  return (
    /http 40[13]\b/i.test(message) ||
    /unauthorized|forbidden|invalid[\s_-]*token|token[\s_-]*(expired|invalid)|session[\s_-]*expired|revoked/i.test(
      message
    )
  );
}

export function xErrorMessage(error: unknown): string {
  const code = error instanceof XApiError ? error.code : "";
  if (
    (typeof code === "string" && code.length > 0 && isXAuthErrorCode(code)) ||
    (error instanceof Error && isXAuthErrorMessage(error.message))
  ) {
    return "X access expired or was revoked. Reconnect your X account.";
  }
  if (error instanceof Error) {
    if (/not allowed to post a video longer than/i.test(error.message)) {
      return "This video is longer than your X account is allowed to post. Use a shorter video.";
    }
    if (/media processing (failed|timed out)|could not be processed/i.test(error.message)) {
      return error.message;
    }
    if (error.message) return error.message;
  }
  return "X publishing failed. Please try again.";
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
  if (account.expiresAt && account.expiresAt.getTime() > now + 5 * 60_000) {
    return account.accessToken;
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
    return current.accessToken;
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
    tokens = await refreshXToken(refreshToken);
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
  try {
    const claimed = await db.updateMany({
      where: { id: account.id, accessToken: current.accessToken },
      data: next,
    });
    if (claimed.count === 0) {
      // Lost the rotation race: re-read the winner's tokens.
      const winner = await db.findUnique({
        where: { id: account.id },
        select: { accessToken: true, refreshToken: true, expiresAt: true },
      });
      if (winner && winner.accessToken !== current.accessToken) {
        return winner.accessToken;
      }
    }
  } catch {
    // Conditional update unsupported (or transient DB error): fall back
    // to a plain update so tokens still rotate, then return them.
    await db.update({ where: { id: account.id }, data: next });
  }
  return next.accessToken;
}

/* ------------------------------ media upload ------------------------------ */

export const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const X_GIF_MAX_BYTES = 15 * 1024 * 1024;
export const X_MAX_PHOTOS = 4;
export const X_STATIC_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const X_GIF_MIME_TYPES = ["image/gif"] as const;
export const X_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;
/** APPEND segments must stay at or below 5 MB (server max 8 MB). */
const X_APPEND_CHUNK_SIZE = 4 * 1024 * 1024;

export type XMediaCategory = "tweet_image" | "tweet_gif" | "tweet_video";

export type XMediaPolicyInput = {
  id: string;
  type: string;
  mimeType: string;
  size: number;
};

export type XMediaPolicy =
  | { kind: "text" }
  | { kind: "photo"; mediaIds: string[] }
  | { kind: "gif"; mediaId: string }
  | { kind: "video"; mediaId: string }
  | { kind: "error"; message: string };

/**
 * Pure X media router. Keeps X-only restrictions (5 MB photos, 15 MB GIF,
 * 4 photos / 1 GIF / 1 video per post, no mixing, MP4/MOV video) out of
 * the global validateMediaInput(), which intentionally stays broader for
 * other platforms. Order of `media` is the upload order.
 */
export function resolveXMediaPolicy(
  media: readonly XMediaPolicyInput[]
): XMediaPolicy {
  if (media.length === 0) return { kind: "text" };
  const hasVideo = media.some((item) => item.type === "VIDEO");
  const hasImage = media.some((item) => item.type === "IMAGE");
  if (hasVideo && hasImage) {
    return {
      kind: "error",
      message:
        "X does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.",
    };
  }
  if (hasVideo) {
    if (media.length > 1) {
      return { kind: "error", message: "X supports only one video per post." };
    }
    const only = media[0];
    if (!(X_VIDEO_MIME_TYPES as readonly string[]).includes(only.mimeType)) {
      const short = only.mimeType.split("/").pop() ?? only.mimeType;
      return {
        kind: "error",
        message: `X video posts support MP4 and MOV files only (got ${short}).`,
      };
    }
    if (!Number.isFinite(only.size) || only.size <= 0) {
      return { kind: "error", message: "X publishing requires a valid video file." };
    }
    return { kind: "video", mediaId: only.id };
  }
  // Image path: every item is IMAGE here.
  if (media.some((item) => item.type !== "IMAGE")) {
    return { kind: "error", message: "X media posts support images or one video." };
  }
  const gifs = media.filter((item) => item.mimeType === "image/gif");
  if (gifs.length > 0) {
    if (media.length > 1) {
      return {
        kind: "error",
        message: "X does not support combining a GIF with other media. Post the GIF on its own.",
      };
    }
    const only = gifs[0];
    if (!Number.isFinite(only.size) || only.size <= 0) {
      return { kind: "error", message: "X publishing requires a valid GIF file." };
    }
    if (only.size > X_GIF_MAX_BYTES) {
      return {
        kind: "error",
        message: "The GIF exceeds X's 15 MB limit. Use a smaller file.",
      };
    }
    return { kind: "gif", mediaId: only.id };
  }
  if (media.length > X_MAX_PHOTOS) {
    return {
      kind: "error",
      message: `X supports at most ${X_MAX_PHOTOS} photos per post.`,
    };
  }
  for (const item of media) {
    if (!(X_STATIC_IMAGE_MIME_TYPES as readonly string[]).includes(item.mimeType)) {
      const short = item.mimeType.split("/").pop() ?? item.mimeType;
      return {
        kind: "error",
        message: `X photo posts support JPG, PNG and WebP images only (got ${short}).`,
      };
    }
    if (!Number.isFinite(item.size) || item.size <= 0) {
      return { kind: "error", message: "X publishing requires a valid image file." };
    }
    if (item.size > X_IMAGE_MAX_BYTES) {
      return {
        kind: "error",
        message: "One of the photos exceeds X's 5 MB per-photo limit. Use a smaller file.",
      };
    }
  }
  return { kind: "photo", mediaIds: media.map((item) => item.id) };
}

export function xMediaCategoryForMime(mimeType: string): XMediaCategory {
  if (mimeType === "image/gif") return "tweet_gif";
  if ((X_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return "tweet_video";
  return "tweet_image";
}

export type XUploadOutcome =
  | { state: "ready"; mediaId: string }
  | { state: "failed"; error: string };

export type XMediaUploadDeps = {
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  now?: () => number;
};

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
  input: { bytes: ArrayBuffer; mediaType: string; mediaCategory: XMediaCategory },
  deps: XMediaUploadDeps = {}
): Promise<XUploadOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? X_DEFAULT_POLL_INTERVAL_MS;
  const pollBudgetMs = deps.pollBudgetMs ?? X_DEFAULT_POLL_BUDGET_MS;
  const now = deps.now ?? (() => Date.now());

  if (!(input.bytes instanceof ArrayBuffer) || input.bytes.byteLength === 0) {
    return { state: "failed", error: "X media upload requires a non-empty file." };
  }

  let mediaId: string;
  try {
    mediaId = await initializeXMediaUpload(accessToken, {
      mediaType: input.mediaType,
      totalBytes: input.bytes.byteLength,
      mediaCategory: input.mediaCategory,
    });
  } catch (error) {
    return { state: "failed", error: xErrorMessage(error) };
  }

  try {
    let segmentIndex = 0;
    for (let offset = 0; offset < input.bytes.byteLength; offset += X_APPEND_CHUNK_SIZE) {
      const chunk = input.bytes.slice(offset, offset + X_APPEND_CHUNK_SIZE);
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

/**
 * X duplicate-publishing hardening.
 *
 * Official X API fact (docs.x.com, CreatePosts schema): POST /2/tweets
 * has NO idempotency key and no "exactly-once" primitive. A tweet that
 * was created remotely while the response was lost (network timeout,
 * process crash) cannot be distinguished from "never sent" — and
 * guessing via "latest user tweets" would risk linking someone else's
 * post, so Postvia deliberately does NOT do that.
 *
 * Best-effort strategy with zero schema changes, using the existing
 * PostTarget.externalJobId column as an attempt marker:
 * - immediately BEFORE the tweet POST, the target stores
 *   `x-req-<random>` (never a real tweet id — those go to
 *   externalPostId). Media uploads happen BEFORE the marker, so an
 *   upload-only failure provably created no tweet.
 * - success / unambiguous X rejection clears the marker.
 * - a thrown transport error (timeout/abort/crash window) keeps the
 *   outcome UNKNOWN: FAILED with an explicit "check your X profile
 *   before retrying" message (manual retry stays possible but informed;
 *   cron never auto-retries FAILED).
 * - a process crash leaves PUBLISHING + marker. Stale recovery routes
 *   X markers to resumeXTarget (publish.ts): fresh markers stay
 *   PUBLISHING ("pending", never blind-reset into an auto-republish);
 *   markers older than X_AMBIGUOUS_ATTEMPT_MS convert to FAILED with
 *   the same check-first guidance. No second POST is ever issued
 *   automatically for an unknown outcome.
 */
const X_ATTEMPT_MARKER_PREFIX = "x-req-";

/**
 * How long a crashed X attempt stays non-retryable before recovery
 * converts it to FAILED-with-guidance. The tweet POST is synchronous
 * (seconds); the stale threshold is 6 min, so 10 min leaves margin
 * without stranding users anywhere near the 24h schedule-validity.
 */
export const X_AMBIGUOUS_ATTEMPT_MS = 10 * 60_000;

export function createXAttemptMarker(): string {
  return `${X_ATTEMPT_MARKER_PREFIX}${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}

export function isXAttemptMarker(jobId: string | null | undefined): boolean {
  return (
    typeof jobId === "string" &&
    jobId.startsWith(X_ATTEMPT_MARKER_PREFIX) &&
    jobId.length > X_ATTEMPT_MARKER_PREFIX.length
  );
}

/** Informed-manual-retry message for outcomes where a tweet may exist. */
export function xAmbiguousRetryMessage(): string {
  return (
    "X did not confirm whether the post was published (the request timed out or was interrupted). " +
    "Check your X profile first: if the post is there, do not retry. " +
    "Retrying may publish a duplicate."
  );
}

export type XStaleAttemptDecision = "pending" | "unknown" | "skip";

/**
 * Pure stale-recovery decision for an X target. "pending" keeps the
 * target in PUBLISHING (blocks both auto-reset and manual republish);
 * "unknown" converts it to FAILED-with-guidance (informed manual
 * retry); "skip" leaves non-X / non-marker / non-PUBLISHING rows to
 * the generic recovery path.
 */
export function decideXStaleAttempt(input: {
  platform: string;
  status: string;
  externalJobId: string | null | undefined;
  updatedAtMs: number;
  nowMs: number;
}): XStaleAttemptDecision {
  if (input.platform !== "X") return "skip";
  if (input.status !== "PUBLISHING") return "skip";
  if (!isXAttemptMarker(input.externalJobId)) return "skip";
  if (!Number.isFinite(input.updatedAtMs) || !Number.isFinite(input.nowMs)) {
    return "pending";
  }
  return input.nowMs - input.updatedAtMs > X_AMBIGUOUS_ATTEMPT_MS ? "unknown" : "pending";
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
