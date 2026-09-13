import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  OTP_EXPIRES_MINUTES,
  OTP_EXPIRES_SECONDS,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_SEND_COOLDOWN_SECONDS,
  OTP_SEND_MAX_PER_HOUR,
  OTP_VERIFY_MAX_PER_WINDOW,
  OTP_VERIFY_WINDOW_MS,
} from "../src/lib/otp-config";
import {
  isValidOtpEmail,
  normalizeOtpEmail,
  otpModeToSendType,
  planHintToDb,
} from "../src/lib/otp";
import { renderOtpEmail } from "../src/lib/email";
import { toOnboardingState } from "../src/lib/onboarding";

describe("OTP policy constants", () => {
  test("10-minute expiry, 6 digits, 5 attempts", () => {
    assert.equal(OTP_EXPIRES_SECONDS, 600);
    assert.equal(OTP_EXPIRES_MINUTES, 10);
    assert.equal(OTP_LENGTH, 6);
    assert.equal(OTP_MAX_ATTEMPTS, 5);
  });

  test("send caps: 5/hour with a 60s cooldown", () => {
    assert.equal(OTP_SEND_MAX_PER_HOUR, 5);
    assert.equal(OTP_SEND_COOLDOWN_SECONDS, 60);
  });

  test("verify outer shell: 20 attempts per 10 minutes", () => {
    assert.equal(OTP_VERIFY_MAX_PER_WINDOW, 20);
    assert.equal(OTP_VERIFY_WINDOW_MS, 10 * 60_000);
  });
});

describe("OTP email helpers", () => {
  test("normalizes case and whitespace", () => {
    assert.equal(normalizeOtpEmail("  User@Example.COM "), "user@example.com");
    assert.equal(normalizeOtpEmail(null), "");
    assert.equal(normalizeOtpEmail(42), "");
  });

  test("accepts valid emails, rejects garbage and overlong input", () => {
    assert.equal(isValidOtpEmail("a@b.co"), true);
    assert.equal(isValidOtpEmail("not-an-email"), false);
    assert.equal(isValidOtpEmail("a@b"), false);
    assert.equal(isValidOtpEmail(`a@${"b".repeat(250)}.co`), false);
  });

  test("signup uses email-verification, login uses sign-in (never swapped)", () => {
    assert.equal(otpModeToSendType("signup"), "email-verification");
    assert.equal(otpModeToSendType("login"), "sign-in");
  });

  test("plan hint maps to DB enum, unknown hints record nothing", () => {
    assert.equal(planHintToDb("growth"), "GROWTH");
    assert.equal(planHintToDb("scale"), "SCALE");
    assert.equal(planHintToDb("free"), "FREE");
    assert.equal(planHintToDb("starter"), undefined);
    assert.equal(planHintToDb("../../../etc"), undefined);
    assert.equal(planHintToDb(null), undefined);
    assert.equal(planHintToDb(undefined), undefined);
  });
});

describe("OTP email template", () => {
  test("renders the code, expiry and no link", () => {
    const { html, text } = renderOtpEmail("123456");
    assert.ok(html.includes("123456"));
    assert.ok(html.includes("expires in 10 minutes"));
    assert.ok(html.includes("postvia"));
    assert.ok(!html.includes("Verify email</a>"));
    assert.ok(text.includes("123456"));
    assert.ok(text.includes("10 minutes"));
  });

  test("custom expiry is reflected", () => {
    const { html } = renderOtpEmail("654321", { expiresInMinutes: 5 });
    assert.ok(html.includes("5 minutes"));
  });

  test("code is HTML-escaped (no markup injection via OTP)", () => {
    const { html } = renderOtpEmail("<script>alert(1)</script>");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  test("headings differ per purpose", () => {
    assert.ok(renderOtpEmail("111111", { type: "sign-in" }).html.includes("Sign in to Postvia"));
    assert.ok(
      renderOtpEmail("111111", { type: "forget-password" }).html.includes("Reset your password")
    );
    assert.ok(
      renderOtpEmail("111111", { type: "email-verification" }).html.includes("Verify your email")
    );
  });
});

describe("onboarding state machine", () => {
  test("completed stays completed regardless of name", () => {
    assert.equal(toOnboardingState(true, true), "COMPLETED");
    assert.equal(toOnboardingState(true, false), "COMPLETED");
  });

  test("incomplete without name is NOT_STARTED, with name IN_PROGRESS", () => {
    assert.equal(toOnboardingState(false, false), "NOT_STARTED");
    assert.equal(toOnboardingState(false, true), "IN_PROGRESS");
  });
});
