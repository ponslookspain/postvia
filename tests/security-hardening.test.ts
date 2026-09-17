import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { authorizeMediaUpload } from "../src/lib/media-upload";
import {
  applyPeriodRules,
  canCreatePost,
  resolveEffectiveFromRows,
  toPlanIdSafe,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";
import {
  OTP_SEND_IP_MAX_PER_HOUR,
  OTP_SEND_MAX_PER_HOUR,
  OTP_VERIFY_IP_MAX_PER_WINDOW,
  OTP_VERIFY_MAX_PER_WINDOW,
} from "../src/lib/otp-config";
import {
  WRITE_LIMIT_ACCOUNT_DELETE,
  WRITE_LIMIT_CREATOR_INFO,
  WRITE_LIMIT_MEDIA_STATUS,
  WRITE_LIMIT_MEDIA_UPLOAD,
  WRITE_LIMIT_POSTS_WRITE,
} from "../src/lib/abuse";
import {
  createTiktokMediaUrl,
  getBridgeSecret,
  verifyTiktokMediaToken,
} from "../src/lib/tiktok-media-bridge";

const NOW = new Date("2026-09-12T12:00:00Z").getTime();
const MEDIA_ID = "cm3diaAAAABBBBCCCCDDDD";
const BASE = "https://postvia.online";

function freeUsage() {
  return {
    postsThisMonth: 0,
    monthStart: new Date("2026-09-01T00:00:00Z"),
    accountsByPlatform: {},
    totalAccounts: 0,
    scheduledPosts: 0,
    identityPostsUsed: null,
  };
}

describe("security hardening: media ownership boundary", () => {
  test("User B cannot authorize upload against User A's post", () => {
    const result = authorizeMediaUpload({
      user: { id: "user-B" },
      post: { userId: "user-A" },
      statedPostId: "post-A",
    });
    assert.deepEqual(result, {
      ok: false,
      status: 404,
      error: "Post not found",
    });
  });

  test("owner authorizes upload against own post", () => {
    const result = authorizeMediaUpload({
      user: { id: "user-A" },
      post: { userId: "user-A" },
      statedPostId: "post-A",
    });
    assert.deepEqual(result, {
      ok: true,
      userId: "user-A",
      postId: "post-A",
    });
  });

  test("missing post stays 404 regardless of caller", () => {
    assert.deepEqual(
      authorizeMediaUpload({
        user: { id: "user-B" },
        post: null,
        statedPostId: "post-A",
      }),
      { ok: false, status: 404, error: "Post not found" }
    );
  });
});

describe("security hardening: selectedPlan is never an entitlement", () => {
  test("FREE subscription row resolves to free even with paid intent elsewhere", () => {
    // resolveEffectiveFromRows takes NO selectedPlan input by construction:
    // only the Subscription row (+ admin override) decides.
    const effective = resolveEffectiveFromRows({
      subscription: {
        plan: "FREE",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        stripeCustomerId: null,
        stripeSubId: null,
      },
      testOverride: null,
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(effective.plan, "free");
    assert.equal(effective.source, "subscription");
  });

  test("free effective plan is quota-gated, not intent-gated", () => {
    const gate = canCreatePost(
      {
        plan: "free",
        status: "ACTIVE",
        bypass: false,
        source: "subscription",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        entitlements: getPlan("free").entitlements,
      },
      { ...freeUsage(), postsThisMonth: 15 }
    );
    assert.equal(gate.ok, false);
  });

  test("unknown stored plan degrades to free, never paid", () => {
    assert.equal(toPlanIdSafe("GROWTH_HACKED" as never), "free");
  });
});

describe("security hardening: billing period rules still fail closed", () => {
  test("CANCELED revokes paid entitlements", () => {
    const r = applyPeriodRules(
      {
        plan: "GROWTH",
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      NOW
    );
    assert.equal(r.plan, "free");
    assert.equal(r.expired, true);
  });

  test("UNPAID revokes paid entitlements", () => {
    const r = applyPeriodRules(
      {
        plan: "SCALE",
        status: "UNPAID",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      NOW
    );
    assert.equal(r.plan, "free");
    assert.equal(r.expired, true);
  });

  test("cancel-at-period-end without period end never reads as paid", () => {
    const r = applyPeriodRules(
      {
        plan: "GROWTH",
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: null,
      },
      NOW
    );
    assert.equal(r.plan, "free");
  });
});

describe("security hardening: TikTok bridge fail-closed, no key reuse", () => {
  test("missing TIKTOK_BRIDGE_SECRET fails closed even with BETTER_AUTH_SECRET set", () => {
    const savedBridge = process.env.TIKTOK_BRIDGE_SECRET;
    const savedAuth = process.env.BETTER_AUTH_SECRET;
    try {
      delete process.env.TIKTOK_BRIDGE_SECRET;
      process.env.BETTER_AUTH_SECRET = "auth-secret-must-not-work";
      assert.equal(getBridgeSecret(), "");
      assert.throws(
        () =>
          createTiktokMediaUrl({ mediaId: MEDIA_ID, baseUrl: BASE, nowMs: NOW }),
        /not configured/
      );
      assert.deepEqual(
        verifyTiktokMediaToken({
          mediaId: MEDIA_ID,
          expires: "9999999999",
          sig: "x",
          nowMs: NOW,
        }),
        { ok: false, reason: "unconfigured" }
      );
    } finally {
      if (savedBridge === undefined) delete process.env.TIKTOK_BRIDGE_SECRET;
      else process.env.TIKTOK_BRIDGE_SECRET = savedBridge;
      if (savedAuth === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = savedAuth;
    }
  });
});

describe("security hardening: rate-limit budgets", () => {
  test("new write scopes have sane, non-breaking budgets", () => {
    assert.equal(WRITE_LIMIT_POSTS_WRITE, 100);
    assert.equal(WRITE_LIMIT_MEDIA_UPLOAD, 200);
    assert.equal(WRITE_LIMIT_MEDIA_STATUS, 600);
    assert.equal(WRITE_LIMIT_ACCOUNT_DELETE, 10);
    assert.equal(WRITE_LIMIT_CREATOR_INFO, 120);
  });

  test("OTP per-IP buckets are roomier than per-email (NAT-safe)", () => {
    assert.ok(OTP_SEND_IP_MAX_PER_HOUR > OTP_SEND_MAX_PER_HOUR);
    assert.ok(OTP_VERIFY_IP_MAX_PER_WINDOW > OTP_VERIFY_MAX_PER_WINDOW);
  });
});
