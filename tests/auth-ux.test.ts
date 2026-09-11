import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderVerificationEmail } from "../src/lib/email";
import { checkRateLimit, resetRateLimit } from "../src/lib/rate-limit";
import {
  passwordErrorMessage,
  validatePassword,
} from "../src/app/api/settings/password/route";

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