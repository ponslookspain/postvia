import { Resend } from "resend";
import { PRODUCTION_URL } from "@/lib/base-url";
import { logErrorDiagnostic } from "@/lib/diagnostics";

// NOTE: server-only by construction — this module reads RESEND_API_KEY and is
// imported exclusively from server modules (auth config, route handlers).
// Never import it from a Client Component and never prefix its env vars with
// NEXT_PUBLIC_, otherwise the API key would ship in the client bundle.

/** Production sender identity for the verified postvia.online domain. */
export const PRODUCTION_EMAIL_FROM = "Postvia <hello@postvia.online>";

/** Reply-To for all transactional mail. Monitored inbox. */
export const PRODUCTION_REPLY_TO = "hello@postvia.online";

type EnvLike = Record<string, string | undefined>;

export function getEmailFrom(
  env: EnvLike = process.env as EnvLike
): string {
  const override = env.EMAIL_FROM?.trim();
  return override ? override : PRODUCTION_EMAIL_FROM;
}

export function getEmailReplyTo(
  env: EnvLike = process.env as EnvLike
): string {
  const override = env.EMAIL_REPLY_TO?.trim();
  return override ? override : PRODUCTION_REPLY_TO;
}

function isProductionEnv(env: EnvLike): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

function getResend(env: EnvLike): Resend | null {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderVerificationEmail(
  url: string,
  options?: { expiresInMinutes?: number }
): { html: string; text: string } {
  const minutes = options?.expiresInMinutes ?? 60;
  const safeUrl = escapeHtml(url);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:48px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="text-align:center;padding-bottom:24px;">
    <span style="font-size:24px;font-weight:600;color:#18181b;letter-spacing:-0.02em;">postvia</span>
  </td></tr>
  <tr><td style="background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#18181b;">Verify your email</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
      Click the button below to verify your email address and complete your Postvia account setup.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td align="center">
        <a href="${safeUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;padding:12px 24px;border-radius:8px;">Verify email</a>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#a1a1aa;">
      This link expires in ${minutes} minutes. If you did not create an account, you can safely ignore this email.
    </p>
  </td></tr>
  <tr><td style="text-align:center;padding-top:24px;font-size:12px;line-height:1.6;color:#a1a1aa;">
    <a href="${PRODUCTION_URL}" style="color:#71717a;text-decoration:none;">postvia.online</a>
    &nbsp;·&nbsp;
    <a href="mailto:${PRODUCTION_REPLY_TO}" style="color:#71717a;text-decoration:none;">${PRODUCTION_REPLY_TO}</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Postvia — Verify your email

Click the link below to verify your email address and complete your Postvia account setup.

${url}

This link expires in ${minutes} minutes.
If you did not create an account, you can safely ignore this email.

Postvia — ${PRODUCTION_URL}
Need help? Contact ${PRODUCTION_REPLY_TO}`;

  return { html, text };
}

export class VerificationEmailError extends Error {
  constructor(message = "Failed to send verification email") {
    super(message);
    this.name = "VerificationEmailError";
  }
}

/**
 * Missing RESEND_API_KEY. Subclass so callers can distinguish "not
 * configured" from transient send failures without message matching.
 * The local message names only the env var and file — never secrets.
 */
export class EmailNotConfiguredError extends VerificationEmailError {
  constructor(local: boolean) {
    super(
      local
        ? "Email sending is not set up locally. Add RESEND_API_KEY to .env.local and restart the dev server."
        : "Email service is not configured. Please try again later."
    );
    this.name = "EmailNotConfiguredError";
  }
}

/** True when a Resend client can be constructed (key present). */
export function isEmailConfigured(env: EnvLike = process.env as EnvLike): boolean {
  return !!env.RESEND_API_KEY;
}

/** OTP type as passed by the Better Auth emailOTP plugin. */
export type OtpType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

/**
 * Renders the 6-digit one-time code email. Same sender identity and
 * no-PII-logging discipline as the verification-link mail. The raw code is
 * only ever present in this outbound message — storage keeps a hash
 * (emailOTP `storeOTP: "hashed"`).
 */
export function renderOtpEmail(
  otp: string,
  options?: { expiresInMinutes?: number; type?: OtpType }
): { html: string; text: string } {
  const minutes = options?.expiresInMinutes ?? 10;
  const safeOtp = escapeHtml(otp);
  const heading =
    options?.type === "forget-password"
      ? "Reset your password"
      : options?.type === "sign-in"
        ? "Sign in to Postvia"
        : "Verify your email";
  const intro =
    options?.type === "forget-password"
      ? "Use the code below to reset your Postvia password."
      : options?.type === "sign-in"
        ? "Use the code below to sign in to your Postvia account."
        : "Use the code below to verify your email address and complete your Postvia account setup.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:48px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="text-align:center;padding-bottom:24px;">
    <span style="font-size:24px;font-weight:600;color:#18181b;letter-spacing:-0.02em;">postvia</span>
  </td></tr>
  <tr><td style="background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#18181b;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
      ${intro}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td align="center">
        <span style="display:inline-block;background-color:#f4f4f5;color:#18181b;font-size:32px;font-weight:700;letter-spacing:0.35em;text-indent:0.35em;text-decoration:none;padding:16px 24px;border-radius:8px;">${safeOtp}</span>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#a1a1aa;">
      This code expires in ${minutes} minutes. If you did not request it, you can safely ignore this email.
    </p>
  </td></tr>
  <tr><td style="text-align:center;padding-top:24px;font-size:12px;line-height:1.6;color:#a1a1aa;">
    <a href="${PRODUCTION_URL}" style="color:#71717a;text-decoration:none;">postvia.online</a>
    &nbsp;·&nbsp;
    <a href="mailto:${PRODUCTION_REPLY_TO}" style="color:#71717a;text-decoration:none;">${PRODUCTION_REPLY_TO}</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Postvia — ${heading}

${intro}

Your code: ${otp}

This code expires in ${minutes} minutes.
If you did not request it, you can safely ignore this email.

Postvia — ${PRODUCTION_URL}
Need help? Contact ${PRODUCTION_REPLY_TO}`;

  return { html, text };
}

export async function sendOtpEmail(
  input: { email: string; otp: string; type: OtpType },
  options?: { env?: EnvLike; client?: EmailClient; expiresInMinutes?: number }
): Promise<void> {
  const env = options?.env ?? (process.env as EnvLike);
  const resend = options?.client ?? getResend(env);
  if (!resend) {
    // OTP must never report success when nothing was sent: unlike the
    // legacy link flow (which stays dev-skip by design), a skipped OTP
    // would strand the user on /verify-otp with no code. Fail loudly in
    // every environment. Never log recipient or secret.
    logErrorDiagnostic(
      "email",
      "RESEND_API_KEY not set — refusing OTP email",
      new Error("Missing RESEND_API_KEY")
    );
    throw new EmailNotConfiguredError(!isProductionEnv(env));
  }
  const { html, text } = renderOtpEmail(input.otp, {
    expiresInMinutes: options?.expiresInMinutes ?? 10,
    type: input.type,
  });
  const subject =
    input.type === "forget-password"
      ? "Reset your password — Postvia"
      : input.type === "sign-in"
        ? "Sign in to Postvia"
        : "Verify your email — Postvia";
  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(env),
      to: input.email,
      replyTo: getEmailReplyTo(env),
      subject,
      html,
      text,
    });
    if (error) {
      logErrorDiagnostic(
        "email",
        "Resend rejected OTP email",
        new Error(error.message)
      );
      throw new VerificationEmailError();
    }
  } catch (err) {
    if (err instanceof VerificationEmailError) throw err;
    logErrorDiagnostic("email", "Failed to send OTP email", err);
    throw new VerificationEmailError();
  }
}

