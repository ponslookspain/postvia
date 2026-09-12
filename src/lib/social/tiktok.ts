import { prisma } from "@/lib/prisma";
import type { PublishMedia, PublishResult, SocialProvider } from "./provider";

const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const TIKTOK_SCOPES = ["user.info.basic", "video.publish"];

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

export class TiktokApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "TiktokApiError";
  }
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
  if (!credentials) throw new Error("TikTok is not configured");
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
  if (!credentials) throw new Error("TikTok is not configured");
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

export type TiktokCreatorInfo = {
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

export async function queryTiktokCreatorInfo(
  accessToken: string
): Promise<TiktokCreatorInfo> {
  const data = await postJson(
    `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`,
    accessToken
  );
  return {
    creatorUsername: String(data.creator_username ?? ""),
    creatorNickname: String(data.creator_nickname ?? ""),
    privacyLevelOptions: Array.isArray(data.privacy_level_options)
      ? data.privacy_level_options.map(String)
      : [],
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoPostDurationSec: Number(data.max_video_post_duration_sec ?? 0),
  };
}

/**
 * Returns a fresh access token for a stored TikTok account, refreshing and
 * persisting rotated tokens when close to expiry. Never logs secrets.
 *
 * TikTok rotates the refresh token on every refresh, so parallel targets of
 * the same account must not refresh twice with the same token. The stored
 * row is re-read first: if a concurrent worker already rotated the tokens
 * (different access token, still valid), its result is reused.
 */
export async function ensureFreshTiktokToken(account: {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}): Promise<string> {
  const now = Date.now();
  if (account.expiresAt && account.expiresAt.getTime() > now + 5 * 60_000) {
    return account.accessToken;
  }
  const stored = await prisma.socialAccount.findUnique({
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
    throw new TiktokApiError(
      "token_expired",
      "TikTok access expired. Reconnect your TikTok account.",
      401
    );
  }
  const tokens = await refreshTiktokToken(refreshToken);
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
  return tokens.access_token;
}

/* ------------------------------ direct post ------------------------------ */

export const TIKTOK_CHUNK_LIMIT = 64 * 1024 * 1024;
const TIKTOK_SPLIT_CHUNK_SIZE = 20 * 1024 * 1024;

export type TiktokChunkPlan = { chunkSize: number; totalChunkCount: number };

/**
 * TikTok rules: files <= 64 MB upload as ONE whole-file chunk; larger files
 * split into 5-64 MB chunks where the final chunk absorbs the remainder.
 */
export function planTiktokChunks(videoSize: number): TiktokChunkPlan {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error("Invalid video size");
  }
  if (videoSize <= TIKTOK_CHUNK_LIMIT) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const totalChunkCount = Math.max(2, Math.floor(videoSize / TIKTOK_SPLIT_CHUNK_SIZE));
  return { chunkSize: TIKTOK_SPLIT_CHUNK_SIZE, totalChunkCount };
}

export type ByteRange = { start: number; end: number; length: number; last: boolean };

export function tiktokChunkRanges(videoSize: number, plan: TiktokChunkPlan): ByteRange[] {
  const ranges: ByteRange[] = [];
  for (let index = 0; index < plan.totalChunkCount; index++) {
    const start = index * plan.chunkSize;
    // The final chunk absorbs all remaining bytes.
    const end = index === plan.totalChunkCount - 1 ? videoSize - 1 : start + plan.chunkSize - 1;
    ranges.push({ start, end, length: end - start + 1, last: index === plan.totalChunkCount - 1 });
  }
  return ranges;
}

export type TiktokPublishSettings = {
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
};

export type TiktokJobStatus = {
  status: string;
  failReason?: string;
  postIds: string[];
};

const COMPLETE_STATUS = "PUBLISH_COMPLETE";
const FAILED_STATUS = "FAILED";
export const TIKTOK_STATUS_COMPLETE = COMPLETE_STATUS;
export const TIKTOK_STATUS_FAILED = FAILED_STATUS;
const KNOWN_PROCESSING_STATUSES = new Set([
  "PROCESSING_UPLOAD",
  "PROCESSING_DOWNLOAD",
  "PROCESSING_TRANSCODING",
  "PROCESSING_PUBLISH",
]);

export function isTiktokTerminalStatus(status: string): boolean {
  return status === COMPLETE_STATUS || status === FAILED_STATUS;
}

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

export function tiktokErrorMessage(error: unknown): string {
  const code =
    error instanceof TiktokApiError
      ? error.code
      : typeof error === "object" && error && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
  switch (code) {
    case "privacy_level_option_mismatch":
      return "TikTok rejected the privacy setting for this account. Pick a different option in the post's TikTok settings.";
    case "spam_risk_too_many_posts":
      return "This TikTok account hit its daily publishing limit. Try again tomorrow or retry this post later.";
    case "reached_active_user_cap":
      return "The TikTok app hit its daily active publishing cap. Retry later.";
    case "unaudited_client_can_only_post_to_private_accounts":
      return "This TikTok app is not audited yet: only private TikTok accounts can be posted to, and posts are restricted to private viewing.";
    case "rate_limit_exceeded":
      return "TikTok rate limit reached. Please retry in a minute.";
    case "scope_not_authorized":
    case "token_expired":
    case "invalid_refresh_token":
    case "refresh_token_expired":
      return "TikTok access expired or was revoked. Reconnect your TikTok account.";
    case "url_ownership_unverified":
      return "TikTok could not verify the media source. Please retry the post.";
    case "video_size_exceeds_limit":
      return "The video is too large for TikTok. Use a smaller file.";
    case "video_duration_exceeds_limit":
      return "The video is longer than this TikTok account is allowed to post.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "TikTok publishing failed. Please try again.";
  }
}

/** Settings are validated against fresh creator info; unavailable options are enforced off. */
export function resolveTiktokPostInfo(input: {
  title: string;
  settings: TiktokPublishSettings;
  creatorInfo: TiktokCreatorInfo;
}): { postInfo: Record<string, unknown> } | { error: string } {
  const { settings, creatorInfo } = input;
  const title = input.title.trim();
  if (!title) {
    return { error: "TikTok posts require a caption. Add text for TikTok." };
  }
  if (Array.from(title).length > 2200) {
    return { error: "TikTok caption exceeds the 2200 character limit." };
  }
  if (creatorInfo.privacyLevelOptions.length === 0) {
    return { error: "TikTok did not return privacy options for this account. Reconnect or retry." };
  }
  const privacyLevel = settings.privacyLevel ?? "SELF_ONLY";
  if (!creatorInfo.privacyLevelOptions.includes(privacyLevel)) {
    return {
      error: `This TikTok account cannot use the "${privacyLevel}" privacy setting. Choose another option.`,
    };
  }
  const postInfo: Record<string, unknown> = {
    title,
    privacy_level: privacyLevel,
    disable_comment: settings.disableComment === true || creatorInfo.commentDisabled,
    disable_duet: settings.disableDuet === true || creatorInfo.duetDisabled,
    disable_stitch: settings.disableStitch === true || creatorInfo.stitchDisabled,
  };
  const cover = settings.videoCoverTimestampMs;
  if (typeof cover === "number" && Number.isInteger(cover) && cover >= 0) {
    postInfo.video_cover_timestamp_ms = cover;
  }
  return { postInfo };
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

  const plan = planTiktokChunks(input.videoSize);
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
      if (status.status === COMPLETE_STATUS) {
        return { state: "published", externalPostId: status.postIds[0] };
      }
      if (status.status === FAILED_STATUS) {
        return {
          state: "failed",
          error: status.failReason
            ? `TikTok could not publish the video: ${status.failReason}`
            : "TikTok rejected the video post. Please review the media and retry.",
        };
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
