import {
  decryptToken,
  encryptRotatedTokens,
} from "@/lib/social-token-crypto";
import { prisma } from "@/lib/prisma";
import { TIKTOK_BRIDGE_URL_TTL_MS } from "@/lib/tiktok-media-bridge";
import type { PublishMedia, PublishResult, SocialProvider } from "./provider";
import {
  TiktokApiError,
  isTiktokAuthErrorCode,
  tiktokErrorMessage,
  tiktokFailReasonMessage,
  resolveTiktokPostInfo,
  buildTiktokPhotoInitPayload,
  planTiktokChunks,
  tiktokChunkRanges,
  TIKTOK_STATUS_COMPLETE,
  TIKTOK_STATUS_FAILED,
  type TiktokPublishSettings,
  type TiktokCreatorInfo,
  type TiktokChunkPlan,
  type ByteRange,
} from "@/domain/social/policies/tiktok";
import { ProviderError } from "@/lib/errors/domain-error";

/**
 * Pure TikTok policies (media routing, error classification, post-info
 * construction, chunk planning, status rules) live in
 * `@/domain/social/policies/tiktok` and are re-exported here so existing
 * `@/lib/social/tiktok` imports keep working. OAuth, token refresh, Prisma
 * CAS, fetch, upload pipelines and polling stay in this module.
 * No behavior change.
 */
export * from "@/domain/social/policies/tiktok";
export type * from "@/domain/social/policies/tiktok";

const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_API_BASE = "https://open.tiktokapis.com";
/**
 * The only scopes Postvia requests. Do not claim broader scopes
 * (e.g. video.list, user.info.stats) anywhere in code or UI — TikTok
 * Login Kit grants exactly what is requested here.
 */
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const;

const DEFAULT_REDIRECT_URI = "https://postvia.online/api/auth/tiktok/callback";

export function getTiktokCredentials(): { clientKey: string; clientSecret: string } | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim() ?? "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim() ?? "";
  if (!clientKey || !clientSecret) return null;
  return { clientKey, clientSecret };
}

export function isTiktokConfigured(): boolean {
  return getTiktokCredentials() !== null;
}

export function getTiktokRedirectUri(): string {
  return process.env.TIKTOK_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

export function getTiktokAuthorizeUrl(state: string): string {
  const { clientKey } = getTiktokCredentials() ?? { clientKey: "" };
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    // Official Login Kit contract: scope must be a COMMA-separated string
    // ("user.info.basic,video.publish"). URLSearchParams encodes "," as %2C,
    // which TikTok decodes correctly; a space would become "+" and TikTok
    // rejects it with an "scope" error.
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: getTiktokRedirectUri(),
    state,
  });
  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

export type TiktokTokens = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
};

async function postForm(
  url: string,
  form: Record<string, string>,
  headers?: Record<string, string>
): Promise<Record<string, unknown>> {
  const fetchImpl = globalThis.fetch;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
      ...headers,
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) {
    const error = (data?.error ?? {}) as Record<string, unknown>;
    throw new TiktokApiError(
      String(error.code ?? data?.error ?? `http_${res.status}`),
      String(error.message ?? "TikTok request failed"),
      res.status
    );
  }
  return data;
}

async function postJson(
  url: string,
  accessToken: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await globalThis.fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const error = (data?.error ?? {}) as Record<string, unknown>;
  const code = String(error.code ?? (res.ok ? "ok" : `http_${res.status}`));
  if (code !== "ok") {
    throw new TiktokApiError(code, String(error.message ?? ""), res.status);
  }
  return (data?.data ?? {}) as Record<string, unknown>;
}

/** Exchange an OAuth code for tokens (server-side only). */
export async function exchangeTiktokCode(code: string): Promise<TiktokTokens> {
  const credentials = getTiktokCredentials();
  if (!credentials)
    throw new ProviderError("TikTok is not configured", { provider: "tiktok" });
  const data = await postForm(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    client_key: credentials.clientKey,
    client_secret: credentials.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getTiktokRedirectUri(),
  });
  return normalizeTokens(data);
}

