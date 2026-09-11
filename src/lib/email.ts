import { Resend } from "resend";

const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Postvia <onboarding@resend.dev>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
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
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Postvia — Verify your email

Click the link below to verify your email address and complete your Postvia account setup.

${url}

This link expires in ${minutes} minutes.
If you did not create an account, you can safely ignore this email.`;

  return { html, text };
}

export async function sendVerificationEmail(
  user: { name?: string; email: string },
  url: string
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY not set — skipping verification email to",
      user.email
    );
    return;
  }
  const { html, text } = renderVerificationEmail(url);
  await resend.emails.send({
    from: EMAIL_FROM,
    to: user.email,
    subject: "Verify your email — Postvia",
    html,
    text,
  });
}
