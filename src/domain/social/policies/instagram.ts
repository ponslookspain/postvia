/**
 * Instagram platform policies (domain).
 *
 * Pure error classification and caption validation. No OAuth, no token
 * refresh, no Prisma, no fetch, no environment access — deterministic over
 * inputs. The Instagram API client, container pipeline and polling stay in
 * `src/lib/social/instagram.ts`, which re-exports this module for
 * compatibility.
 *
 * DOMAIN RULE: import nothing except standard primitives and domain types.
 * Never Prisma, Stripe SDK, React, process.env, fetch, Blob SDK, Sentry,
 * diagnostics, `src/lib/*` or `src/app/*`.
 */

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

/**
 * Terminal Meta auth code extracted from the error mapper below.
 * Only "190" (Meta OAuth token error) unconditionally means the user must
 * reconnect; the OAuthException + token/session-message branch stays in
 * `instagramErrorMessage` where the message is available.
 */
export function isInstagramAuthErrorCode(code: string): boolean {
  return code === "190";
}

/** Human-readable messages for known Instagram / Meta Graph error codes. */
export function instagramErrorMessage(error: unknown): string {
  if (!(error instanceof InstagramApiError)) {
    return error instanceof Error && error.message
      ? error.message
      : "Instagram publishing failed. Please try again.";
  }
  const { code, message, errorType } = error;
  if (isInstagramAuthErrorCode(code) || errorType === "OAuthException" && /token|session/i.test(message)) {
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

/** Instagram caption gate: required text, at most 2200 code points. */
export function resolveInstagramCaption(caption: string): string | null {
  const trimmed = caption.trim();
  if (!trimmed) {
    return "Instagram posts require a caption. Add text for Instagram.";
  }
  if (Array.from(trimmed).length > 2200) {
    return "Instagram caption exceeds the 2200 character limit.";
  }
  return null;
}