/** Refresh an access token (TikTok rotates the refresh token as well). */
export async function refreshTiktokToken(refreshToken: string): Promise<TiktokTokens> {
  const credentials = getTiktokCredentials();
  if (!credentials)
    throw new ProviderError("TikTok is not configured", { provider: "tiktok" });
  const data = await postForm(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    client_key: credentials.clientKey,
    client_secret: credentials.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return normalizeTokens(data);
}

function normalizeTokens(data: Record<string, unknown>): TiktokTokens {
  const tokens = data as unknown as TiktokTokens;
  if (!tokens.access_token || !tokens.refresh_token || !tokens.open_id) {
    throw new TiktokApiError("token_exchange_failed", "Incomplete TikTok token response", 502);
  }
  if (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
    tokens.expires_in = 86400;
  }
  return tokens;
}

export async function revokeTiktokToken(accessToken: string): Promise<boolean> {
  try {
    const credentials = getTiktokCredentials();
    if (!credentials) return false;
    await postForm(`${TIKTOK_API_BASE}/v2/oauth/revoke/`, {
      client_key: credentials.clientKey,
      client_secret: credentials.clientSecret,
      token: accessToken,
    });
    return true;
  } catch {
    // Revoke is best-effort; local disconnection must still succeed.
    return false;
  }
}

export type TiktokUserInfo = {
  openId: string;
  displayName: string;
  avatarUrl?: string;
};

/** user.info.basic does NOT guarantee an @username; caller updates it from creator info. */
export async function fetchTiktokUserInfo(accessToken: string): Promise<TiktokUserInfo> {
  const res = await globalThis.fetch(
    `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,avatar_url,display_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json().catch(() => null);
  const user = data?.data?.user as Record<string, unknown> | undefined;
  const error = data?.error as Record<string, unknown> | undefined;
  if (!user?.open_id) {
    throw new TiktokApiError(
      String(error?.code ?? `http_${res.status}`),
      String(error?.message ?? "Failed to load TikTok profile"),
      res.status
    );
  }
  return {
    openId: String(user.open_id),
    displayName: String(user.display_name ?? ""),
    avatarUrl: user.avatar_url ? String(user.avatar_url) : undefined,
  };
}

export async function queryTiktokCreatorInfo(
  accessToken: string
): Promise<TiktokCreatorInfo> {
  const data = await postJson(
    `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`,
    accessToken
  );
  const rawOptions = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.map(String).map((option) => option.trim()).filter((option) => option.length > 0)
    : [];
  const maxDuration = Number(data.max_video_post_duration_sec ?? 0);
  return {
    creatorUsername: String(data.creator_username ?? ""),
    creatorNickname: String(data.creator_nickname ?? ""),
    // The live TikTok response is the only source of truth for privacy
    // options — capabilities.ts keeps a fallback whitelist for validation
    // only, never for the UI.
    privacyLevelOptions: [...new Set(rawOptions)],
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoPostDurationSec: Number.isFinite(maxDuration) && maxDuration > 0 ? maxDuration : 0,
  };
}

type TiktokTokenStore = {
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
    data: { accessToken: string; refreshToken: string; expiresAt: Date };
  }) => Promise<{ count: number }>;
  update: (args: {
    where: { id: string };
    data: { accessToken: string; refreshToken: string; expiresAt: Date };
  }) => Promise<unknown>;
};

/**
 * Returns a fresh access token for a stored TikTok account, refreshing and
 * persisting rotated tokens when close to expiry. Never logs secrets.
 *
 * TikTok rotates the refresh token on every refresh, so parallel targets of
 * the same account must not refresh twice with the same token:
 * 1. the stored row is re-read first — if a concurrent worker already
 *    rotated the tokens (different access token, still valid), its result
 *    is reused without a second refresh;
 * 2. the rotated tokens are persisted with a conditional update keyed on
 *    the previously seen access token — if another worker won the race,
 *    the loser re-reads and reuses the winner instead of overwriting it.
 */
export async function ensureFreshTiktokToken(
  account: {
    id: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  },
  store?: TiktokTokenStore,
  // Observability-only hook: fired iff THIS worker performs a refresh
  // network call (never on fast-path or concurrent reuse, never with
  // token values). Type-only import — erased at runtime.
  notify?: import("@/lib/publish-observability").TokenRefreshNotify
): Promise<string> {
  const db: TiktokTokenStore = store ?? prisma.socialAccount;
  const now = Date.now();
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
    notify?.("refresh_failed");
    throw new TiktokApiError(
      "token_expired",
      "TikTok access expired. Reconnect your TikTok account.",
      401
    );
  }
  let tokens: TiktokTokens;
  try {
    tokens = await refreshTiktokToken(decryptToken(refreshToken));
  } catch (error) {
    // Preserve TikTok's terminal refresh codes so callers can map them
    // to "reconnect" without parsing messages. Never attach tokens.
    notify?.("refresh_failed");
    if (error instanceof TiktokApiError && isTiktokAuthErrorCode(error.code)) {
      throw error;
    }
    throw error;
  }
  const next = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
  // Encrypted for storage; `next` stays plaintext because it is also the
  // return value. The CAS `where` below keeps using the value as READ from
  // the row, so ciphertext compares byte-for-byte (see social-token-crypto).
  const persisted = encryptRotatedTokens(next);
  try {
    const claimed = await db.updateMany({
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
  notify?.("refreshed");
  return next.accessToken;
}

/* ------------------------------ direct post ------------------------------ */

/* ------------------------------ photo policy ------------------------------ */

/**
 * Validity of the first-party bridge URLs handed to TikTok via
 * PULL_FROM_URL (`/api/tiktok/media/{id}?expires&sig`). Single source of
 * truth lives in `tiktok-media-bridge.ts`; this alias keeps the policy
 * module's public surface stable. 90 min comfortably exceeds TikTok's
 * 1-hour PULL_FROM_URL download timeout (the download starts seconds
 * after init). A raw Vercel presigned Blob URL is deliberately NOT used:
 * its `{store}.private.blob.vercel-storage.com` hostname can never be
 * covered by TikTok's domain/URL-prefix ownership verification.
 */
export const TIKTOK_PHOTO_URL_TTL_MS = TIKTOK_BRIDGE_URL_TTL_MS;

export type TiktokJobStatus = {
  status: string;
  failReason?: string;
  postIds: string[];
};

const KNOWN_PROCESSING_STATUSES = new Set([
  "PROCESSING_UPLOAD",
  "PROCESSING_DOWNLOAD",
  "PROCESSING_TRANSCODING",
  "PROCESSING_PUBLISH",
]);

export async function fetchTiktokPublishStatus(
  accessToken: string,
  publishId: string
): Promise<TiktokJobStatus> {
  const data = await postJson(
    `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
    accessToken,
    { publish_id: publishId }
  );
  const postIds = [
    ...((data.publicaly_available_post_id as unknown[] | undefined) ?? []),
    ...((data.private_post_id as unknown[] | undefined) ?? []),
    ...((data.post_id as unknown[] | undefined) ?? []),
  ].map(String).filter((id) => id.length > 0);
  return {
    status: String(data.status ?? ""),
    failReason: data.fail_reason ? String(data.fail_reason) : undefined,
    postIds,
  };
}

export type TiktokDirectPostOutcome =
  | { state: "published"; externalPostId?: string }
  | { state: "failed"; error: string }
  | { state: "processing"; publishId: string }
  | { state: "invalid"; error: string };
export type TiktokDirectPostDeps = {
  readChunk: (range: ByteRange) => Promise<ArrayBuffer>;
  onPublishId: (publishId: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  now?: () => number;
};
export type TiktokDirectPhotoDeps = {
  onPublishId: (publishId: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  now?: () => number;
};

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_BUDGET_MS = 150_000;

/**
 * TikTok Video Direct Post with FILE_UPLOAD transfer.
 * Resume-safe: when publishId is already known we ONLY fetch status —
 * a second video/init can never happen for the same target.
 */
export async function publishTiktokDirectVideo(
  accessToken: string,
  input: {
    title: string;
    settings: TiktokPublishSettings;
    videoSize: number;
    videoContentType: string;
    existingPublishId?: string | null;
  },
  deps: TiktokDirectPostDeps
): Promise<TiktokDirectPostOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollBudgetMs = deps.pollBudgetMs ?? DEFAULT_POLL_BUDGET_MS;
  const now = deps.now ?? (() => Date.now());

  if (input.existingPublishId) {
    return monitorPublish(accessToken, input.existingPublishId, sleep, pollIntervalMs, pollBudgetMs, now);
  }

  if (!Number.isFinite(input.videoSize) || input.videoSize <= 0) {
    return { state: "invalid", error: "TikTok publishing requires a valid video file." };
  }
  if (typeof input.videoContentType !== "string" || input.videoContentType.trim().length === 0) {
    return { state: "invalid", error: "TikTok publishing requires a video content type." };
  }
  if (!input.title || input.title.trim().length === 0) {
    return {
      state: "invalid",
      error: "TikTok video has no caption text. Provide a title.",
    };
  }

  let creatorInfo: TiktokCreatorInfo;
  try {
    creatorInfo = await queryTiktokCreatorInfo(accessToken);
  } catch (error) {
    return { state: "failed", error: tiktokErrorMessage(error) };
  }

  const resolved = resolveTiktokPostInfo({
    title: input.title,
    settings: input.settings,
    creatorInfo,
  });
  if ("error" in resolved) {
    return { state: "invalid", error: resolved.error };
  }

  let plan: TiktokChunkPlan;
  try {
    plan = planTiktokChunks(input.videoSize);
  } catch {
    return { state: "invalid", error: "TikTok publishing requires a valid video file." };
  }
  let publishId: string;
  let uploadUrl: string;
  try {
    const data = await postJson(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, accessToken, {
      post_info: resolved.postInfo,
      source_info: {
        source: "FILE_UPLOAD",
        video_size: input.videoSize,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    });
    publishId = String(data.publish_id ?? "");
    uploadUrl = String(data.upload_url ?? "");
    if (!publishId || !uploadUrl) {
      return { state: "failed", error: "TikTok did not return an upload target. Retry the post." };
    }
  } catch (error) {
    return { state: "failed", error: tiktokErrorMessage(error) };
  }

  // Persist IMMEDIATELY: from here on, every failure path resumes via
  // status/fetch instead of re-initializing (duplicate protection).
  await deps.onPublishId(publishId);

  try {
    for (const range of tiktokChunkRanges(input.videoSize, plan)) {
      const body = await deps.readChunk(range);
      if (body.byteLength !== range.length) {
        return {
          state: "failed",
          error: "TikTok video upload read an incomplete chunk. Please retry the post.",
        };
      }
      const res = await globalThis.fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": input.videoContentType,
          "Content-Length": String(range.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${input.videoSize}`,
        },
        body,
      });
      // 206 for intermediate chunks, 201 (or 2xx) for the final one.
      if (!res.ok && res.status !== 206) {
        return {
          state: "failed",
          error: `TikTok rejected the video upload (HTTP ${res.status}). Please retry the post.`,
        };
      }
    }
  } catch (error) {
    return { state: "failed", error: tiktokErrorMessage(error) };
  }

  return monitorPublish(accessToken, publishId, sleep, pollIntervalMs, pollBudgetMs, now);
}

/**
 * TikTok PHOTO Direct Post via PULL_FROM_URL.
 * Separate contract from video (content/init, media_type PHOTO) — never
 * routed through the video FILE_UPLOAD endpoint.
 * Resume-safe: when publishId is already known we ONLY fetch status —
 * a second content/init can never happen for the same target.
 */
export async function publishTiktokDirectPhoto(
  accessToken: string,
  input: {
    title: string;
    description?: string;
    settings: TiktokPublishSettings;
    photoUrls: string[];
    coverIndex: number;
    existingPublishId?: string | null;
  },
  deps: TiktokDirectPhotoDeps
): Promise<TiktokDirectPostOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollBudgetMs = deps.pollBudgetMs ?? DEFAULT_POLL_BUDGET_MS;
  const now = deps.now ?? (() => Date.now());

  if (input.existingPublishId) {
    return monitorPublish(accessToken, input.existingPublishId, sleep, pollIntervalMs, pollBudgetMs, now);
  }

  if (
    (!input.title || input.title.trim().length === 0) &&
    (!input.description || input.description.trim().length === 0)
  ) {
    return {
      state: "invalid",
      error: "TikTok photo post has no text. Add post text, a custom title, or a description.",
    };
  }

  let creatorInfo: TiktokCreatorInfo;
  try {
    creatorInfo = await queryTiktokCreatorInfo(accessToken);
  } catch (error) {
    return { state: "failed", error: tiktokErrorMessage(error) };
  }

  const built = buildTiktokPhotoInitPayload({
    title: input.title,
    description: input.description,
    settings: input.settings,
    creatorInfo,
    photoUrls: input.photoUrls,
    coverIndex: input.coverIndex,
  });
  if ("error" in built) {
    return { state: "invalid", error: built.error };
  }

  let publishId: string;
  try {
    const data = await postJson(
      `${TIKTOK_API_BASE}/v2/post/publish/content/init/`,
      accessToken,
      built.payload as unknown as Record<string, unknown>
    );
    publishId = String(data.publish_id ?? "");
    if (!publishId) {
      return { state: "failed", error: "TikTok did not return a publish id. Retry the post." };
    }
  } catch (error) {
    return { state: "failed", error: tiktokErrorMessage(error) };
  }

  // Persist IMMEDIATELY: from here on, every path resumes via
  // status/fetch instead of re-initializing (duplicate protection).
  await deps.onPublishId(publishId);

  return monitorPublish(accessToken, publishId, sleep, pollIntervalMs, pollBudgetMs, now);
}

async function monitorPublish(
  accessToken: string,
  publishId: string,
  sleep: (ms: number) => Promise<void>,
  pollIntervalMs: number,
  pollBudgetMs: number,
  now: () => number
): Promise<TiktokDirectPostOutcome> {
  const deadline = now() + pollBudgetMs;
  let sawKnownProcessing = false;
  for (;;) {
    try {
      const status = await fetchTiktokPublishStatus(accessToken, publishId);
      if (status.status === TIKTOK_STATUS_COMPLETE) {
        return { state: "published", externalPostId: status.postIds[0] };
      }
      if (status.status === TIKTOK_STATUS_FAILED) {
        return { state: "failed", error: tiktokFailReasonMessage(status.failReason) };
      }
      if (KNOWN_PROCESSING_STATUSES.has(status.status) || status.status.length === 0) {
        sawKnownProcessing = true;
      } else if (!sawKnownProcessing) {
        return {
          state: "failed",
          error: `TikTok reported an unexpected status (${status.status}). Please check the account and retry.`,
        };
      } else {
        // Unknown status after known processing: keep waiting until budget.
        sawKnownProcessing = true;
      }
    } catch {
      // Transient status-fetch errors must never trigger a second init;
      // keep monitoring until the polling budget runs out.
    }
    if (now() + pollIntervalMs > deadline) break;
    await sleep(pollIntervalMs);
  }
  return { state: "processing", publishId };
}

/* ------------------------------ provider ------------------------------ */

export class TiktokProvider implements SocialProvider {
  getAuthorizeUrl(state: string): string {
    return getTiktokAuthorizeUrl(state);
  }

  async exchangeCode(
    code: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    externalId?: string;
  }> {
    const tokens = await exchangeTiktokCode(code);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      externalId: tokens.open_id,
    };
  }

  async getCurrentUser(accessToken: string): Promise<{ externalId: string; username: string }> {
    const user = await fetchTiktokUserInfo(accessToken);
    return { externalId: user.openId, username: user.displayName };
  }

  /** TikTok requires the video pipeline; the generic text path is unused. */
  async publishPost(
    _accessToken: string,
    _text: string,
    _externalId: string,
    _media?: PublishMedia
  ): Promise<PublishResult> {
    void _media;
    return {
      success: false,
      error: "TikTok publishing requires the video pipeline.",
    };
  }

  async revokeToken(accessToken: string): Promise<boolean> {
    return revokeTiktokToken(accessToken);
  }
}
