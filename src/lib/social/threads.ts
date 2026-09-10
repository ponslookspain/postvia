import type { SocialProvider, PublishResult } from "./provider";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_API_BASE = "https://graph.threads.net";

const THREADS_SCOPES = ["threads_basic", "threads_content_publish"];

const POLL_DELAY_MS = envNumber("THREADS_POLL_DELAY_MS", 1500);
const POLL_MAX_ATTEMPTS = envNumber("THREADS_POLL_MAX_ATTEMPTS", 20);
const POLL_TIMEOUT_MS = envNumber("THREADS_POLL_TIMEOUT_MS", 30000);

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

async function waitForContainerReady(
  containerId: string,
  accessToken: string
): Promise<PublishResult> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastStatus = "IN_PROGRESS";

  while (attempts < POLL_MAX_ATTEMPTS && Date.now() - startedAt <= POLL_TIMEOUT_MS) {
    attempts++;
    const res = await fetch(
      `${THREADS_API_BASE}/v1.0/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return { success: false, error: formatMetaError(res.status, data) };
    }
    if (!data || typeof data !== "object") {
      return {
        success: false,
        error: `Threads API error: HTTP ${res.status} invalid container status response`,
      };
    }

    const status = (data as { status?: string }).status;
    if (status === "FINISHED") return { success: true };
    if (status === "ERROR") {
      const reason = (data as { error_message?: string }).error_message;
      return {
        success: false,
        error: `Threads API error: media container failed to process${reason ? `: ${reason}` : ""}`,
      };
    }
    if (status !== "IN_PROGRESS") {
      return {
        success: false,
        error: `Threads API error: unexpected container status ${JSON.stringify(status)}`,
      };
    }

    lastStatus = status;
    if (attempts < POLL_MAX_ATTEMPTS && Date.now() - startedAt <= POLL_TIMEOUT_MS) {
      await sleep(POLL_DELAY_MS);
    }
  }

  return {
    success: false,
    error: `Threads API error: media container not ready (last status ${JSON.stringify(
      lastStatus
    )}) after ${POLL_MAX_ATTEMPTS} attempts / ${POLL_TIMEOUT_MS}ms`,
  };
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
    externalId: string
  ): Promise<PublishResult> {
    const containerRes = await fetch(
      `${THREADS_API_BASE}/v1.0/${externalId}/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          media_type: "TEXT",
          text,
          access_token: accessToken,
        }).toString(),
      }
    );

    if (!containerRes.ok) {
      const errorData = await containerRes.json().catch(() => null);
      return { success: false, error: formatMetaError(containerRes.status, errorData) };
    }

    const container = await containerRes.json();
    if (!container?.id) {
      return {
        success: false,
        error: `Threads API error: create response missing container id (HTTP ${containerRes.status})`,
      };
    }

    const ready = await waitForContainerReady(container.id, accessToken);
    if (!ready.success) {
      return { success: false, error: ready.error };
    }

    const publishRes = await fetch(
      `${THREADS_API_BASE}/v1.0/${externalId}/threads_publish?creation_id=${container.id}&access_token=${accessToken}`,
      { method: "POST" }
    );

    if (!publishRes.ok) {
      const errorData = await publishRes.json().catch(() => null);
      return { success: false, error: formatMetaError(publishRes.status, errorData) };
    }

    const published = await publishRes.json();
    return {
      success: true,
      externalPostId: published?.id,
    };
  }

  async revokeToken(): Promise<boolean> {
    return true;
  }
}