import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EmailClient,
  EmailNotConfiguredError,
  PRODUCTION_EMAIL_FROM,
  PRODUCTION_REPLY_TO,
  VerificationEmailError,
  getEmailFrom,
  getEmailReplyTo,
  isEmailConfigured,
  renderVerificationEmail,
  sendOtpEmail,
  sendVerificationEmail,
} from "../src/lib/email";
import { PRODUCTION_URL, resolveBaseURL } from "../src/lib/base-url";

process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-123";

type CapturedPayload = Record<string, unknown>;

function fakeClient(
  impl: (payload: CapturedPayload) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>,
  captured?: { payload?: CapturedPayload }
): EmailClient {
  return {
    emails: {
      send: (async (payload: CapturedPayload) => {
        if (captured) captured.payload = payload;
        return impl(payload);
      }) as never,
    },
  } as unknown as EmailClient;
}

function okClient(captured?: { payload?: CapturedPayload }): EmailClient {
  return fakeClient(
    () => Promise.resolve({ data: { id: "email-id" }, error: null }),
    captured
  );
}

describe("production sender identity", () => {
  test("production EMAIL_FROM default uses the verified domain", () => {
    assert.equal(PRODUCTION_EMAIL_FROM, "Postvia <hello@postvia.online>");
    assert.equal(getEmailFrom({}), "Postvia <hello@postvia.online>");
  });

  test("no resend.dev fallback in any environment", () => {
    for (const env of [
      {},
      { NODE_ENV: "production" },
      { NODE_ENV: "development" },
      { VERCEL_ENV: "production" },
      { VERCEL_ENV: "preview" },
    ]) {
      assert.ok(!getEmailFrom(env).includes("resend.dev"));
    }
  });

  test("EMAIL_FROM env override is still respected", () => {
    assert.equal(
      getEmailFrom({ EMAIL_FROM: "Acme <mail@acme.com>" }),
      "Acme <mail@acme.com>"
    );
  });

  test("blank EMAIL_FROM falls back to the production sender", () => {
    assert.equal(getEmailFrom({ EMAIL_FROM: "   " }), PRODUCTION_EMAIL_FROM);
  });

  test("reply-to defaults to the monitored inbox", () => {
    assert.equal(PRODUCTION_REPLY_TO, "hello@postvia.online");
    assert.equal(getEmailReplyTo({}), "hello@postvia.online");
    assert.equal(
      getEmailReplyTo({ EMAIL_REPLY_TO: "support@postvia.online" }),
      "support@postvia.online"
    );
  });
});

describe("production source guards", () => {
  const source = readFileSync(
    new URL("../src/lib/email.ts", import.meta.url),
    "utf8"
  );

  test("no resend.dev sender remains in production code", () => {
    assert.ok(!source.includes("onboarding@resend.dev"));
    assert.ok(!source.includes("resend.dev"));
  });

  test("RESEND_API_KEY is never exposed to the client bundle", () => {
    assert.ok(!source.includes("process.env.NEXT_PUBLIC"));
    assert.ok(source.includes("RESEND_API_KEY"));
  });
});

describe("production verification email template", () => {
  test("HTML keeps branding, CTA, expiry, and production footer", () => {
    const url =
      "https://postvia.online/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";
    const { html } = renderVerificationEmail(url);

    assert.ok(html.includes("postvia"));
    assert.ok(html.includes("Verify your email"));
    assert.ok(html.includes("Verify email"));
    assert.ok(html.includes("expires in 60 minutes"));
    assert.ok(html.includes("postvia.online"));
    assert.ok(html.includes(`mailto:${PRODUCTION_REPLY_TO}`));
    assert.ok(!html.includes("resend.dev"));
  });

  test("plain text includes URL, expiry, branding, and support contact", () => {
    const url =
      "https://postvia.online/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";
    const { text } = renderVerificationEmail(url);

    assert.ok(text.includes("Postvia"));
    assert.ok(text.includes(url));
    assert.ok(text.includes("60 minutes"));
    assert.ok(text.includes("postvia.online"));
    assert.ok(text.includes(PRODUCTION_REPLY_TO));
    assert.ok(!text.includes("resend.dev"));
  });

  test("localhost URLs still render for local development", () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";
    const { html, text } = renderVerificationEmail(url);
    assert.ok(html.includes(url));
    assert.ok(text.includes(url));
  });
});

describe("production verification URL", () => {
  test("production base URL is the canonical domain", () => {
    assert.equal(
      resolveBaseURL({ VERCEL_ENV: "production" }),
      "https://postvia.online"
    );
    assert.equal(PRODUCTION_URL, "https://postvia.online");
  });

  test("local development does not pin the production URL", () => {
    assert.equal(resolveBaseURL({}), undefined);
  });

  test("production verification link preserves token and /verify-email callback", () => {
    const base = resolveBaseURL({ VERCEL_ENV: "production" })!;
    const url = `${base}/api/auth/verify-email?token=tok123&callbackURL=%2Fverify-email`;
    const { html, text } = renderVerificationEmail(url);

    const decodedHref = html
      .match(/<a href="([^"]+)"/)![1]
      .replace(/&amp;/g, "&");
    assert.equal(decodedHref, url);
    assert.ok(decodedHref.startsWith("https://postvia.online/"));
    assert.ok(decodedHref.includes("callbackURL=%2Fverify-email"));
    assert.ok(text.includes(url));
  });
});

