import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISH_EVENT_FIELDS,
  PUBLISH_EVENT_STATUS,
  buildPublishPayload,
  emitLateSchedule,
  emitProviderRateLimit,
  emitPublishAttempt,
  emitPublishEvent,
  emitPublishFailure,
  emitPublishRetry,
  emitPublishSuccess,
  emitPublishTimeout,
  emitTokenRefresh,
  inferAttemptNumber,
  isPublishEventName,
  isRateLimitSignal,
  type PublishEventName,
  type PublishEventPayload,
} from "../src/lib/publish-observability";
import { LATE_THRESHOLD_MS } from "../src/lib/scheduling";

/**
 * Publishing observability contract: eight allowlisted events, six-field
 * payloads, no secrets/PII, multi-target distinguishability. DB-free:
 * the emitter only wraps `logDiagnostic` (console), never Sentry.
 */

type Captured = { message: string; fields: Record<string, unknown> };

let captured: Captured[];
let errors: unknown[][];
let originalInfo: typeof console.info;
let originalError: typeof console.error;

beforeEach(() => {
  captured = [];
  errors = [];
  originalInfo = console.info;
  originalError = console.error;
  console.info = ((message: string, fields: Record<string, unknown>) => {
    captured.push({ message: String(message), fields });
  }) as typeof console.info;
  console.error = ((...args: unknown[]) => {
    errors.push(args);
  }) as typeof console.error;
});

afterEach(() => {
  console.info = originalInfo;
  console.error = originalError;
});

function lastFields(): Record<string, unknown> {
  assert.ok(captured.length > 0, "expected an emitted event");
  return captured[captured.length - 1].fields;
}

function lastMessage(): string {
  assert.ok(captured.length > 0, "expected an emitted event");
  return captured[captured.length - 1].message;
}

const REF = { provider: "X", postId: "post_1", targetId: "tgt_1", attempt: 1 } as const;

describe("event taxonomy", () => {
  test("all eight events exist with fixed statuses", () => {
    const names: PublishEventName[] = [
      "publish_attempt",
      "publish_success",
      "publish_failure",
      "retry",
      "timeout",
      "provider_rate_limit",
      "token_refresh",
      "late_schedule",
    ];
    for (const name of names) {
      assert.ok(isPublishEventName(name), name);
      assert.ok(PUBLISH_EVENT_STATUS[name].length > 0, name);
    }
    assert.equal(isPublishEventName("nope"), false);
  });

  test("1: publish_attempt emits attempted with duration 0", () => {
    emitPublishAttempt({ ...REF });
    assert.equal(lastMessage(), "[postvia] publish: publish_attempt");
    assert.deepEqual(lastFields(), { ...REF, duration: 0, status: "attempted" });
  });

  test("2: publish_success emits published with measured duration", () => {
    emitPublishSuccess({ ...REF, duration: 1234 });
    assert.equal(lastMessage(), "[postvia] publish: publish_success");
    assert.deepEqual(lastFields(), { ...REF, duration: 1234, status: "published" });
  });

  test("3: publish_failure emits failed (terminal only)", () => {
    emitPublishFailure({ ...REF, duration: 42 });
    assert.equal(lastMessage(), "[postvia] publish: publish_failure");
    assert.deepEqual(lastFields(), { ...REF, duration: 42, status: "failed" });
  });

  test("3b: ambiguous X outcome uses failed_ambiguous, not failed", () => {
    emitPublishFailure({ ...REF, duration: 7, ambiguous: true });
    assert.deepEqual(lastFields(), { ...REF, duration: 7, status: "failed_ambiguous" });
  });

  test("4: retry emits retry_queued and precedes its attempt in order", () => {
    emitPublishRetry({ ...REF, attempt: 2 });
    emitPublishAttempt({ ...REF, attempt: 2 });
    emitPublishSuccess({ ...REF, attempt: 2, duration: 5 });
    assert.deepEqual(
      captured.map((c) => c.message),
      [
        "[postvia] publish: retry",
        "[postvia] publish: publish_attempt",
        "[postvia] publish: publish_success",
      ]
    );
    assert.equal(captured[0].fields["status"], "retry_queued");
  });

  test("5: timeout emits timeout (processing is not failure)", () => {
    emitPublishTimeout({ ...REF, duration: 150_000 });
    assert.equal(lastMessage(), "[postvia] publish: timeout");
    assert.deepEqual(lastFields(), { ...REF, duration: 150_000, status: "timeout" });
  });

  test("6: provider_rate_limit emits rate_limited", () => {
    emitProviderRateLimit({ ...REF, attempt: 2 });
    assert.equal(lastMessage(), "[postvia] publish: provider_rate_limit");
    assert.deepEqual(lastFields(), {
      ...REF,
      attempt: 2,
      duration: 0,
      status: "rate_limited",
    });
  });

  test("7: token_refresh emits refreshed / refresh_failed without values", () => {
    emitTokenRefresh({ ...REF, status: "refreshed" });
    assert.equal(lastMessage(), "[postvia] publish: token_refresh");
    assert.deepEqual(lastFields(), { ...REF, duration: 0, status: "refreshed" });
    emitTokenRefresh({ ...REF, status: "refresh_failed" });
    assert.deepEqual(lastFields(), { ...REF, duration: 0, status: "refresh_failed" });
  });

  test("8: late_schedule emits late with lateness as duration", () => {
    emitLateSchedule({ ...REF, duration: 3_700_000 });
    assert.equal(lastMessage(), "[postvia] publish: late_schedule");
    assert.deepEqual(lastFields(), { ...REF, duration: 3_700_000, status: "late" });
  });

  test("wrong status for an event is dropped, never relabeled", () => {
    emitPublishEvent("publish_attempt", {
      ...REF,
      duration: 0,
      status: "published",
    });
    assert.equal(captured.length, 0);
  });

  test("unknown event names never emit", () => {
    emitPublishEvent("nope" as unknown as PublishEventName, {
      ...REF,
      duration: 0,
      status: "attempted",
    });
    assert.equal(captured.length, 0);
  });
});