export type EmailClient = Pick<Resend, "emails">;

export async function sendVerificationEmail(
  user: { name?: string; email: string },
  url: string,
  options?: { env?: EnvLike; client?: EmailClient }
): Promise<void> {
  const env = options?.env ?? (process.env as EnvLike);
  const resend = options?.client ?? getResend(env);
  if (!resend) {
    // Never log the recipient address (PII) or the verification URL (secret):
    // the missing-key fact is enough.
    logErrorDiagnostic(
      "email",
      "RESEND_API_KEY not set — skipping verification email",
      new Error("Missing RESEND_API_KEY")
    );
    if (isProductionEnv(env)) {
      // In production a silent skip would look like a successful signup while
      // the user can never verify. Fail loudly so the error surfaces.
      throw new VerificationEmailError(
        "Email service is not configured. Please try again later."
      );
    }
    return;
  }
  const { html, text } = renderVerificationEmail(url);
  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(env),
      to: user.email,
      replyTo: getEmailReplyTo(env),
      subject: "Verify your email — Postvia",
      html,
      text,
    });
    if (error) {
      // Resend resolves (does not throw) on API errors. Never attach the
      // recipient, the URL, or the key — only the provider's error summary.
      logErrorDiagnostic(
        "email",
        "Resend rejected verification email",
        new Error(error.message)
      );
      throw new VerificationEmailError();
    }
  } catch (err) {
    if (err instanceof VerificationEmailError) throw err;
    // Transport failure (network, timeout, invalid key at send time).
    // Keep the verification URL and recipient PII out of the logs.
    logErrorDiagnostic("email", "Failed to send verification email", err);
    throw new VerificationEmailError();
  }
}
