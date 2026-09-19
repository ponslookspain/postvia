import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPeriodRules,
  buildBillingView,
  canAddMediaToPost,
  canBulkSchedule,
  canConnectAccount,
  canCreatePost,
  canRetry,
  canUploadVideoSize,
  canUseCalendar,
  canUseFeature,
  getDisplayPostsUsed,
  getRemainingQuota,
  getUpgradeTarget,
  isAdminEmail,
  resolveEffectiveFromRows,
  toDbPlan,
  toPlanId,
  toPlanIdSafe,
  type EffectiveSubscription,
} from "../src/lib/entitlements";
import { FEATURE_KEYS, getPlan, type FeatureKey } from "../src/lib/plans";

const DAY = 86_400_000;
const NOW = new Date("2026-09-12T12:00:00Z").getTime();

function eff(
  plan: EffectiveSubscription["plan"],
  overrides: Partial<EffectiveSubscription> = {}
): EffectiveSubscription {
  return {
    plan,
    status: "ACTIVE",
    bypass: false,
    source: "subscription",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: getPlan(plan).entitlements,
    ...overrides,
  };
}

function usage(
  postsThisMonth = 0,
  accounts: Record<string, number> = {},
  identityPostsUsed: number | null = null
) {
  return {
    postsThisMonth,
    monthStart: new Date("2026-09-01T00:00:00Z"),
    accountsByPlatform: accounts,
    totalAccounts: Object.values(accounts).reduce((a, b) => a + b, 0),
    scheduledPosts: 0,
    identityPostsUsed,
  };
}

function storedRow(
  plan: "FREE" | "GROWTH" | "SCALE",
  extra: Record<string, unknown> = {}
) {
  return {
    plan,
    status: "ACTIVE" as const,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubId: null,
    ...extra,
  };
}

describe("plan mapping and upgrade targets", () => {
  test("db <-> plan id mapping round-trips", () => {
    assert.equal(toPlanId("FREE"), "free");
    assert.equal(toPlanId("SCALE"), "scale");
    assert.equal(toDbPlan("growth"), "GROWTH");
  });
  test("legacy STARTER safely resolves to free", () => {
    assert.equal(toPlanIdSafe("STARTER"), "free");
    assert.equal(toPlanIdSafe("GROWTH"), "growth");
    assert.equal(toPlanIdSafe("whatever"), "free");
  });
  test("upgrade path free -> growth -> scale -> null", () => {
    assert.equal(getUpgradeTarget("free"), "growth");
    assert.equal(getUpgradeTarget("growth"), "scale");
    assert.equal(getUpgradeTarget("scale"), null);
  });
});

describe("default user resolves to FREE", () => {
  test("missing subscription means active free from default source", () => {
    const resolved = resolveEffectiveFromRows({
      subscription: null,
      testOverride: null,
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(resolved.plan, "free");
    assert.equal(resolved.status, "ACTIVE");
    assert.equal(resolved.source, "default");
    assert.equal(resolved.bypass, false);
    assert.equal(resolved.entitlements.monthlyPosts, 15);
  });
});

describe("period rules", () => {
  const future = new Date(NOW + 10 * DAY);
  const past = new Date(NOW - DAY);
  test("active subscription stays active", () => {
    const r = applyPeriodRules(
      { plan: "GROWTH", status: "ACTIVE", cancelAtPeriodEnd: false, currentPeriodEnd: future },
      NOW
    );
    assert.deepEqual(r, { plan: "growth", status: "ACTIVE", expired: false });
  });
  test("cancelAtPeriodEnd with future end means CANCELLING with access", () => {
    const r = applyPeriodRules(
      { plan: "GROWTH", status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: future },
      NOW
    );
    assert.equal(r.status, "CANCELLING");
    assert.equal(r.expired, false);
    assert.equal(r.plan, "growth");
  });
  test("paid cancellation keeps access until the end, then FREE", () => {
    const before = applyPeriodRules(
      { plan: "SCALE", status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: future },
      NOW
    );
    assert.equal(before.status, "CANCELLING");
    assert.equal(canCreatePost(eff("scale"), usage(9999)).ok, true);
    const after = applyPeriodRules(
      { plan: "SCALE", status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: past },
      NOW
    );
    assert.deepEqual(after, { plan: "free", status: "EXPIRED", expired: true });
  });
  test("CANCELED status means expired free", () => {
    const r = applyPeriodRules(
      { plan: "GROWTH", status: "CANCELED", cancelAtPeriodEnd: false, currentPeriodEnd: null },
      NOW
    );
    assert.deepEqual(r, { plan: "free", status: "CANCELED", expired: true });
  });
  test("PAST_DUE keeps the plan flagged", () => {
    const r = applyPeriodRules(
      { plan: "GROWTH", status: "PAST_DUE", cancelAtPeriodEnd: false, currentPeriodEnd: future },
      NOW
    );
    assert.deepEqual(r, { plan: "growth", status: "PAST_DUE", expired: false });
  });
});

describe("free 15 post quota", () => {
  test("allows below the limit, denies at the limit with upgrade to growth", () => {
    assert.deepEqual(canCreatePost(eff("free"), usage(14)), { ok: true });
    const denied = canCreatePost(eff("free"), usage(15));
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "UPGRADE_REQUIRED");
      assert.equal(denied.upgradeTo, "growth");
      assert.match(denied.reason, /15/);
    }
  });
  test("growth allows 300, scale unlimited", () => {
    assert.deepEqual(canCreatePost(eff("growth"), usage(299)), { ok: true });
    assert.equal(canCreatePost(eff("growth"), usage(300)).ok, false);
    assert.deepEqual(canCreatePost(eff("scale"), usage(10_000)), { ok: true });
  });
  test("denial contract shape matches the API contract", () => {
    const denied = canCreatePost(eff("free"), usage(99));
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.deepEqual(Object.keys(denied).sort(), [
        "code",
        "ok",
        "reason",
        "upgradeTo",
      ]);
    }
  });
});