describe("allowlist payload contract", () => {
  test("exactly the six allowed fields, in order", () => {
    assert.deepEqual([...PUBLISH_EVENT_FIELDS], [
      "provider",
      "postId",
      "targetId",
      "duration",
      "attempt",
      "status",
    ]);
  });

  test("emitted object contains only allowlisted keys", () => {
    emitPublishSuccess({ ...REF, duration: 9 });
    assert.deepEqual(Object.keys(lastFields()).sort(), [
      "attempt",
      "duration",
      "postId",
      "provider",
      "status",
      "targetId",
    ]);
  });

  test("runtime pick drops smuggled extra keys", () => {
    const smuggled = {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 0,
      attempt: 1,
      status: "attempted",
      accessToken: "tok_secret",
      refreshToken: "ref_secret",
      userId: "user_1",
      email: "a@b.c",
      headers: { authorization: "Bearer x" },
      body: "hello",
      error: new Error("boom"),
    } as unknown as PublishEventPayload;
    emitPublishEvent("publish_attempt", smuggled);
    assert.deepEqual(Object.keys(lastFields()).sort(), [
      "attempt",
      "duration",
      "postId",
      "provider",
      "status",
      "targetId",
    ]);
    assert.ok(!JSON.stringify(lastFields()).includes("tok_secret"));
  });

  test("counts are normalized: NaN/Infinity/negative become 0", () => {
    assert.equal(buildPublishPayload({ ...REF, duration: NaN, attempt: 1, status: "attempted" }).duration, 0);
    assert.equal(
      buildPublishPayload({ ...REF, duration: Infinity, attempt: -3, status: "attempted" }).attempt,
      0
    );
  });

  test("non-string identifiers degrade to unknown, never throw", () => {
    const payload = buildPublishPayload({
      provider: 42,
      postId: null,
      targetId: undefined,
      duration: 0,
      attempt: 1,
      status: "attempted",
    } as unknown as PublishEventPayload);
    assert.deepEqual(payload, {
      provider: "unknown",
      postId: "unknown",
      targetId: "unknown",
      duration: 0,
      attempt: 1,
      status: "attempted",
    });
  });

  test("invalid status degrades to failed, never passes through", () => {
    const payload = buildPublishPayload({
      ...REF,
      duration: 0,
      status: "admin",
    } as unknown as PublishEventPayload);
    assert.equal(payload.status, "failed");
  });

  test("emitter never throws on hostile input", () => {
    assert.doesNotThrow(() => {
      emitPublishEvent("publish_attempt", null as unknown as PublishEventPayload);
      emitPublishEvent("publish_failure", undefined as unknown as PublishEventPayload);
      emitPublishEvent("publish_success", Object.freeze({}) as unknown as PublishEventPayload);
    });
  });

  test("no event reaches the error pipeline (Sentry stays quiet)", () => {
    emitPublishAttempt({ ...REF });
    emitPublishSuccess({ ...REF, duration: 1 });
    emitPublishFailure({ ...REF, duration: 1 });
    emitPublishTimeout({ ...REF, duration: 1 });
    assert.equal(errors.length, 0);
  });
});

