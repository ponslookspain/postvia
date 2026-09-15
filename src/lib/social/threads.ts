import { logDiagnostic, logErrorDiagnostic } from "@/lib/diagnostics";
import { prisma } from "@/lib/prisma";
import type { PublishMedia, PublishResult, SocialProvider } from "./provider";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_API_BASE = "https://graph.threads.net";

const THREADS_SCOPES = ["threads_basic", "threads_content_publish"];

const POLL_DELAY_MS = envNumber("THREADS_POLL_DELAY_MS", 1500);
const POLL_MAX_ATTEMPTS = envNumber("THREADS_POLL_MAX_ATTEMPTS", 20);
const POLL_TIMEOUT_MS = envNumber("THREADS_POLL_TIMEOUT_MS", 30000);

// Video containers download + transcode server-side and can stay
// IN_PROGRESS for minutes; Meta recommends polling up to ~5 minutes.
const VIDEO_POLL_DELAY_MS = envNumber("THREADS_VIDEO_POLL_DELAY_MS", 5000);
const VIDEO_POLL_MAX_ATTEMPTS = envNumber("THREADS_VIDEO_POLL_MAX_ATTEMPTS", 60);
const VIDEO_POLL_TIMEOUT_MS = envNumber("THREADS_VIDEO_POLL_TIMEOUT_MS", 240000);

export const THREADS_PUBLISH_IMAGE_TTL_MS = 5 * 60 * 1000;
// Meta fetches video_url asynchronously while the container processes,
// so the signed private-Blob URL must outlive the whole polling window.
export const THREADS_PUBLISH_VIDEO_TTL_MS = 30 * 60 * 1000;

type PollBudget = {
  delayMs: number;
  maxAttempts: number;
  timeoutMs: number;
};

const IMAGE_POLL_BUDGET: PollBudget = {
  delayMs: POLL_DELAY_MS,
  maxAttempts: POLL_MAX_ATTEMPTS,
  timeoutMs: POLL_TIMEOUT_MS,
};

const VIDEO_POLL_BUDGET: PollBudget = {
  delayMs: VIDEO_POLL_DELAY_MS,
  maxAttempts: VIDEO_POLL_MAX_ATTEMPTS,
  timeoutMs: VIDEO_POLL_TIMEOUT_MS,
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMetaError(status: number, body: unknown): string {
  const err = (body as {
    error?: {
      code?: number;
      error_subcode?: number;
      fbtrace_id?: string;
      message?: string;
    };
  })?.error;
  const parts = [`Threads API error: HTTP ${status}`];
  if (!err) return `${parts.join(" ")} (no error body)`;
  if (err.code !== undefined) parts.push(`code=${err.code}`);
  if (err.error_subcode !== undefined) parts.push(`subcode=${err.error_subcode}`);
  if (err.fbtrace_id) parts.push(`fbtrace_id=${err.fbtrace_id}`);
  if (err.message) parts.push(err.message);
  return parts.join(" ");
}

function logMetaError(scope: string, status: number, body: unknown): void {
  const err = (body as {
    error?: {
      code?: number;
      error_subcode?: number;
      fbtrace_id?: string;
      message?: string;
    };
  })?.error;
  logErrorDiagnostic("threads", `${scope} failed`, new Error(err?.message ?? "Meta error"), {
    status,
    code: err?.code,
    subcode: err?.error_subcode,
    fbtrace_id: err?.fbtrace_id,
  });
}

export class ThreadsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

function threadsAuthSignal(status: number, code: string, message: string): boolean {
  if (status === 401 || status === 403) return true;
  if (code === "190") return true;
  return (
    /http 40[13]\b/i.test(message) ||
    /invalid.*token|token.*invalid|token.*expired|session.*expired|revoked/i.test(
      message
    )
  );
}

/**
 * True only for terminal auth failures (expired/revoked token). Used by
 * stale recovery so transient provider/rate-limit/5xx failures stay
 * resumable instead of failing the target and dropping the container.
 */
export function isThreadsAuthError(error: unknown): boolean {
  if (!(error instanceof ThreadsApiError)) return false;
  return threadsAuthSignal(error.httpStatus, error.code, error.message);
}

/**
 * Human-readable mapping. Auth/token failures always mean the user must
 * reconnect; every other error keeps the raw Meta diagnostic so support
 * retains code/subcode/fbtrace_id.
 */
export function threadsErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Threads publishing failed. Please try again.";
  const status = error instanceof ThreadsApiError ? error.httpStatus : 0;
  const code = error instanceof ThreadsApiError ? error.code : "";
  if (threadsAuthSignal(status, code, message)) {
    return "Threads access expired or was revoked. Reconnect your Threads account.";
  }
  return message;
}

