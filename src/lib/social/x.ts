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
  return error instanceof Error && error.message
    ? error.message
    : "X publishing failed. Please try again.";
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