describe("account quota (global total per user)", () => {
  test("free allows one total account, second on any platform needs growth", () => {
    assert.deepEqual(canConnectAccount(eff("free"), 0), { ok: true });
    const denied = canConnectAccount(eff("free"), 1);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.upgradeTo, "growth");
  });
  test("growth allows five total, sixth denied; scale unlimited", () => {
    assert.deepEqual(canConnectAccount(eff("growth"), 4), { ok: true });
    assert.equal(canConnectAccount(eff("growth"), 5).ok, false);
    assert.deepEqual(canConnectAccount(eff("scale"), 99), { ok: true });
  });
});

describe("bulk, calendar, retry", () => {
  test("free bulk denied, growth caps at 10, scale caps at 10", () => {
    const denied = canBulkSchedule(eff("free"), 3);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.upgradeTo, "growth");
    assert.deepEqual(canBulkSchedule(eff("growth"), 10), { ok: true });
    assert.equal(canBulkSchedule(eff("growth"), 11).ok, false);
    assert.deepEqual(canBulkSchedule(eff("scale"), 10), { ok: true });
    assert.equal(canBulkSchedule(eff("scale"), 11).ok, false);
  });
  test("calendar and retry follow flags on every plan", () => {
    for (const plan of ["free", "growth", "scale"] as const) {
      assert.deepEqual(canUseCalendar(eff(plan)), { ok: true });
      assert.deepEqual(canRetry(eff(plan)), { ok: true });
    }
  });
});

describe("plan-level media limits (Free's tighter video/count caps)", () => {
  const MB = 1024 * 1024;

  test("free video: 50MB fits, 50MB+1 needs an upgrade", () => {
    assert.deepEqual(canUploadVideoSize(eff("free"), 50 * MB), { ok: true });
    const denied = canUploadVideoSize(eff("free"), 50 * MB + 1);
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.upgradeTo, "growth");
      assert.match(denied.reason, /50 MB/);
    }
  });

  test("growth and scale video: 100MB fits, 100MB+1 does not", () => {
    assert.deepEqual(canUploadVideoSize(eff("growth"), 100 * MB), { ok: true });
    assert.equal(canUploadVideoSize(eff("growth"), 100 * MB + 1).ok, false);
    assert.deepEqual(canUploadVideoSize(eff("scale"), 100 * MB), { ok: true });
    assert.equal(canUploadVideoSize(eff("scale"), 100 * MB + 1).ok, false);
  });

  test("free media count: first two files fit, a third needs an upgrade", () => {
    assert.deepEqual(canAddMediaToPost(eff("free"), 0), { ok: true });
    assert.deepEqual(canAddMediaToPost(eff("free"), 1), { ok: true });
    const denied = canAddMediaToPost(eff("free"), 2);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.upgradeTo, "growth");
  });

  test("growth and scale media count: four files fit, a fifth does not", () => {
    assert.deepEqual(canAddMediaToPost(eff("growth"), 3), { ok: true });
    assert.equal(canAddMediaToPost(eff("growth"), 4).ok, false);
    assert.deepEqual(canAddMediaToPost(eff("scale"), 3), { ok: true });
    assert.equal(canAddMediaToPost(eff("scale"), 4).ok, false);
  });

  test("bypass grants both regardless of plan", () => {
    const bypassed = eff("free", { bypass: true });
    assert.deepEqual(canUploadVideoSize(bypassed, 500 * MB), { ok: true });
    assert.deepEqual(canAddMediaToPost(bypassed, 99), { ok: true });
  });
});

