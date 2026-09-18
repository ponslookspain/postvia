import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mediaTrace,
  pathDigest,
  reportError,
  scrubRequestPath,
  scrubSentryEvent,
  scrubUrl,
  scrubValue,
  traceUserId,
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

/**
 * Media traceability (P1.4).
 *
 * Two properties must hold at once: an operator can follow ONE user's ONE
 * upload through the pipeline, and no raw identifier ever reaches a log or
 * Sentry. These cases pin both directions.
 */
describe("media trace identifiers", () => {
  const USER = "cmka8s1x30000abcdef123456";
  const POST = "cmka8s1x30001abcdef123456";
  const MEDIA = "cmka8s1x30002abcdef123456";
  const PATH = `media/${USER}/${POST}/0123456789abcdef0123456789abcdef-cat.jpg`;

  test("the user hash is stable, so one user's failures group together", () => {
    assert.equal(traceUserId(USER), traceUserId(USER));
  });

  test("different users never collide", () => {
    assert.notEqual(traceUserId(USER), traceUserId(`${USER}x`));
  });

  test("the hash never contains the raw user id", () => {
    const hash = traceUserId(USER);
    assert.ok(!hash.includes(USER));
    assert.notEqual(hash, USER);
    assert.match(hash, /^[0-9a-f]{12}$/);
  });

  test("a missing user id is labelled, never blank or raw", () => {
    assert.equal(traceUserId(null), "anon");
    assert.equal(traceUserId(undefined), "anon");
    assert.equal(traceUserId(""), "anon");
  });

  test("the path digest identifies the object without revealing the key", () => {
    const digest = pathDigest(PATH);
    assert.equal(digest, pathDigest(PATH), "stable across pipeline stages");
    assert.notEqual(digest, pathDigest(`${PATH}x`));
    assert.ok(!digest.includes(USER), "the key embeds the user id");
    assert.ok(!digest.includes(POST));
    assert.match(digest, /^[0-9a-f]{12}$/);
  });

  test("mediaTrace answers 'which upload, of which post, for which user'", () => {
    const trace = mediaTrace({
      stage: "media-create",
      userId: USER,
      postId: POST,
      mediaId: MEDIA,
      pathname: PATH,
    });

    // Traceable: the ids support needs to find the row.
    assert.equal(trace.postId, POST);
    assert.equal(trace.mediaId, MEDIA);
    assert.equal(trace.stage, "media-create");
    assert.equal(trace.userHash, traceUserId(USER));
    assert.equal(trace.pathDigest, pathDigest(PATH));

    // Private: no raw user id, and the legacy scrub is still applied.
    const serialized = JSON.stringify(trace);
    assert.ok(!serialized.includes(USER), "the raw user id must never appear");
    assert.ok(!serialized.includes("cat.jpg"), "filenames stay out of logs");
    assert.equal(trace.pathname, "media/***/***");
  });

  test("two uploads for the same post are distinguishable", () => {
    const a = mediaTrace({ stage: "s", userId: USER, postId: POST, pathname: `${PATH}-a` });
    const b = mediaTrace({ stage: "s", userId: USER, postId: POST, pathname: `${PATH}-b` });
    assert.notEqual(a.pathDigest, b.pathDigest);
    assert.equal(a.userHash, b.userHash);
  });

  test("the trace survives the Sentry scrub with its identifiers intact", () => {
    const trace = mediaTrace({
      stage: "media-cap",
      userId: USER,
      postId: POST,
      mediaId: MEDIA,
      pathname: PATH,
    });
    const scrubbed = scrubValue(trace) as Record<string, unknown>;

    // The whole point: these must NOT be redacted, or the gap reopens.
    assert.equal(scrubbed.postId, POST);
    assert.equal(scrubbed.mediaId, MEDIA);
    assert.equal(scrubbed.userHash, trace.userHash);
    assert.equal(scrubbed.pathDigest, trace.pathDigest);
    assert.equal(scrubbed.stage, "media-cap");
  });

  test("optional ids are omitted rather than emitted empty", () => {
    const trace = mediaTrace({ stage: "prepare", userId: USER });
    assert.ok(!("postId" in trace));
    assert.ok(!("mediaId" in trace));
    assert.equal(trace.pathDigest, "none");
  });
});
