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
    const res = await fetch(`${X_API_BASE}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
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
