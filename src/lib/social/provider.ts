export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  error?: string;
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
    imageUrl?: string
  ): Promise<PublishResult>;
  revokeToken(accessToken: string): Promise<boolean>;
}
