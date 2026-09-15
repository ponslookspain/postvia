import { prisma } from "@/lib/prisma";
import type { PublishMedia, PublishResult, SocialProvider } from "./provider";
import type { MediaKind } from "@/lib/media";

/**
 * Instagram provider via the Instagram Platform API (Instagram Login).
 * Content Publishing follows Meta's container flow:
 *   POST /{ig-user-id}/media          (create container; image_url | video_url)
 *   GET  /{container-id}?fields=status_code
 *   POST /{ig-user-id}/media_publish  (only after the container is FINISHED)
 *
 * Resume-safe: the container id is persisted (PostTarget.externalJobId)
 * before publishing, so a crash/timeout resumes by polling + publishing the
 * SAME container — never creating a second one (duplicate protection).
 */

const TIK = {
  authorize: "https://www.instagram.com/oauth/authorize",
  oauthToken: "https://api.instagram.com/oauth/access_token",
  graph: "https://graph.instagram.com/v25.0",
};

const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
const DEFAULT_REDIRECT_URI = "https://postvia.online/api/auth/instagram/callback";

export function getInstagramCredentials():
  | { clientId: string; clientSecret: string }
  | null {
  const clientId = process.env.INSTAGRAM_APP_ID?.trim() ?? "";
  const clientSecret = process.env.INSTAGRAM_APP_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isInstagramConfigured(): boolean {
  return getInstagramCredentials() !== null;
}

export function getInstagramRedirectUri(): string {
  return process.env.INSTAGRAM_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

export function getInstagramAuthorizeUrl(state: string): string {
  const { clientId } = getInstagramCredentials() ?? { clientId: "" };
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getInstagramRedirectUri(),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
    // Forces pure Instagram login (no Facebook login fallback).
    enable_fb_login: "0",
    force_authentication: "1",
  });
  return `${TIK.authorize}?${params.toString()}`;
}

export class InstagramApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly errorType?: string
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

function checkError(data: Record<string, unknown> | null, httpStatus: number): void {
  const error = (data?.error ?? null) as Record<string, unknown> | null;
  if (!error) return;
  const code = String(error.code ?? data?.error ?? `http_${httpStatus}`);
  const message = String(error.message ?? "Instagram request failed");
  const type = error.type ? String(error.type) : undefined;
  // A non-ok payload with an error object is always a failure.
  throw new InstagramApiError(
    code,
    message,
    httpStatus,
    type
  );
}

async function oauthForm(
  url: string,
  form: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await globalThis.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await readJson(res);
  if (!res.ok) {
    checkError(data, res.status);
    throw new InstagramApiError(`http_${res.status}`, "Instagram token request failed", res.status);
  }
  return data ?? {};
}

async function graphGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ access_token: accessToken, ...(params ?? {}) });
  const res = await globalThis.fetch(`${TIK.graph}/${path.replace(/^\//, "")}?${query.toString()}`);
  const data = await readJson(res);
  if (!res.ok) checkError(data, res.status);
  checkError(data, res.status);
  return (data ?? {}) as Record<string, unknown>;
}

