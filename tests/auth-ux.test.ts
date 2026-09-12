import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderVerificationEmail } from "../src/lib/email";
import { checkRateLimit, resetRateLimit } from "../src/lib/rate-limit";
import {
  passwordErrorMessage,
  validatePassword,
} from "../src/app/api/settings/password/route";
import { PRODUCTION_URL, resolveBaseURL } from "../src/lib/base-url";

process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-123";

describe("verification email template", () => {
  test("renders HTML with branding, button, and expiry notice", () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";
    const { html } = renderVerificationEmail(url);

    assert.ok(html.includes("postvia"));
    assert.ok(html.includes("Verify your email"));
    assert.ok(html.includes(url));
    assert.ok(html.includes("expires in 60 minutes"));
    assert.ok(html.includes("href=\"http://localhost:3000/api/auth/verify-email?token=abc\""));
  });

  test("renders plain text fallback with the URL", () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";
    const { text } = renderVerificationEmail(url);

    assert.ok(text.includes("Postvia"));
    assert.ok(text.includes(url));
    assert.ok(text.includes("60 minutes"));
  });

  test("custom expiry is reflected in the output", () => {
    const { html, text } = renderVerificationEmail("http://localhost/verify", {
      expiresInMinutes: 30,
    });
    assert.ok(html.includes("30 minutes"));
    assert.ok(text.includes("30 minutes"));
  });

  test("escapes HTML in the verification URL", () => {
    const { html } = renderVerificationEmail("http://localhost/x?a=<script>");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  test("preserves the token and callbackURL together when rendering a full Better Auth URL", () => {
    const url =
      "https://postvia.online/api/auth/verify-email?token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signaturePayload&callbackURL=%2Fverify-email";
    const { html, text } = renderVerificationEmail(url);

    const decodedHref = html
      .match(/<a href="([^"]+)"/)![1]
      .replace(/&amp;/g, "&");

    assert.equal(decodedHref, url);
    assert.ok(decodedHref.includes("token="));
    assert.ok(decodedHref.includes("callbackURL=%2Fverify-email"));
    assert.ok(text.includes(url));
    assert.ok(text.includes("token="));
    assert.ok(text.includes("callbackURL=%2Fverify-email"));
  });
});

describe("resend rate limiting", () => {
  test("allows requests under the limit", () => {
    resetRateLimit();
    for (let i = 0; i < 3; i++) {
      assert.equal(checkRateLimit("resend:user@example.com"), true);
    }
  });

  test("blocks requests over the limit within the window", () => {
    resetRateLimit();
    for (let i = 0; i < 3; i++) checkRateLimit("resend:user@example.com");
    assert.equal(checkRateLimit("resend:user@example.com"), false);
  });

  test("keys are isolated per email", () => {
    resetRateLimit();
    for (let i = 0; i < 5; i++) checkRateLimit("resend:a@example.com");
    assert.equal(checkRateLimit("resend:b@example.com"), true);
  });

  test("resets after the window elapses", () => {
    resetRateLimit();
    for (let i = 0; i < 3; i++) checkRateLimit("resend:c@example.com");
    assert.equal(checkRateLimit("resend:c@example.com"), false);
    // Simulate expiration by clearing the store.
    resetRateLimit("resend:c@example.com");
    assert.equal(checkRateLimit("resend:c@example.com"), true);
  });
});

describe("password validation", () => {
  test("rejects passwords shorter than 8 characters", () => {
    const msg = validatePassword("short1");
    assert.ok(msg!.includes("at least 8"));
  });

  test("rejects passwords longer than 128 characters", () => {
    const msg = validatePassword("x".repeat(129));
    assert.ok(msg!.includes("128 characters"));
  });

  test("accepts a valid password", () => {
    assert.equal(validatePassword("a-valid-password-123"), null);
  });
});

describe("password error messages", () => {
  test("change mode: invalid password", () => {
    const msg = passwordErrorMessage(
      { statusCode: 400, code: "INVALID_PASSWORD" },
      "change"
    );
    assert.equal(msg, "Current password is incorrect");
  });

  test("change mode: too short", () => {
    const msg = passwordErrorMessage(
      { statusCode: 400, code: "PASSWORD_TOO_SHORT" },
      "change"
    );
    assert.ok(msg!.includes("at least 8"));
  });

  test("set mode: password already set", () => {
    const msg = passwordErrorMessage(
      { statusCode: 400, code: "PASSWORD_ALREADY_SET" },
      "set"
    );
    assert.ok(msg!.includes("already set"));
  });

  test("set mode: generic fallback", () => {
    const msg = passwordErrorMessage(
      { statusCode: 400, code: "UNKNOWN" },
      "set"
    );
    assert.equal(msg, "Unable to set password");
  });

  test("non-client errors return null", () => {
    assert.equal(passwordErrorMessage({ statusCode: 500 }, "change"), null);
    assert.equal(passwordErrorMessage({}, "change"), null);
  });
});

describe("Better Auth base URL resolution", () => {
  test("explicit BETTER_AUTH_URL always wins", () => {
    assert.equal(
      resolveBaseURL({
        BETTER_AUTH_URL: "https://custom.example.com",
        VERCEL_ENV: "production",
        VERCEL_URL: "postvia-abc123-postvia.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "postvia.online",
      }),
      "https://custom.example.com"
    );
  });

  test("production resolves to the deterministic production domain (guards Google redirect_uri_mismatch)", () => {
    assert.equal(
      resolveBaseURL({ VERCEL_ENV: "production", VERCEL_URL: "deploy-a4wvan4ds-postvia.vercel.app" }),
      "https://postvia.online"
    );
  });

  test("production prefers VERCEL_PROJECT_PRODUCTION_URL when available", () => {
    assert.equal(
      resolveBaseURL({
        VERCEL_ENV: "production",
        VERCEL_URL: "deploy-a4wvan4ds-postvia.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "postvia.online",
      }),
      "https://postvia.online"
    );
  });

  test("preview deployments keep their deployment-specific host", () => {
    assert.equal(
      resolveBaseURL({ VERCEL_URL: "postvia-pr-42-postvia.vercel.app" }),
      "https://postvia-pr-42-postvia.vercel.app"
    );
  });

  test("returns undefined when no Vercel or explicit URL is present", () => {
    assert.equal(resolveBaseURL({}), undefined);
  });

  test("Google OAuth redirect URI for production matches the registered domain", () => {
    const base = resolveBaseURL({ VERCEL_ENV: "production" })!;
    assert.equal(base, PRODUCTION_URL);
    assert.equal(
      `${base}/api/auth/callback/google`,
      "https://postvia.online/api/auth/callback/google"
    );
  });
});