import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AuthorizationError,
  DomainError,
  EntitlementError,
  ExternalProviderError,
  ProviderError,
  RateLimitError,
  ValidationError,
  isDomainError,
} from "../src/lib/errors/domain-error";
import { toApiResponse, parseApiErrorBody } from "../src/lib/errors/to-response";
import {
  classifyTiktokError,
  normalizeProviderError,
} from "../src/lib/errors/normalize";
import {
  parseApiError,
  getErrorText,
  mapOtpError,
} from "../src/lib/client-error-message";
import { reportError } from "../src/lib/diagnostics";

describe("error classes", () => {
  test("ValidationError maps to 400 VALIDATION_FAILED", () => {
    const err = new ValidationError("Text is required");
    assert.equal(err.status, 400);
    assert.equal(err.code, "VALIDATION_FAILED");
    assert.equal(err.retryable, false);
    assert.equal(err.safeMessage, "Text is required");
    assert.ok(isDomainError(err));
  });

  test("AuthorizationError defaults to 401 UNAUTHENTICATED", () => {
    const err = new AuthorizationError("Not authenticated");
    assert.equal(err.status, 401);
    assert.equal(err.code, "UNAUTHENTICATED");
  });

  test("AuthorizationError 403 maps to FORBIDDEN", () => {
    const err = new AuthorizationError("Forbidden", { status: 403 });
    assert.equal(err.status, 403);
    assert.equal(err.code, "FORBIDDEN");
  });

  test("EntitlementError carries upgradeTo in details", () => {
    const err = new EntitlementError("Monthly post limit reached (15/15).", {
      upgradeTo: "growth",
    });
    assert.equal(err.status, 403);
    assert.equal(err.code, "ENTITLEMENT_DENIED");
    assert.deepEqual(err.details, { upgradeTo: "growth" });
  });

  test("RateLimitError is retryable with retryAfterSeconds", () => {
    const err = new RateLimitError("Too many requests.", { retryAfterSeconds: 42 });
    assert.equal(err.status, 429);
    assert.equal(err.code, "RATE_LIMITED");
    assert.equal(err.retryable, true);
    assert.deepEqual(err.details, { retryAfterSeconds: 42 });
  });

  test("ProviderError vs ExternalProviderError differ by retryable/code", () => {
    const internal = new ProviderError("TikTok is not configured");
    assert.equal(internal.code, "PROVIDER_UNAVAILABLE");
    assert.equal(internal.retryable, false);
    const external = new ExternalProviderError("TikTok rate limit reached.", {
      code: "PROVIDER_REJECTED",
      retryable: true,
      provider: "tiktok",
      providerCode: "rate_limit_exceeded",
    });
    assert.equal(external.code, "PROVIDER_REJECTED");
    assert.equal(external.retryable, true);
    assert.equal(external.provider, "tiktok");
  });
});

describe("toApiResponse flat shape", () => {
  test("DomainError keeps error string + adds code", () => {
    const res = toApiResponse(new ValidationError("Text is required"));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Text is required");
    assert.equal(res.body.code, "VALIDATION_FAILED");
    assert.equal(typeof res.body.error, "string");
  });

  test("EntitlementError serializes details without cause", () => {
    const res = toApiResponse(
      new EntitlementError("Monthly post limit reached.", { upgradeTo: "growth" })
    );
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "ENTITLEMENT_DENIED");
    assert.deepEqual(res.body.details, { upgradeTo: "growth" });
    assert.ok(!("cause" in res.body));
  });

  test("unknown Error becomes INTERNAL without leakage", () => {
    const res = toApiResponse(new Error("postgres://secret-internal-detail"));
    assert.equal(res.status, 500);
    assert.equal(res.body.code, "INTERNAL");
    assert.equal(res.body.error, "Something went wrong. Please try again.");
    assert.ok(!res.body.error.includes("postgres"));
  });

  test("unknown thrown value becomes INTERNAL", () => {
    assert.equal(toApiResponse(null).body.code, "INTERNAL");
    assert.equal(toApiResponse(42).body.code, "INTERNAL");
    assert.equal(toApiResponse(undefined).status, 500);
  });

  test("cause and provider secrets never reach JSON", () => {
    const err = new ExternalProviderError("TikTok rate limit reached.", {
      provider: "tiktok",
      providerCode: "rate_limit_exceeded",
      cause: new Error("access_token=secret-value"),
    });
    const res = toApiResponse(err);
    const json = JSON.stringify(res.body);
    assert.ok(!json.includes("secret-value"));
    assert.ok(!json.includes("access_token=secret"));
    assert.ok(!("cause" in res.body));
    assert.ok(!("providerCode" in res.body));
  });

  test("legacy { error, status } still maps", () => {
    const res = toApiResponse({ error: "Not authenticated", status: 401 });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "UNAUTHENTICATED");
  });

  test("parseApiErrorBody accepts flat shape", () => {
    const parsed = parseApiErrorBody({ error: "x", code: "RATE_LIMITED" });
    assert.equal(parsed?.code, "RATE_LIMITED");
  });
});