function timeoutError(budget: PollBudget, lastStatus: string): string {
  return `Threads API error: media container not ready (last status ${JSON.stringify(
    lastStatus
  )}) after ${budget.maxAttempts} attempts / ${budget.timeoutMs}ms`;
}

function threadsErrorCode(data: unknown, httpStatus: number): string {
  const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
  return code !== undefined && code !== null ? String(code) : `http_${httpStatus}`;
}

/**
 * Create a media container. Throws ThreadsApiError (never returns a
 * half-state) so the caller persists the id exactly once, immediately.
 */
export async function createThreadsContainer(
  accessToken: string,
  threadsUserId: string,
  text: string,
  media?: PublishMedia
): Promise<string> {
  const containerParams: Record<string, string> = {
    text,
    access_token: accessToken,
  };
  if (media?.kind === "IMAGE") {
    containerParams.media_type = "IMAGE";
    containerParams.image_url = media.url;
  } else if (media?.kind === "VIDEO") {
    containerParams.media_type = "VIDEO";
    containerParams.video_url = media.url;
  } else {
    containerParams.media_type = "TEXT";
  }

  const containerRes = await fetch(
    `${THREADS_API_BASE}/v1.0/${threadsUserId}/threads`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(containerParams).toString(),
    }
  );

  const errorData = containerRes.ok
    ? null
    : await containerRes.json().catch(() => null);
  if (!containerRes.ok) {
    logMetaError("container create", containerRes.status, errorData);
    throw new ThreadsApiError(
      threadsErrorCode(errorData, containerRes.status),
      formatMetaError(containerRes.status, errorData),
      containerRes.status
    );
  }

  const container = await containerRes.json();
  if (!container?.id) {
    throw new ThreadsApiError(
      "container_failed",
      `Threads API error: create response missing container id (HTTP ${containerRes.status})`,
      containerRes.status
    );
  }
  return String(container.id);
}

export type ThreadsContainerStatus = {
  status: string;
  errorMessage?: string;
};

/** Single status read. Throws ThreadsApiError on transport/API failure. */
export async function fetchThreadsContainerStatus(
  accessToken: string,
  containerId: string
): Promise<ThreadsContainerStatus> {
  const res = await fetch(
    `${THREADS_API_BASE}/v1.0/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(
      accessToken
    )}`
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    logMetaError("container poll", res.status, data);
    throw new ThreadsApiError(
      threadsErrorCode(data, res.status),
      formatMetaError(res.status, data),
      res.status
    );
  }
  if (!data || typeof data !== "object") {
    throw new ThreadsApiError(
      `http_${res.status}`,
      `Threads API error: HTTP ${res.status} invalid container status response`,
      res.status
    );
  }
  const status = String((data as { status?: unknown }).status ?? "");
  const errorMessage = (data as { error_message?: unknown }).error_message;
  return {
    status,
    errorMessage: typeof errorMessage === "string" ? errorMessage : undefined,
  };
}

/** Publish a READY container. Throws ThreadsApiError on failure. */
export async function publishThreadsContainer(
  accessToken: string,
  threadsUserId: string,
  containerId: string
): Promise<string | null> {
  const publishRes = await fetch(
    `${THREADS_API_BASE}/v1.0/${threadsUserId}/threads_publish?creation_id=${containerId}&access_token=${accessToken}`,
    { method: "POST" }
  );
  const errorData = publishRes.ok
    ? null
    : await publishRes.json().catch(() => null);
  if (!publishRes.ok) {
    logMetaError("threads_publish", publishRes.status, errorData);
    throw new ThreadsApiError(
      threadsErrorCode(errorData, publishRes.status),
      formatMetaError(publishRes.status, errorData),
      publishRes.status
    );
  }
  const published = await publishRes.json();
  logDiagnostic("threads", "published", {
    status: "PUBLISHED",
    errorMessage: null,
  });
  const id = (published as { id?: unknown } | null)?.id;
  return id === undefined || id === null ? null : String(id);
}

export type ThreadsContainerOutcome =
  | { state: "published"; externalPostId: string | null }
  | { state: "failed"; error: string }
  | { state: "processing"; containerId: string; detail: string };

