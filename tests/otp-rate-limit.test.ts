import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { retryAfterSecondsUntil, checkAbuseRateDetailed } from "../src/lib/abuse";
import {
  OTP_RATE_LIMITED_CODE,
  maxDeniedRetryAfterSeconds,
} from "../src/lib/otp";
import {
  OTP_SEND_COOLDOWN_SECONDS,
  OTP_SEND_MAX_PER_HOUR,
} from "../src/lib/otp-config";
import {
  OTP_RATE_LIMITED_CODE as UI_CODE,
  formatOtpRateLimitMessage,
  isOtpRateLimited,
  normalizeRetryAfterSeconds,
} from "../src/lib/otp-rate-limit";

function fakeStores(allow: boolean) {
  return {
    findSignalOwners: async () => [],
    createIdentity: async () => ({ id: "x", firstSeenAt: new Date() }),
    linkUser: async () => {},
    findIdentityIdByUser: async () => null,
    findUserIdsByIdentity: async () => [],
    attachSignals: async () => {},
    removeSignals: async () => {},
    mergeIdentities: async () => {},
    getIdentity: async () => null,
    setRisk: async () => {},
    escalateRisk: async () => {},
    touchLinked: async () => {},
    touchSeen: async () => {},
    findTombstones: async () => [],
    writeTombstones: async () => {},
    sweepTombstones: async () => 0,
    getFreeUsage: async () => null,
    initFreeUsage: async () => 0,
    incrementFreeIfBelow: async () => true,
    raiseFreeFloor: async () => {},
    sumPostUsage: async () => 0,
    rateTake: async () => allow,
  };
}

describe("OTP rate-limit policy unchanged", () => {
  test("hourly cap 5/hour, cooldown 60s", () => {
    assert.equal(OTP_SEND_MAX_PER_HOUR, 5);
    assert.equal(OTP_SEND_COOLDOWN_SECONDS, 60);
  });

  test("server and UI share one RATE_LIMITED code", () => {
    assert.equal(OTP_RATE_LIMITED_CODE, "RATE_LIMITED");
    assert.equal(UI_CODE, "RATE_LIMITED");
  });
});

describe("retryAfterSecondsUntil", () => {
  test("returns ceiling of remaining window", () => {
    assert.equal(retryAfterSecondsUntil(10_042, 10_000), 1);
    assert.equal(retryAfterSecondsUntil(70_000, 10_000), 60);
  });

  test("never negative: past reset yields 0", () => {
    assert.equal(retryAfterSecondsUntil(9_000, 10_000), 0);
    assert.equal(retryAfterSecondsUntil(10_000, 10_000), 0);
  });

  test("non-finite input yields 0", () => {
    assert.equal(retryAfterSecondsUntil(NaN, 1_000), 0);
    assert.equal(retryAfterSecondsUntil(Infinity, 1_000), 0);
  });
});

describe("maxDeniedRetryAfterSeconds", () => {
  test("cooldown-only denial returns cooldown remainder", () => {
    assert.equal(
      maxDeniedRetryAfterSeconds([
        { allowed: true, retryAfterSeconds: 0 },
        { allowed: false, retryAfterSeconds: 53 },
      ]),
      53
    );
  });

  test("hourly-cap denial returns hourly remainder", () => {
    assert.equal(
      maxDeniedRetryAfterSeconds([
        { allowed: false, retryAfterSeconds: 2280 },
        { allowed: true, retryAfterSeconds: 0 },
      ]),
      2280
    );
  });

  test("both denied returns the latest-safe (max) wait", () => {
    assert.equal(
      maxDeniedRetryAfterSeconds([
        { allowed: false, retryAfterSeconds: 2280 },
        { allowed: false, retryAfterSeconds: 42 },
      ]),
      2280
    );
  });

  test("all allowed returns 0; denied with no time returns >= 1", () => {
    assert.equal(
      maxDeniedRetryAfterSeconds([
        { allowed: true, retryAfterSeconds: 0 },
        { allowed: true, retryAfterSeconds: 0 },
      ]),
      0
    );
    const fallback = maxDeniedRetryAfterSeconds([
      { allowed: false, retryAfterSeconds: 0 },
    ]);
    assert.ok(fallback >= 1);
  });

  test("never negative", () => {
    const value = maxDeniedRetryAfterSeconds([
      { allowed: false, retryAfterSeconds: -5 },
    ]);
    assert.ok(value >= 1);
  });
});

