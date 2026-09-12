import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPeriodRules,
  canBulkSchedule,
  canConnectAccount,
  canCreatePost,
  canRetry,
  canUseCalendar,
  getRemainingQuota,
  getUpgradeTarget,
  isAdminEmail,
  resolveEffectiveFromRows,
  toDbPlan,
  toPlanId,
  type EffectiveSubscription,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";

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

function usage(postsThisMonth = 0, accounts: Record<string, number> = {}) {
  return {
    postsThisMonth,
    monthStart: new Date("2026-09-01T00:00:00Z"),
    accountsByPlatform: accounts,
    totalAccounts: Object.values(accounts).reduce((a, b) => a + b, 0),
    scheduledPosts: 0,
  };
}

describe("plan mapping and upgrade targets", () => {
  test("db <-> plan id mapping round-trips", () => {
    assert.equal(toPlanId("STARTER"), "starter");
    assert.equal(toPlanId("SCALE"), "scale");
    assert.equal(toDbPlan("growth"), "GROWTH");
  });
  test("upgrade path starter -> growth -> scale -> null", () => {
    assert.equal(getUpgradeTarget("starter"), "growth");
    assert.equal(getUpgradeTarget("growth"), "scale");
    assert.equal(getUpgradeTarget("scale"), null);
  });
});

describe("missing subscription defaults to starter", () => {
  test("no row means active starter from default source", () => {
    const resolved = resolveEffectiveFromRows({
      subscription: null,
      testOverride: null,
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(resolved.plan, "starter");
    assert.equal(resolved.status, "ACTIVE");
    assert.equal(resolved.source, "default");
    assert.equal(resolved.bypass, false);
    assert.equal(resolved.entitlements.monthlyPosts, 30);
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
  test("past end means EXPIRED starter", () => {
    const r = applyPeriodRules(
      { plan: "SCALE", status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: past },
      NOW
    );
    assert.deepEqual(r, { plan: "starter", status: "EXPIRED", expired: true });
  });
  test("CANCELED status means expired starter", () => {
    const r = applyPeriodRules(
      { plan: "GROWTH", status: "CANCELED", cancelAtPeriodEnd: false, currentPeriodEnd: null },
      NOW
    );
    assert.deepEqual(r, { plan: "starter", status: "CANCELED", expired: true });
  });
  test("PAST_DUE keeps the plan flagged", () => {
    const r = applyPeriodRules(
      { plan: "GROWTH", status: "PAST_DUE", cancelAtPeriodEnd: false, currentPeriodEnd: future },
      NOW
    );
    assert.deepEqual(r, { plan: "growth", status: "PAST_DUE", expired: false });
  });
});

describe("monthly post quota", () => {
  test("starter allows below the limit, denies at the limit with upgrade", () => {
    assert.deepEqual(canCreatePost(eff("starter"), usage(29)), { ok: true });
    const denied = canCreatePost(eff("starter"), usage(30));
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "UPGRADE_REQUIRED");
      assert.equal(denied.upgradeTo, "growth");
      assert.match(denied.reason, /30/);
    }
  });
  test("scale has no post cap", () => {
    assert.deepEqual(
      canCreatePost(eff("scale"), usage(10_000)),
      { ok: true }
    );
  });
});

describe("account quota", () => {
  test("starter allows one per platform, second needs growth", () => {
    assert.deepEqual(canConnectAccount(eff("starter"), "THREADS", 0), { ok: true });
    const denied = canConnectAccount(eff("starter"), "THREADS", 1);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.upgradeTo, "growth");
  });
  test("scale connects unlimited", () => {
    assert.deepEqual(canConnectAccount(eff("scale"), "X", 99), { ok: true });
  });
});

describe("bulk, calendar, retry", () => {
  test("starter cannot bulk, growth caps at 10", () => {
    const denied = canBulkSchedule(eff("starter"), 3);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.upgradeTo, "growth");
    assert.deepEqual(canBulkSchedule(eff("growth"), 10), { ok: true });
    assert.equal(canBulkSchedule(eff("growth"), 11).ok, false);
  });
  test("calendar and retry follow flags", () => {
    assert.deepEqual(canUseCalendar(eff("starter")), { ok: true });
    assert.deepEqual(canRetry(eff("starter")), { ok: true });
  });
});

describe("remaining quota", () => {
  test("starter shows countdown, scale shows null", () => {
    assert.equal(getRemainingQuota(eff("starter"), usage(29)).postsLeft, 1);
    assert.equal(getRemainingQuota(eff("starter"), usage(30)).postsLeft, 0);
    assert.equal(getRemainingQuota(eff("scale"), usage(500)).postsLeft, null);
  });
});

describe("admin bypass", () => {
  const bypass = eff("scale", { bypass: true, source: "admin-override" });
  test("bypass allows everything", () => {
    assert.deepEqual(canCreatePost(bypass, usage(9999)), { ok: true });
    assert.deepEqual(canConnectAccount(bypass, "X", 99), { ok: true });
    assert.deepEqual(canBulkSchedule(bypass, 500), { ok: true });
    assert.equal(getRemainingQuota(bypass, usage(9999)).postsLeft, null);
  });
  test("bypass resolves only for admins with an override row", () => {
    const resolved = resolveEffectiveFromRows({
      subscription: {
        plan: "STARTER",
        status: "ACTIVE",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubId: null,
      },
      testOverride: {
        mode: "BYPASS",
        plan: "STARTER",
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
      subscription: {
        plan: "STARTER",
        status: "ACTIVE",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubId: null,
      },
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
    assert.equal(resolved.plan, "starter");
    assert.equal(resolved.source, "subscription");
  });
});

describe("admin plan enforcement", () => {
  function enforced(
    plan: "STARTER" | "GROWTH" | "SCALE",
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
  test("STARTER enforcement behaves like starter", () => {
    const resolved = enforced("STARTER");
    assert.equal(resolved.plan, "starter");
    assert.equal(resolved.bypass, false);
    assert.equal(
      canConnectAccount(resolved, "THREADS", 1).ok,
      false
    );
    assert.equal(canCreatePost(resolved, usage(30)).ok, false);
    assert.equal(canBulkSchedule(resolved, 1).ok, false);
  });
  test("GROWTH enforcement behaves like growth", () => {
    const resolved = enforced("GROWTH");
    assert.equal(resolved.plan, "growth");
    assert.deepEqual(canConnectAccount(resolved, "THREADS", 1), { ok: true });
    assert.deepEqual(canBulkSchedule(resolved, 10), { ok: true });
    assert.equal(canCreatePost(resolved, usage(300)).ok, false);
  });
  test("SCALE enforcement behaves like scale", () => {
    const resolved = enforced("SCALE");
    assert.deepEqual(canCreatePost(resolved, usage(9999)), { ok: true });
    assert.deepEqual(canConnectAccount(resolved, "X", 99), { ok: true });
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
  test("admin expiration simulation drops to starter", () => {
    const past = new Date(NOW - DAY);
    const resolved = enforced("GROWTH", {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: past,
    });
    assert.equal(resolved.status, "EXPIRED");
    assert.equal(resolved.plan, "starter");
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