export type ThreadsContainerDeps = {
  onContainerId: (containerId: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  maxAttempts?: number;
  now?: () => number;
};

function resolveThreadsPollBudget(
  video: boolean,
  deps: Pick<ThreadsContainerDeps, "pollIntervalMs" | "pollBudgetMs" | "maxAttempts">
): PollBudget {
  const fallback = video ? VIDEO_POLL_BUDGET : IMAGE_POLL_BUDGET;
  return {
    delayMs: deps.pollIntervalMs ?? fallback.delayMs,
    maxAttempts: deps.maxAttempts ?? fallback.maxAttempts,
    timeoutMs: deps.pollBudgetMs ?? fallback.timeoutMs,
  };
}

/**
 * Poll a container and publish it once FINISHED. Transient status-fetch
 * errors keep polling until the budget runs out (reported as processing,
 * never as failure) so a network blip can never trigger a second
 * container or a second publish call.
 */
export async function monitorThreadsContainer(
  accessToken: string,
  input: { threadsUserId: string; containerId: string; video: boolean },
  deps: Omit<ThreadsContainerDeps, "onContainerId"> = {}
): Promise<ThreadsContainerOutcome> {
  const budget = resolveThreadsPollBudget(input.video, deps);
  const sleepFn = deps.sleep ?? sleep;
  const now = deps.now ?? Date.now;
  const startedAt = now();
  let attempts = 0;
  let lastStatus = "IN_PROGRESS";

  for (;;) {
    if (attempts >= budget.maxAttempts || now() - startedAt > budget.timeoutMs) {
      return {
        state: "processing",
        containerId: input.containerId,
        detail: timeoutError(budget, lastStatus),
      };
    }
    attempts++;

    let status: ThreadsContainerStatus | null = null;
    try {
      status = await fetchThreadsContainerStatus(accessToken, input.containerId);
    } catch {
      // Transient transport/API failure: keep polling until the budget
      // runs out (reported as processing, never as failure) so a network
      // blip can never trigger a second container or a second publish.
      status = null;
    }
    if (status === null) {
      if (attempts < budget.maxAttempts && now() - startedAt <= budget.timeoutMs) {
        await sleepFn(budget.delayMs);
      }
      continue;
    }

    lastStatus = status.status;
    if (status.status === "FINISHED") {
      logDiagnostic("threads", "container finished", { status: "FINISHED" });
      try {
        const externalPostId = await publishThreadsContainer(
          accessToken,
          input.threadsUserId,
          input.containerId
        );
        return { state: "published", externalPostId };
      } catch (error) {
        return { state: "failed", error: threadsErrorMessage(error) };
      }
    }
    if (status.status === "ERROR") {
      return {
        state: "failed",
        error: `Threads API error: media container failed to process${status.errorMessage ? `: ${status.errorMessage}` : ""}`,
      };
    }
    if (status.status === "EXPIRED") {
      return {
        state: "failed",
        error:
          "Threads API error: media container expired before publishing. Please try publishing again.",
      };
    }
    if (status.status !== "IN_PROGRESS") {
      return {
        state: "failed",
        error: `Threads API error: unexpected container status ${JSON.stringify(status.status)}`,
      };
    }
    if (attempts < budget.maxAttempts && now() - startedAt <= budget.timeoutMs) {
      await sleepFn(budget.delayMs);
    }
  }
}

/**
 * Full Threads publish. If existingContainerId is provided we NEVER create
 * a second container; we only poll + publish that same container (or report
 * its terminal state) — this is the duplicate protection for resume/retry.
 */
export async function publishThreadsMedia(
  accessToken: string,
  input: {
    threadsUserId: string;
    text: string;
    media?: PublishMedia;
    existingContainerId?: string | null;
  },
  deps: ThreadsContainerDeps
): Promise<ThreadsContainerOutcome> {
  let containerId = input.existingContainerId ?? null;

  if (!containerId) {
    try {
      containerId = await createThreadsContainer(
        accessToken,
        input.threadsUserId,
        input.text,
        input.media
      );
      // Persist IMMEDIATELY: from here on every failure path resumes against
      // this same container instead of re-creating one.
      await deps.onContainerId(containerId);
    } catch (error) {
      return { state: "failed", error: threadsErrorMessage(error) };
    }
  }

  return monitorThreadsContainer(
    accessToken,
    {
      threadsUserId: input.threadsUserId,
      containerId,
      video: input.media?.kind === "VIDEO",
    },
    deps
  );
}

const THREADS_REFRESH_URL = "https://graph.threads.net/refresh_access_token";

/**
 * Rotate a long-lived Threads token (server-side only). Unlike X/TikTok
 * the access token itself is the refresh credential
 * (`th_refresh_token` grant); there is no separate refresh token.
 */
export async function refreshThreadsToken(accessToken: string): Promise<{
  accessToken: string;
  expiresAt?: Date;
}> {
  const res = await fetch(
    `${THREADS_REFRESH_URL}?grant_type=th_refresh_token&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ThreadsApiError(
      res.status === 400 || res.status === 401 || res.status === 403
        ? "invalid_grant"
        : `http_${res.status}`,
      `Threads token refresh failed: HTTP ${res.status}${body ? ` ${body}` : ""}`,
      res.status
    );
  }
  const data = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (!data || typeof data.access_token !== "string" || !data.access_token) {
    throw new ThreadsApiError(
      "token_refresh_failed",
      "Threads did not return a new access token",
      502
    );
  }
  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === "number" &&
      Number.isFinite(data.expires_in) &&
      data.expires_in > 0
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
  };
}

type ThreadsTokenStore = {
  findUnique: (args: {
    where: { id: string };
    select: { accessToken: boolean; expiresAt: boolean };
  }) => Promise<{
    accessToken: string;
    expiresAt: Date | null;
  } | null>;
  updateMany: (args: {
    where: { id: string; accessToken: string };
    data: { accessToken: string; expiresAt?: Date };
  }) => Promise<{ count: number }>;
  update: (args: {
    where: { id: string };
    data: { accessToken: string; expiresAt?: Date };
  }) => Promise<unknown>;
};

/**
 * Returns a fresh access token for a stored Threads account, refreshing
 * and persisting the rotated token when close to expiry. Never logs
 * secrets.
 *
 * Race-safe (same contract as X/TikTok/Instagram): the stored row is
 * re-read first so a concurrent worker's rotation is reused, and the
 * rotated token is persisted with a conditional update keyed on the
 * previously seen access token — the loser re-reads the winner instead
 * of overwriting fresh tokens.
 */
export async function ensureFreshThreadsToken(
  account: {
    id: string;
    accessToken: string;
    expiresAt: Date | null;
  },
  store?: ThreadsTokenStore
): Promise<string> {
  const db: ThreadsTokenStore = store ?? prisma.socialAccount;
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
  const tokens = await refreshThreadsToken(current.accessToken);
  const next: { accessToken: string; expiresAt?: Date } = {
    accessToken: tokens.accessToken,
    ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}),
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

function getAppId(): string {
  const id = process.env.THREADS_APP_ID;
  if (!id) throw new Error("THREADS_APP_ID is not configured");
  return id;
}

function getAppSecret(): string {
  const secret = process.env.THREADS_APP_SECRET;
  if (!secret) throw new Error("THREADS_APP_SECRET is not configured");
  return secret;
}

function getRedirectUri(): string {
  return process.env.THREADS_REDIRECT_URI || "http://localhost:3000/api/auth/threads/callback";
}

export class ThreadsProvider implements SocialProvider {
  getAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: getAppId(),
      redirect_uri: getRedirectUri(),
      response_type: "code",
      scope: THREADS_SCOPES.join(","),
      state,
    });
    return `${THREADS_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(
    code: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    const res = await fetch(THREADS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: getAppId(),
        client_secret: getAppSecret(),
        grant_type: "authorization_code",
        redirect_uri: getRedirectUri(),
        code,
      }).toString(),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Threads token exchange failed: ${res.status} ${error}`);
    }

    const data = await res.json();

    const longLivedRes = await fetch(
      `${THREADS_API_BASE}/access_token?grant_type=th_exchange_token&client_secret=${getAppSecret()}&access_token=${data.access_token}`
    );

    if (!longLivedRes.ok) {
      const error = await longLivedRes.text();
      throw new Error(
        `Threads long-lived token exchange failed: ${longLivedRes.status} ${error}`
      );
    }

    const longLivedData = await longLivedRes.json();

    return {
      accessToken: longLivedData.access_token,
      expiresAt: longLivedData.expires_in
        ? new Date(Date.now() + longLivedData.expires_in * 1000)
        : undefined,
    };
  }

  async getCurrentUser(
    accessToken: string
  ): Promise<{ externalId: string; username: string }> {
    const res = await fetch(
      `${THREADS_API_BASE}/v1.0/me?fields=id,username&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error(`Failed to get Threads user info: ${res.status}`);
    }

    const data = await res.json();
    return {
      externalId: data.id,
      username: data.username,
    };
  }

  async publishPost(
    accessToken: string,
    text: string,
    externalId: string,
    media?: PublishMedia
  ): Promise<PublishResult> {
    const outcome = await publishThreadsMedia(
      accessToken,
      { threadsUserId: externalId, text, media },
      { onContainerId: async () => {} }
    );
    switch (outcome.state) {
      case "published":
        logDiagnostic("threads", "published", {
          status: "PUBLISHED",
          mediaType: media?.kind ?? "TEXT",
          errorMessage: null,
        });
        return {
          success: true,
          externalPostId: outcome.externalPostId ?? undefined,
        };
      case "failed":
        return { success: false, error: outcome.error };
      case "processing":
        return { success: false, error: outcome.detail };
    }
  }

  async revokeToken(_accessToken?: string): Promise<boolean> {
    // The Threads API exposes no token revocation endpoint: a Threads
    // connection ends when the user removes the app in their Threads
    // settings. Disconnect in Postvia is therefore local-only (row delete
    // + abuse tombstone, see /api/accounts/threads). Return false so no
    // caller mistakes this best-effort no-op for a confirmed remote
    // revoke — local disconnect always proceeds regardless.
    void _accessToken;
    return false;
  }
}