describe("checkAbuseRateDetailed (fail-open fallback)", () => {
  test("allowed request reports 0", async () => {
    const result = await checkAbuseRateDetailed({
      scope: "otp-send-cool-test",
      keyHash: "k",
      max: 1,
      windowMs: 60_000,
      stores: fakeStores(true),
      nowMs: 1_000,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.retryAfterSeconds, 0);
  });

  test("denied request without a readable bucket falls back to window, never negative", async () => {
    const result = await checkAbuseRateDetailed({
      scope: "otp-send-cool-test",
      keyHash: "missing-bucket",
      max: 1,
      windowMs: 60_000,
      stores: fakeStores(false),
      nowMs: 1_000,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.retryAfterSeconds >= 1);
    assert.ok(result.retryAfterSeconds <= 60);
  });
});

describe("normalizeRetryAfterSeconds", () => {
  test("accepts finite positives, ceils fractions", () => {
    assert.equal(normalizeRetryAfterSeconds(42), 42);
    assert.equal(normalizeRetryAfterSeconds(41.2), 42);
  });

  test("rejects zero, negatives, NaN, non-numbers", () => {
    assert.equal(normalizeRetryAfterSeconds(0), null);
    assert.equal(normalizeRetryAfterSeconds(-5), null);
    assert.equal(normalizeRetryAfterSeconds(NaN), null);
    assert.equal(normalizeRetryAfterSeconds("42"), null);
    assert.equal(normalizeRetryAfterSeconds(undefined), null);
  });

  test("caps at one hour", () => {
    assert.equal(normalizeRetryAfterSeconds(99999), 3600);
  });
});

describe("isOtpRateLimited", () => {
  test("true only for structured OTP shape", () => {
    assert.equal(
      isOtpRateLimited({ code: "RATE_LIMITED", retryAfterSeconds: 42 }),
      true
    );
  });

  test("false for ordinary server errors", () => {
    assert.equal(isOtpRateLimited({ error: "Failed to send code." }), false);
    assert.equal(
      isOtpRateLimited({ code: "RATE_LIMITED", retryAfterSeconds: 0 }),
      false
    );
    assert.equal(isOtpRateLimited({ code: "OTHER", retryAfterSeconds: 42 }), false);
    assert.equal(isOtpRateLimited(null), false);
  });
});

describe("formatOtpRateLimitMessage", () => {
  test("seconds range uses exact seconds", () => {
    assert.equal(
      formatOtpRateLimitMessage(42),
      "Please wait 42 seconds before requesting another code."
    );
    assert.equal(
      formatOtpRateLimitMessage(53),
      "Please wait 53 seconds before requesting another code."
    );
    assert.equal(
      formatOtpRateLimitMessage(1),
      "Please wait 1 second before requesting another code."
    );
  });

  test("minutes range rounds naturally", () => {
    assert.equal(
      formatOtpRateLimitMessage(120),
      "Too many codes requested. Please try again in about 2 minutes."
    );
    assert.equal(
      formatOtpRateLimitMessage(2280),
      "Too many codes requested. Please try again in about 38 minutes."
    );
  });

  test("hour range", () => {
    assert.equal(
      formatOtpRateLimitMessage(3600),
      "Too many codes requested. Please try again in about 1 hour."
    );
  });

  test("reveals no technical details", () => {
    for (const seconds of [42, 2280, 3600]) {
      const message = formatOtpRateLimitMessage(seconds).toLowerCase();
      assert.ok(!message.includes("bucket"));
      assert.ok(!message.includes("hash"));
      assert.ok(!message.includes("scope"));
      assert.ok(!message.includes("resetat"));
      assert.ok(!message.includes("@"));
    }
  });
});

describe("structured 429 shape (signup/login/resend share it)", () => {
  test("rate-limited body carries code + retryAfterSeconds", () => {
    const body = {
      error: "Too many codes requested. Please wait a minute and try again.",
      code: OTP_RATE_LIMITED_CODE,
      retryAfterSeconds: 42,
    };
    assert.equal(isOtpRateLimited(body), true);
    assert.equal(
      formatOtpRateLimitMessage(body.retryAfterSeconds),
      "Please wait 42 seconds before requesting another code."
    );
  });

  test("ordinary OTP success and error shapes are unchanged", () => {
    assert.equal(isOtpRateLimited({ ok: true } as never), false);
    assert.equal(
      isOtpRateLimited({ error: "Failed to send code. Please try again." }),
      false
    );
  });
});