describe("compile-time protection (checked by typecheck)", () => {
  test("forbidden fields are rejected by the payload type", () => {
    emitPublishEvent("publish_attempt", {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 0,
      attempt: 1,
      status: "attempted",
      // @ts-expect-error — accessToken must never reach telemetry
      accessToken: "tok",
    });
    emitPublishEvent("publish_failure", {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 0,
      attempt: 1,
      status: "failed",
      // @ts-expect-error — secrets must never reach telemetry
      secret: "s",
    });
    emitPublishEvent("publish_success", {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 1,
      attempt: 1,
      status: "published",
      // @ts-expect-error — userId is not an allowed telemetry field
      userId: "u",
    });
    emitPublishEvent("retry", {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 0,
      attempt: 2,
      status: "retry_queued",
      // @ts-expect-error — raw errors must never reach telemetry
      error: new Error("boom"),
    });
    emitPublishEvent("timeout", {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 1,
      attempt: 1,
      status: "timeout",
      // @ts-expect-error — headers must never reach telemetry
      headers: {},
    });
    emitPublishEvent("token_refresh", {
      provider: "X",
      postId: "p",
      targetId: "t",
      duration: 0,
      attempt: 1,
      status: "refreshed",
      // @ts-expect-error — email is PII and never allowed
      email: "a@b.c",
    });
    const loose: Record<string, unknown> = { provider: "X" };
    emitPublishEvent(
      "publish_attempt",
      // @ts-expect-error — free records bypass the allowlist
      loose
    );
  });
});

describe("attempt semantics (best-effort, saturating)", () => {
  test("PENDING enters as 1, FAILED re-entry as 2", () => {
    assert.equal(inferAttemptNumber("PENDING"), 1);
    assert.equal(inferAttemptNumber("FAILED"), 2);
    assert.equal(inferAttemptNumber("PUBLISHING"), 1);
    assert.equal(inferAttemptNumber("anything-else"), 1);
  });
});

describe("rate-limit detection (provable points only)", () => {
  test("HTTP 429 is a rate limit", () => {
    assert.equal(isRateLimitSignal({ httpStatus: 429 }), true);
    assert.equal(isRateLimitSignal({ status: 429 }), true);
    assert.equal(isRateLimitSignal({ error: { httpStatus: 429 } }), true);
  });

  test("known provider rate-limit codes are rate limits", () => {
    assert.equal(isRateLimitSignal({ code: "rate_limit_exceeded" }), true);
    assert.equal(isRateLimitSignal({ code: "spam_risk_too_many_posts" }), true);
    assert.equal(isRateLimitSignal({ code: "reached_active_user_cap" }), true);
    assert.equal(
      isRateLimitSignal("TikTok rate limit reached. Please retry in a minute."),
      true
    );
  });

  test("auth/config/validation errors are NOT rate limits", () => {
    assert.equal(isRateLimitSignal({ code: "token_expired", httpStatus: 401 }), false);
    assert.equal(isRateLimitSignal({ code: "190", httpStatus: 400 }), false);
    assert.equal(isRateLimitSignal({ httpStatus: 500 }), false);
    assert.equal(isRateLimitSignal(new Error("Publication failed")), false);
    assert.equal(isRateLimitSignal(null), false);
    assert.equal(isRateLimitSignal(undefined), false);
  });

  test("sensitive values are only pattern-tested, never retained", () => {
    const sensitive = {
      code: "rate_limit_exceeded",
      accessToken: "tok_secret",
      headers: { authorization: "Bearer s" },
    };
    assert.equal(isRateLimitSignal(sensitive), true);
    emitProviderRateLimit({ ...REF });
    assert.ok(!JSON.stringify(lastFields()).includes("tok_secret"));
  });
});

describe("multi-target distinguishability", () => {
  test("same postId, different targetIds stay separable", () => {
    emitPublishAttempt({ provider: "X", postId: "post_1", targetId: "targetA", attempt: 1 });
    emitPublishAttempt({ provider: "THREADS", postId: "post_1", targetId: "targetB", attempt: 1 });
    emitPublishSuccess({ provider: "X", postId: "post_1", targetId: "targetA", attempt: 1, duration: 3 });
    emitPublishFailure({ provider: "THREADS", postId: "post_1", targetId: "targetB", attempt: 1, duration: 4 });
    const byTarget = (id: string) =>
      captured.filter((c) => c.fields["targetId"] === id).map((c) => c.message);
    assert.deepEqual(byTarget("targetA"), [
      "[postvia] publish: publish_attempt",
      "[postvia] publish: publish_success",
    ]);
    assert.deepEqual(byTarget("targetB"), [
      "[postvia] publish: publish_attempt",
      "[postvia] publish: publish_failure",
    ]);
  });

  test("one target failure does not suppress the sibling telemetry", () => {
    emitPublishFailure({ provider: "X", postId: "post_1", targetId: "targetA", attempt: 1, duration: 1 });
    emitPublishSuccess({ provider: "TIKTOK", postId: "post_1", targetId: "targetB", attempt: 1, duration: 2 });
    assert.equal(captured.length, 2);
  });

  test("no post-level aggregate event exists", () => {
    for (const name of Object.keys(PUBLISH_EVENT_STATUS)) {
      assert.ok(isPublishEventName(name));
    }
    // Every wrapper requires a targetId — aggregates cannot be expressed.
    // @ts-expect-error — targetId is required
    emitPublishSuccess({ provider: "X", postId: "p", duration: 1, attempt: 1 });
  });
});

describe("scheduling threshold", () => {
  test("late threshold is one hour (daily-cron aware)", () => {
    assert.equal(LATE_THRESHOLD_MS, 3_600_000);
  });
});
