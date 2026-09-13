/**
 * Shared OTP policy for the Mobbin-style email-code flow.
 *
 * Dependency-free by design: imported by both `src/lib/auth.ts` (Better Auth
 * emailOTP plugin options) and `src/lib/otp.ts` (request orchestration,
 * email rendering, tests). Never import server modules here.
 */

/** 6-digit numeric code lifetime. */
export const OTP_EXPIRES_SECONDS = 600;
export const OTP_EXPIRES_MINUTES = 10;

/** Code length (numeric 0-9, crypto-random via Better Auth default). */
export const OTP_LENGTH = 6;

/** Wrong-code attempts before the code is invalidated (plugin-enforced). */
export const OTP_MAX_ATTEMPTS = 5;

/** Max OTP sends per email-hash per hour (AbuseRateBucket, persistent). */
export const OTP_SEND_MAX_PER_HOUR = 5;

/** Min seconds between two sends to the same email-hash (cooldown bucket). */
export const OTP_SEND_COOLDOWN_SECONDS = 60;

/** Max verify attempts per email-hash per 10 minutes (outer rate shell). */
export const OTP_VERIFY_MAX_PER_WINDOW = 20;
export const OTP_VERIFY_WINDOW_MS = 10 * 60_000;