describe("provider normalization (TikTok)", () => {
  test("auth codes become EXTERNAL_AUTH_EXPIRED non-retryable", () => {
    const raw = { code: "token_expired", message: "expired", httpStatus: 401 };
    const c = classifyTiktokError(raw);
    assert.equal(c.code, "EXTERNAL_AUTH_EXPIRED");
    assert.equal(c.retryable, false);
    const err = normalizeProviderError("tiktok", raw, "TikTok access expired or was revoked.");
    assert.ok(err instanceof ExternalProviderError);
    assert.equal(err.retryable, false);
    assert.equal(err.safeMessage, "TikTok access expired or was revoked.");
  });

  test("spam/rate codes become retryable PROVIDER_REJECTED", () => {
    for (const code of ["spam_risk_too_many_posts", "rate_limit_exceeded", "reached_active_user_cap"]) {
      const err = normalizeProviderError("tiktok", { code, httpStatus: 429 }, "hit its daily publishing limit");
      assert.equal(err.code, "PROVIDER_REJECTED");
      assert.equal(err.retryable, true);
    }
  });

  test("provider 5xx becomes UPSTREAM_UNAVAILABLE retryable", () => {
    const err = normalizeProviderError("tiktok", { code: "http_500", httpStatus: 500 }, "TikTok request failed");
    assert.equal(err.code, "UPSTREAM_UNAVAILABLE");
    assert.equal(err.retryable, true);
  });

  test("terminal rejection stays non-retryable", () => {
    const err = normalizeProviderError(
      "tiktok",
      { code: "privacy_level_option_mismatch", httpStatus: 400 },
      "TikTok rejected the privacy setting."
    );
    assert.equal(err.code, "PROVIDER_REJECTED");
    assert.equal(err.retryable, false);
  });

  test("missing configuration becomes ProviderError", () => {
    const err = normalizeProviderError("tiktok", new Error("TikTok is not configured"), "TikTok is not configured");
    assert.ok(err instanceof ProviderError);
    assert.equal(err.retryable, false);
  });

  test("DomainError passes through untouched", () => {
    const original = new ExternalProviderError("x", { provider: "tiktok" });
    assert.equal(normalizeProviderError("tiktok", original), original);
  });
});

describe("client parsing regression", () => {
  test("old { error: string } keeps working", () => {
    const parsed = parseApiError({ error: "Failed to schedule post." });
    assert.equal(parsed.code, null);
    assert.equal(parsed.message, "Failed to schedule post.");
    assert.equal(typeof parsed.message, "string");
  });

  test("new flat shape resolves code + details", () => {
    const parsed = parseApiError({
      error: "Monthly post limit reached.",
      code: "ENTITLEMENT_DENIED",
      details: { upgradeTo: "growth" },
    });
    assert.equal(parsed.code, "ENTITLEMENT_DENIED");
    assert.equal(parsed.upgradeTo, "growth");
  });

  test("legacy UPGRADE_REQUIRED maps to ENTITLEMENT_DENIED", () => {
    const parsed = parseApiError({ code: "UPGRADE_REQUIRED", reason: "limit", upgradeTo: "growth" });
    assert.equal(parsed.code, "ENTITLEMENT_DENIED");
    assert.equal(parsed.upgradeTo, "growth");
  });

  test("RATE_LIMITED exposes retryAfterSeconds", () => {
    const parsed = parseApiError({ error: "slow down", code: "RATE_LIMITED", details: { retryAfterSeconds: 42 } });
    assert.equal(parsed.retryable, true);
    assert.equal(parsed.retryAfterSeconds, 42);
  });

  test("unknown body falls back without throwing", () => {
    assert.equal(parseApiError(null).message, "Something went wrong. Please try again.");
    assert.equal(parseApiError({}).message, "Something went wrong. Please try again.");
    assert.equal(getErrorText(null), "Something went wrong. Please try again.");
  });

  test("otp substring mapping preserved", () => {
    assert.match(mapOtpError("code expired"), /expired/);
    assert.match(mapOtpError("Invalid code"), /Incorrect/);
  });
});

describe("base DomainError codes without dedicated classes", () => {
  test("NOT_FOUND / CONFLICT / INTERNAL via base class", () => {
    const nf = new DomainError("Post not found", { code: "NOT_FOUND", status: 404 });
    const cf = new DomainError("Already handled", { code: "CONFLICT", status: 409 });
    assert.equal(toApiResponse(nf).status, 404);
    assert.equal(toApiResponse(cf).status, 409);
    assert.equal(toApiResponse(cf).body.code, "CONFLICT");
  });
});

describe("reportError with DomainError", () => {
  test("never throws for any unified error class", () => {
    const values: unknown[] = [
      new ValidationError("bad input"),
      new AuthorizationError("Not authenticated"),
      new AuthorizationError("Forbidden", { status: 403 }),
      new EntitlementError("limit", { upgradeTo: "growth" }),
      new RateLimitError("slow down", { retryAfterSeconds: 5 }),
      new ProviderError("not configured", { provider: "tiktok" }),
      new ExternalProviderError("rate limited", {
        provider: "tiktok",
        providerCode: "rate_limit_exceeded",
      }),
      new DomainError("missing", { code: "NOT_FOUND", status: 404 }),
      new DomainError("boom", { code: "INTERNAL", status: 500 }),
    ];
    for (const value of values) {
      assert.doesNotThrow(() => reportError("test", "unified error", value));
    }
  });
});