async function graphPost(
  path: string,
  accessToken: string,
  fields: Record<string, string>
): Promise<Record<string, unknown>> {
  const form = new URLSearchParams({ access_token: accessToken, ...fields });
  const res = await globalThis.fetch(`${TIK.graph}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await readJson(res);
  if (!res.ok) checkError(data, res.status);
  checkError(data, res.status);
  return (data ?? {}) as Record<string, unknown>;
}

export type InstagramTokens = {
  accessToken: string;
  expiresAt: Date;
  userId: string;
};

function toExpiresAt(expiresIn: unknown): Date {
  const seconds = Number(expiresIn ?? 0);
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

/** Step 1+2: code -> short-lived -> long-lived (60d) token. Server-side only. */
export async function exchangeInstagramCode(code: string): Promise<InstagramTokens> {
  const creds = getInstagramCredentials();
  if (!creds) throw new Error("Instagram is not configured");
  const redirectUri = getInstagramRedirectUri();

  const shortData = await oauthForm(TIK.oauthToken, {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const shortToken = String(shortData.access_token ?? "");
  if (!shortToken) {
    throw new InstagramApiError("token_exchange_failed", "No short-lived token", 502);
  }

  const longData = await graphGet("access_token", shortToken, {
    grant_type: "ig_exchange_token",
    client_secret: creds.clientSecret,
  });
  const accessToken = String(longData.access_token ?? shortToken);
  const userId = String(longData.user_id ?? shortData.user_id ?? "");
  return {
    accessToken,
    expiresAt: toExpiresAt(longData.expires_in ?? shortData.expires_in),
    userId,
  };
}

/**
 * Refresh a long-lived token (Instagram has no separate refresh token: the
 * long-lived access token is exchanged for a fresh one).
 */
export async function refreshInstagramToken(accessToken: string): Promise<InstagramTokens> {
  const data = await graphGet("refresh_access_token", accessToken, {
    grant_type: "ig_refresh_token",
  });
  return {
    accessToken: String(data.access_token ?? accessToken),
    expiresAt: toExpiresAt(data.expires_in),
    userId: String(data.user_id ?? ""),
  };
}

export async function revokeInstagramToken(
  igUserId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const query = new URLSearchParams({ access_token: accessToken });
    const res = await globalThis.fetch(
      `${TIK.graph}/${igUserId}/access_tokens?${query.toString()}`,
      { method: "DELETE" }
    );
    return res.ok;
  } catch {
    // Revoke is best-effort; local disconnect must still succeed.
    return false;
  }
}

export type InstagramProfile = {
  id: string;
  username: string;
  accountType?: string;
};

export async function fetchInstagramProfile(
  accessToken: string
): Promise<InstagramProfile> {
  const data = await graphGet("me", accessToken, {
    fields: "id,username,account_type",
  });
  return {
    id: String(data.id ?? ""),
    username: String(data.username ?? ""),
    accountType: data.account_type ? String(data.account_type) : undefined,
  };
}

type InstagramTokenStore = {
  findUnique: (args: {
    where: { id: string };
    select: { accessToken: boolean; expiresAt: boolean };
  }) => Promise<{ accessToken: string; expiresAt: Date | null } | null>;
  updateMany: (args: {
    where: { id: string; accessToken: string };
    data: { accessToken: string; expiresAt: Date };
  }) => Promise<{ count: number }>;
  update: (args: {
    where: { id: string };
    data: { accessToken: string; expiresAt: Date };
  }) => Promise<unknown>;
};

/**
 * Returns a valid long-lived token, refreshing + persisting the rotated
 * token when within 5 minutes of expiry. Never logs secrets.
 *
 * Race-safe (same contract as TikTok): the stored row is re-read first so
 * a concurrent worker's refresh is reused, and the rotated token is
 * persisted with a conditional update keyed on the previously seen access
 * token — the loser of the race re-reads the winner instead of
 * overwriting a fresh token (a stale loser token may already be
 * invalidated by Meta's rotation).
 */
export async function ensureFreshInstagramToken(
  account: {
    id: string;
    accessToken: string;
    expiresAt: Date | null;
  },
  store?: InstagramTokenStore
): Promise<string> {
  const db: InstagramTokenStore = store ?? prisma.socialAccount;
  const now = Date.now();
  if (account.expiresAt && account.expiresAt.getTime() > now + 5 * 60_000) {
    return account.accessToken;
  }
  const stored = await db.findUnique({
    where: { id: account.id },
    select: { accessToken: true, expiresAt: true },
  });
  const current = stored ?? account;
  if (
    current.expiresAt &&
    current.expiresAt.getTime() > Date.now() + 5 * 60_000 &&
    current.accessToken !== account.accessToken
  ) {
    // Another worker refreshed concurrently; reuse its rotated token.
    return current.accessToken;
  }
  const refreshed = await refreshInstagramToken(current.accessToken);
  const next = {
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  };
  try {
    const claimed = await db.updateMany({
      where: { id: account.id, accessToken: current.accessToken },
      data: next,
    });
    if (claimed.count === 0) {
      // Lost the rotation race: re-read the winner's token.
      const winner = await db.findUnique({
        where: { id: account.id },
        select: { accessToken: true, expiresAt: true },
      });
      if (winner && winner.accessToken !== current.accessToken) {
        return winner.accessToken;
      }
    }
  } catch {
    // Conditional update unsupported (or transient DB error): fall back
    // to a plain update so the token still rotates, then return it.
    await db.update({ where: { id: account.id }, data: next });
  }
  return next.accessToken;
}

/* ------------------------------ container flow ------------------------------ */

export type InstagramContainerStatus =
  | "IN_PROGRESS"
  | "FINISHED"
  | "ERROR"
  | "EXPIRED"
  | "PUBLISHED"
  | string;

export const INSTAGRAM_STATUS_FINISHED = "FINISHED";
export const INSTAGRAM_STATUS_PUBLISHED = "PUBLISHED";
export const INSTAGRAM_STATUS_ERROR = "ERROR";
export const INSTAGRAM_STATUS_EXPIRED = "EXPIRED";

export async function createInstagramContainer(
  accessToken: string,
  igUserId: string,
  media: { kind: MediaKind; url: string; caption: string }
): Promise<string> {
  const fields: Record<string, string> = { caption: media.caption };
  if (media.kind === "IMAGE") {
    fields.image_url = media.url;
  } else {
    fields.video_url = media.url;
    fields.media_type = "REELS";
  }
  const data = await graphPost(`${igUserId}/media`, accessToken, fields);
  const containerId = String(data.id ?? "");
  if (!containerId) {
    throw new InstagramApiError("container_failed", "Instagram did not return a container id", 502);
  }
  return containerId;
}

export async function fetchInstagramContainerStatus(
  accessToken: string,
  containerId: string
): Promise<{ statusCode: InstagramContainerStatus; message?: string }> {
  const data = await graphGet(containerId, accessToken, { fields: "status_code,status" });
  return {
    statusCode: String(data.status_code ?? ""),
    message: data.status ? String(data.status) : undefined,
  };
}

export async function publishInstagramContainer(
  accessToken: string,
  igUserId: string,
  creationId: string
): Promise<string> {
  const data = await graphPost(`${igUserId}/media_publish`, accessToken, {
    creation_id: creationId,
  });
  return String(data.id ?? "");
}

export type InstagramPublishOutcome =
  | { state: "published"; externalPostId: string | null }
  | { state: "failed"; error: string }
  | { state: "processing"; containerId: string }
  | { state: "invalid"; error: string };

export type InstagramPublishDeps = {
  onContainerId: (containerId: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  now?: () => number;
};

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_BUDGET_MS = 150_000;

function validateCaption(caption: string): string | null {
  const trimmed = caption.trim();
  if (!trimmed) {
    return "Instagram posts require a caption. Add text for Instagram.";
  }
  if (Array.from(trimmed).length > 2200) {
    return "Instagram caption exceeds the 2200 character limit.";
  }
  return null;
}

/**
 * Poll the container and publish it once FINISHED. If the container is
 * already PUBLISHED/terminal, no publish call is made. Used both after
 * container creation and for resume (existing container id only).
 */
export async function monitorInstagramContainer(
  accessToken: string,
  input: { igUserId: string; containerId: string },
  deps: Pick<InstagramPublishDeps, "sleep" | "pollIntervalMs" | "pollBudgetMs" | "now"> = {}
): Promise<InstagramPublishOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollBudgetMs = deps.pollBudgetMs ?? DEFAULT_POLL_BUDGET_MS;
  const startedAt = (deps.now ?? (() => Date.now()))();
  const { igUserId, containerId } = input;

  for (;;) {
    let status: { statusCode: InstagramContainerStatus; message?: string };
    try {
      status = await fetchInstagramContainerStatus(accessToken, containerId);
    } catch (error) {
      // Transient status errors must not create a second container or a
      // second publish: keep watching, then report processing on exhaustion.
      void error;
      if ((deps.now ?? Date.now)() - startedAt + pollIntervalMs > pollBudgetMs) {
        return { state: "processing", containerId };
      }
      await sleep(pollIntervalMs);
      continue;
    }

    if (status.statusCode === INSTAGRAM_STATUS_PUBLISHED) {
      return { state: "published", externalPostId: null };
    }
    if (status.statusCode === INSTAGRAM_STATUS_FINISHED) {
      try {
        const mediaId = await publishInstagramContainer(
          accessToken,
          igUserId,
          containerId
        );
        return { state: "published", externalPostId: mediaId || null };
      } catch (error) {
        return { state: "failed", error: instagramErrorMessage(error) };
      }
    }
    if (status.statusCode === INSTAGRAM_STATUS_ERROR) {
      return {
        state: "failed",
        error: `Instagram could not process the media${status.message ? `: ${status.message}` : ". Use a JPEG photo or an MP4 video."}`,
      };
    }
    if (status.statusCode === INSTAGRAM_STATUS_EXPIRED) {
      return {
        state: "failed",
        error: "The Instagram publish window expired. Retry the post.",
      };
    }
    // IN_PROGRESS / unknown statuses: keep waiting until the budget.
    if ((deps.now ?? Date.now)() - startedAt + pollIntervalMs > pollBudgetMs) {
      return { state: "processing", containerId };
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * Full Instagram publish. If existingContainerId is provided we NEVER create
 * a second container; we only poll + publish that same container (or report
 * its terminal state) — this is the duplicate protection for resume/retry.
 */
export async function publishInstagramMedia(
  accessToken: string,
  input: {
    igUserId: string;
    kind: MediaKind;
    mediaUrl: string;
    caption: string;
    existingContainerId?: string | null;
  },
  deps: InstagramPublishDeps
): Promise<InstagramPublishOutcome> {
  let containerId = input.existingContainerId ?? null;

  if (!containerId) {
    const captionError = validateCaption(input.caption);
    if (captionError) return { state: "invalid", error: captionError };
    try {
      containerId = await createInstagramContainer(accessToken, input.igUserId, {
        kind: input.kind,
        url: input.mediaUrl,
        caption: input.caption,
      });
      // Persist IMMEDIATELY: from here on every failure path resumes against
      // this same container instead of re-creating one.
      await deps.onContainerId(containerId);
    } catch (error) {
      return { state: "failed", error: instagramErrorMessage(error) };
    }
  }

  return monitorInstagramContainer(
    accessToken,
    { igUserId: input.igUserId, containerId },
    deps
  );
}

/** Human-readable messages for known Instagram / Meta Graph error codes. */
export function instagramErrorMessage(error: unknown): string {
  if (!(error instanceof InstagramApiError)) {
    return error instanceof Error && error.message
      ? error.message
      : "Instagram publishing failed. Please try again.";
  }
  const { code, message, errorType } = error;
  if (code === "190" || errorType === "OAuthException" && /token|session/i.test(message)) {
    return "Instagram access expired or was revoked. Reconnect your Instagram account.";
  }
  if (
    code === "10" ||
    code === "200" ||
    /permission|scope/i.test(message)
  ) {
    return "Instagram rejected the request (missing permission or the account is not Business/Creator).";
  }
  if (/rate limit|too many/i.test(message) || code === "368") {
    return "Instagram's publishing limit was reached (up to 100 posts / 24h). Try again later.";
  }
  if (/publishing limit/i.test(message)) {
    return "Instagram's daily publishing limit (100 posts / 24h) was reached. Try again later.";
  }
  if (/media|url|jpeg|mp4|format|video/i.test(message)) {
    return `Instagram could not use the media: ${message}. Use a JPEG photo or an MP4 video.`;
  }
  return message || "Instagram publishing failed. Please try again.";
}

/* ------------------------------ provider class ------------------------------ */

export class InstagramProvider implements SocialProvider {
  getAuthorizeUrl(state: string): string {
    return getInstagramAuthorizeUrl(state);
  }

  async exchangeCode(
    code: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    const tokens = await exchangeInstagramCode(code);
    return {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    };
  }

  async getCurrentUser(accessToken: string): Promise<{ externalId: string; username: string }> {
    const profile = await fetchInstagramProfile(accessToken);
    return { externalId: profile.id, username: profile.username };
  }

  /** Instagram publishing goes through the container pipeline, not the generic text path. */
  async publishPost(
    _accessToken: string,
    _text: string,
    _externalId: string,
    _media?: PublishMedia
  ): Promise<PublishResult> {
    void _media;
    return { success: false, error: "Instagram publishing requires the container pipeline." };
  }

  async revokeToken(
    accessToken: string,
    externalId?: string
  ): Promise<boolean> {
    return externalId
      ? revokeInstagramToken(externalId, accessToken)
      : false;
  }
}
