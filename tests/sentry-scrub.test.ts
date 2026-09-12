import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  reportError,
  scrubRequestPath,
  scrubSentryEvent,
  scrubUrl,
  scrubValue,
} from "../src/lib/diagnostics";

describe("sentry scrub denylist", () => {
  test("redacts token, password, secret and code keys", () => {
    const out = scrubValue({
      accessToken: "secret-a",
      refreshToken: "secret-r",
      clientSecret: "secret-c",
      password: "hunter2",
      nested: { sessionToken: "secret-s", safe: "keep" },
    }) as Record<string, unknown>;
    assert.equal(out.accessToken, "[REDACTED]");
    assert.equal(out.refreshToken, "[REDACTED]");
    assert.equal(out.clientSecret, "[REDACTED]");
    assert.equal(out.password, "[REDACTED]");
    assert.equal(
      (out.nested as Record<string, unknown>).sessionToken,
      "[REDACTED]"
    );
    assert.equal((out.nested as Record<string, unknown>).safe, "keep");
  });

  test("redacts OAuth code/state and signed URL values", () => {
    const out = scrubValue({
      code: "oauth-code",
      state: "oauth-state",
      url: "https://blob.test/file.mp4?sig=abc&token=def",
    }) as Record<string, unknown>;
    assert.equal(out.code, "[REDACTED]");
    assert.equal(out.state, "[REDACTED]");
    assert.equal(out.url, "[REDACTED]");
  });

  test("scrubUrl strips queries carrying secrets, keeps safe ones", () => {
    assert.equal(
      scrubUrl("https://postvia.online/api/auth/x/callback?code=abc&state=xyz"),
      "https://postvia.online/api/auth/x/callback?[REDACTED]"
    );
    assert.equal(
      scrubUrl("https://postvia.online/accounts?connected=true"),
      "https://postvia.online/accounts?connected=true"
    );
  });

  test("scrubRequestPath drops the query string entirely", () => {
    assert.equal(
      scrubRequestPath("/api/auth/threads/callback?code=abc"),
      "/api/auth/threads/callback"
    );
    assert.equal(scrubRequestPath("/billing"), "/billing");
  });

  test("scrubSentryEvent removes PII and secrets, keeps the event", () => {
    const event = scrubSentryEvent({
      request: {
        url: "https://postvia.online/api/auth/x/callback?code=abc",
        headers: { authorization: "Bearer s3cr3t", "content-type": "text/html" },
        cookies: "session=abc",
      },
      user: { id: "user-1", email: "a@b.c", username: "someone" },
      extra: { accessToken: "secret", postId: "post-1" },
    });
    assert.equal(
      event.request.url,
      "https://postvia.online/api/auth/x/callback?[REDACTED]"
    );
    assert.equal(event.request.headers.authorization, "[REDACTED]");
    assert.equal(event.request.headers["content-type"], "text/html");
    assert.equal(event.request.cookies, "[REDACTED]");
    assert.deepEqual(event.user, { id: "user-1" });
    assert.deepEqual(event.extra, {
      accessToken: "[REDACTED]",
      postId: "post-1",
    });
  });

  test("reportError never throws, with or without DSN", () => {
    assert.doesNotThrow(() =>
      reportError("test", "scrub check", new Error("boom"), {
        accessToken: "secret",
        postId: "post-1",
      })
    );
    assert.doesNotThrow(() =>
      reportError("test", "non-error value", "plain string failure")
    );
  });
});
