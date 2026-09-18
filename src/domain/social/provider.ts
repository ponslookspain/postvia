import type { MediaKind } from "../media/policy";

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  error?: string;
}

/**
 * A media attachment resolved to a URL the platform can fetch
 * (for Threads this is a short-lived signed URL into the PRIVATE
 * Vercel Blob store, scoped to exactly one blob pathname).
 */
export interface PublishMedia {
  url: string;
  kind: MediaKind;
}

export interface SocialProvider {
  getAuthorizeUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }>;
  getCurrentUser(accessToken: string): Promise<{
    externalId: string;
    username: string;
  }>;
  publishPost(
    accessToken: string,
    text: string,
    externalId: string,
    media?: PublishMedia
  ): Promise<PublishResult>;
  revokeToken(accessToken: string): Promise<boolean>;
}