describe("sendVerificationEmail failure behavior", () => {
  test("missing RESEND_API_KEY in production throws instead of faking success", async () => {
    await assert.rejects(
      () =>
        sendVerificationEmail(
          { email: "user@example.com" },
          "https://postvia.online/api/auth/verify-email?token=abc",
          { env: { NODE_ENV: "production" } }
        ),
      (err: unknown) => {
        assert.ok(err instanceof VerificationEmailError);
        assert.ok(!(err as Error).message.includes("token=abc"));
        return true;
      }
    );
  });

  test("missing RESEND_API_KEY outside production stays local-dev friendly", async () => {
    await sendVerificationEmail(
      { email: "user@example.com" },
      "http://localhost:3000/api/auth/verify-email?token=abc",
      { env: { NODE_ENV: "development" } }
    );
  });

  test("Resend API error surfaces as a failure, never a silent success", async () => {
    const url =
      "https://postvia.online/api/auth/verify-email?token=secret-token";
    const client = fakeClient(() =>
      Promise.resolve({ data: null, error: { message: "Domain not verified" } })
    );
    await assert.rejects(
      () =>
        sendVerificationEmail({ email: "user@example.com" }, url, {
          env: { NODE_ENV: "production", RESEND_API_KEY: "re_test" },
          client,
        }),
      (err: unknown) => {
        assert.ok(err instanceof VerificationEmailError);
        assert.ok(!(err as Error).message.includes("secret-token"));
        return true;
      }
    );
  });

  test("Resend transport failure throws a generic error without secrets", async () => {
    const url =
      "https://postvia.online/api/auth/verify-email?token=secret-token";
    const client = fakeClient(() => Promise.reject(new Error("socket hang up")));
    await assert.rejects(
      () =>
        sendVerificationEmail({ email: "user@example.com" }, url, {
          env: { NODE_ENV: "production", RESEND_API_KEY: "re_test" },
          client,
        }),
      (err: unknown) => {
        assert.ok(err instanceof VerificationEmailError);
        assert.equal((err as Error).message, "Failed to send verification email");
        return true;
      }
    );
  });

  test("successful send uses production from, reply-to, subject, and both bodies", async () => {
    const captured: { payload?: CapturedPayload } = {};
    const url =
      "https://postvia.online/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";
    await sendVerificationEmail({ email: "user@example.com" }, url, {
      env: { NODE_ENV: "production", RESEND_API_KEY: "re_test" },
      client: okClient(captured),
    });

    assert.equal(captured.payload?.["from"], "Postvia <hello@postvia.online>");
    assert.equal(captured.payload?.["replyTo"], "hello@postvia.online");
    assert.equal(captured.payload?.["to"], "user@example.com");
    assert.equal(captured.payload?.["subject"], "Verify your email — Postvia");
    assert.ok((captured.payload?.["html"] as string).includes("Verify email"));
    assert.ok((captured.payload?.["text"] as string).includes(url));
  });

  test("EMAIL_FROM override flows through to the send call", async () => {
    const captured: { payload?: CapturedPayload } = {};
    await sendVerificationEmail(
      { email: "user@example.com" },
      "https://postvia.online/api/auth/verify-email?token=abc",
      {
        env: {
          NODE_ENV: "production",
          RESEND_API_KEY: "re_test",
          EMAIL_FROM: "Acme <mail@acme.com>",
        },
        client: okClient(captured),
      }
    );
    assert.equal(captured.payload?.["from"], "Acme <mail@acme.com>");
  });
});

describe("OTP email configuration", () => {
  test("isEmailConfigured reflects key presence", () => {
    assert.equal(isEmailConfigured({}), false);
    assert.equal(isEmailConfigured({ RESEND_API_KEY: "" }), false);
    assert.equal(isEmailConfigured({ RESEND_API_KEY: "re_test" }), true);
  });

  test("configured local Resend takes the send path", async () => {
    const captured: { payload?: CapturedPayload } = {};
    await sendOtpEmail(
      { email: "user@example.com", otp: "123456", type: "email-verification" },
      {
        env: { NODE_ENV: "development", RESEND_API_KEY: "re_test" },
        client: okClient(captured),
      }
    );
    assert.equal(captured.payload?.["to"], "user@example.com");
    assert.equal(captured.payload?.["subject"], "Verify your email — Postvia");
    assert.ok((captured.payload?.["html"] as string).includes("123456"));
  });

  test("missing local key rejects explicitly instead of faking success", async () => {
    await assert.rejects(
      () =>
        sendOtpEmail(
          { email: "user@example.com", otp: "123456", type: "email-verification" },
          { env: { NODE_ENV: "development" } }
        ),
      (err: unknown) => {
        assert.ok(err instanceof EmailNotConfiguredError);
        assert.ok(err instanceof VerificationEmailError);
        assert.ok((err as Error).message.includes("RESEND_API_KEY"));
        assert.ok(!(err as Error).message.includes("user@example.com"));
        assert.ok(!(err as Error).message.includes("123456"));
        return true;
      }
    );
  });

  test("missing production key keeps the hard failure", async () => {
    await assert.rejects(
      () =>
        sendOtpEmail(
          { email: "user@example.com", otp: "123456", type: "email-verification" },
          { env: { NODE_ENV: "production" } }
        ),
      (err: unknown) => {
        assert.ok(err instanceof EmailNotConfiguredError);
        assert.ok(!(err as Error).message.includes(".env.local"));
        return true;
      }
    );
  });
});
