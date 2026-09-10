import type { SocialProvider, PublishResult } from "./provider";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_API_BASE = "https://graph.threads.net";

const THREADS_SCOPES = ["threads_basic", "threads_content_publish"];

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
      let errorMessage = `Threads API error: ${containerRes.status}`;
      try {
        const errorData = await containerRes.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // Use default error message
      }
      return { success: false, error: errorMessage };
    }

    const container = await containerRes.json();

    const publishRes = await fetch(
      `${THREADS_API_BASE}/v1.0/${externalId}/threads_publish?creation_id=${container.id}&access_token=${accessToken}`,
      { method: "POST" }
    );

    if (!publishRes.ok) {
      let errorMessage = `Threads API error: ${publishRes.status}`;
      try {
        const errorData = await publishRes.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // Use default error message
      }
      return { success: false, error: errorMessage };
    }

    const published = await publishRes.json();
    return {
      success: true,
      externalPostId: published.id,
    };
  }

  async revokeToken(): Promise<boolean> {
    return true;
  }
}