describe("remaining quota", () => {
  test("free counts down, scale shows null", () => {
    assert.equal(getRemainingQuota(eff("free"), usage(12)).postsLeft, 3);
    assert.equal(getRemainingQuota(eff("free"), usage(15)).postsLeft, 0);
    assert.equal(getRemainingQuota(eff("scale"), usage(500)).postsLeft, null);
  });
  test("free remaining follows the shared identity usage when known", () => {
    // New user B: personal 0, identity already at 2 → 13 left.
    assert.equal(
      getRemainingQuota(eff("free"), usage(0, {}, 2)).postsLeft,
      13
    );
    // Exhausted identity → 0 left even with personal usage below limit.
    assert.equal(
      getRemainingQuota(eff("free"), usage(1, {}, 15)).postsLeft,
      0
    );
  });
});

describe("display posts used (identity-level Free progress)", () => {
  test("free shows identity usage when known, else personal", () => {
    assert.equal(getDisplayPostsUsed(eff("free"), usage(0, {}, 2)), 2);
    assert.equal(getDisplayPostsUsed(eff("free"), usage(1, {}, 3)), 3);
    assert.equal(getDisplayPostsUsed(eff("free"), usage(4)), 4);
  });
  test("paid plans and bypass keep the per-user counter", () => {
    assert.equal(getDisplayPostsUsed(eff("growth"), usage(1, {}, 15)), 1);
    assert.equal(getDisplayPostsUsed(eff("scale"), usage(7, {}, 15)), 7);
    assert.equal(
      getDisplayPostsUsed(eff("free", { bypass: true }), usage(1, {}, 15)),
      1
    );
  });
});

describe("downgrade preserves data (gates only new actions)", () => {
  test("over-limit usage still reads fine, only creation is denied", () => {
    // A user downgraded to free with 18 posts keeps everything; only new
    // posts are blocked.
    const denied = canCreatePost(eff("free"), usage(18));
    assert.equal(denied.ok, false);
    const quota = getRemainingQuota(eff("free"), usage(18));
    assert.equal(quota.postsLeft, 0);
  });
});

describe("admin bypass", () => {
  const bypass = eff("scale", { bypass: true, source: "admin-override" });
  test("bypass allows everything", () => {
    assert.deepEqual(canCreatePost(bypass, usage(9999)), { ok: true });
    assert.deepEqual(canConnectAccount(bypass, 99), { ok: true });
    assert.deepEqual(canBulkSchedule(bypass, 500), { ok: true });
    assert.equal(getRemainingQuota(bypass, usage(9999)).postsLeft, null);
  });
  test("bypass resolves only for admins with an override row", () => {
    const resolved = resolveEffectiveFromRows({
      subscription: storedRow("FREE"),
      testOverride: {
        mode: "BYPASS",
        plan: "FREE",
        subStatus: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      isAdmin: true,
      nowMs: NOW,
    });
    assert.equal(resolved.bypass, true);
    assert.equal(resolved.source, "admin-override");
  });
  test("non-admins never see the override, even if a row exists", () => {
    const resolved = resolveEffectiveFromRows({
      subscription: storedRow("FREE"),
      testOverride: {
        mode: "BYPASS",
        plan: "SCALE",
        subStatus: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(resolved.bypass, false);
    assert.equal(resolved.plan, "free");
    assert.equal(resolved.source, "subscription");
  });
});

describe("admin plan enforcement", () => {
  function enforced(
    plan: "FREE" | "GROWTH" | "SCALE",
    extra: Record<string, unknown> = {}
  ) {
    return resolveEffectiveFromRows({
      subscription: null,
      testOverride: {
        mode: "ENFORCEMENT",
        plan,
        subStatus: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        ...extra,
      },
      isAdmin: true,
      nowMs: NOW,
    });
  }
  test("FREE enforcement behaves like free", () => {
    const resolved = enforced("FREE");
    assert.equal(resolved.plan, "free");
    assert.equal(resolved.bypass, false);
    assert.equal(canConnectAccount(resolved, 1).ok, false);
    assert.equal(canCreatePost(resolved, usage(15)).ok, false);
    assert.equal(canBulkSchedule(resolved, 1).ok, false);
  });
  test("GROWTH enforcement behaves like growth", () => {
    const resolved = enforced("GROWTH");
    assert.equal(resolved.plan, "growth");
    assert.deepEqual(canConnectAccount(resolved, 1), { ok: true });
    assert.deepEqual(canBulkSchedule(resolved, 10), { ok: true });
    assert.equal(canCreatePost(resolved, usage(300)).ok, false);
  });
  test("SCALE enforcement behaves like scale", () => {
    const resolved = enforced("SCALE");
    assert.deepEqual(canCreatePost(resolved, usage(9999)), { ok: true });
    assert.deepEqual(canConnectAccount(resolved, 99), { ok: true });
  });
  test("admin cancellation simulation keeps access until the end", () => {
    const future = new Date(NOW + 5 * DAY);
    const resolved = enforced("GROWTH", {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: future,
    });
    assert.equal(resolved.status, "CANCELLING");
    assert.equal(resolved.plan, "growth");
    assert.deepEqual(canCreatePost(resolved, usage(0)), { ok: true });
  });
  test("admin expiration simulation drops to free", () => {
    const past = new Date(NOW - DAY);
    const resolved = enforced("GROWTH", {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: past,
    });
    assert.equal(resolved.status, "EXPIRED");
    assert.equal(resolved.plan, "free");
  });
});

describe("isAdminEmail", () => {
  test("matches operator list, case-insensitive, never hardcoded", () => {
    process.env.ADMIN_EMAILS = "Boss@Example.com, dev@example.com";
    assert.equal(isAdminEmail("boss@example.com"), true);
    assert.equal(isAdminEmail("DEV@example.com"), true);
    assert.equal(isAdminEmail("user@example.com"), false);
    assert.equal(isAdminEmail(null), false);
    delete process.env.ADMIN_EMAILS;
    assert.equal(isAdminEmail("boss@example.com"), false);
  });
});

describe("billing feature registry (E3 single gate)", () => {
  test("FEATURE_KEYS covers every boolean entitlement", () => {
    assert.deepEqual([...FEATURE_KEYS], ["calendar", "bulk", "retryReschedule"]);
    const keys: readonly FeatureKey[] = FEATURE_KEYS;
    assert.equal(keys.length, 3);
  });

  test("canUseFeature matches the legacy per-feature gates exactly", () => {
    for (const plan of ["free", "growth", "scale"] as const) {
      assert.deepEqual(canUseFeature(eff(plan), "calendar"), canUseCalendar(eff(plan)));
      assert.deepEqual(canUseFeature(eff(plan), "retryReschedule"), canRetry(eff(plan)));
    }
    // Denial messages preserved verbatim.
    const denied = canUseFeature(eff("free", { entitlements: { ...getPlan("free").entitlements, calendar: false } }), "calendar");
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "UPGRADE_REQUIRED");
      assert.equal(denied.reason, "The content calendar is not included in this plan.");
    }
    // Bypass grants every feature.
    const bypassed = eff("free", { bypass: true });
    for (const key of FEATURE_KEYS) {
      assert.deepEqual(canUseFeature(bypassed, key), { ok: true });
    }
  });

  test("buildBillingView assembles the documented view model", () => {
    const view = buildBillingView({
      effective: eff("growth", {
        currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
      }),
      usage: usage(7, { THREADS: 2, X: 1 }),
      subscription: {
        plan: "GROWTH",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
        cancelAtPeriodEnd: false,
        stripeCustomerId: "cus_1",
        stripeSubId: "sub_1",
      },
      checkoutResult: null,
    });
    assert.equal(view.plan, "growth");
    assert.equal(view.status, "ACTIVE");
    assert.equal(view.price, 20);
    assert.equal(view.period, "month");
    assert.equal(view.currentPeriodEnd, "2026-10-01T00:00:00.000Z");
    assert.equal(view.postsUsed, 7);
    assert.equal(view.postsLimit, 300);
    assert.equal(view.totalAccounts, 3);
    assert.equal(view.accountsLimit, 5);
    assert.equal(view.checkoutPending, false);
    assert.equal(view.hasBillingCustomer, true);
  });
});
