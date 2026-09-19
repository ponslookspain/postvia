import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPlan, parsePlanParam, PLANS } from "../src/lib/plans";

describe("plans", () => {
  test("parses only known plan ids", () => {
    assert.equal(parsePlanParam("free"), "free");
    assert.equal(parsePlanParam("growth"), "growth");
    assert.equal(parsePlanParam("scale"), "scale");
    assert.equal(parsePlanParam("starter"), null);
    assert.equal(parsePlanParam(undefined), null);
    assert.equal(parsePlanParam(""), null);
  });

  test("free entry tier plus two paid tiers, growth highlighted", () => {
    assert.equal(PLANS.length, 3);
    assert.deepEqual(
      PLANS.map((plan) => plan.price),
      [0, 20, 50]
    );
    assert.equal(PLANS.filter((plan) => plan.highlighted).length, 1);
    assert.equal(
      PLANS.find((plan) => plan.highlighted)?.id,
      "growth"
    );
  });

  test("getPlan falls back to growth", () => {
    assert.equal(getPlan("growth").name, "Growth");
    assert.equal(getPlan("free").price, 0);
  });

  test("entitlement table matches the product contract", () => {
    const free = getPlan("free").entitlements;
    assert.equal(free.maxTotalAccounts, 1);
    assert.equal(free.monthlyPosts, 15);
    assert.equal(free.maxBulkVideos, 0);
    assert.equal(free.bulk, false);
    assert.equal(free.calendar, true);
    const growth = getPlan("growth").entitlements;
    assert.equal(growth.maxTotalAccounts, 5);
    assert.equal(growth.monthlyPosts, 300);
    assert.equal(growth.maxBulkVideos, 10);
    const scale = getPlan("scale").entitlements;
    assert.equal(scale.maxTotalAccounts, null);
    assert.equal(scale.monthlyPosts, null);
    assert.equal(scale.maxBulkVideos, 10);
  });

  test("Free's media limits are tighter than paid's, never looser", () => {
    const free = getPlan("free").entitlements;
    const growth = getPlan("growth").entitlements;
    const scale = getPlan("scale").entitlements;

    assert.equal(free.maxVideoBytes, 50 * 1024 * 1024);
    assert.equal(growth.maxVideoBytes, 100 * 1024 * 1024);
    assert.equal(scale.maxVideoBytes, 100 * 1024 * 1024);
    assert.ok(free.maxVideoBytes < growth.maxVideoBytes);

    assert.equal(free.maxMediaPerPost, 2);
    assert.equal(growth.maxMediaPerPost, 4);
    assert.equal(scale.maxMediaPerPost, 4);
    assert.ok(free.maxMediaPerPost < growth.maxMediaPerPost);

    assert.equal(free.mediaRetentionMs, 90 * 86_400_000);
    assert.equal(growth.mediaRetentionMs, 365 * 86_400_000);
    assert.equal(scale.mediaRetentionMs, 365 * 86_400_000);
    assert.ok(
      (free.mediaRetentionMs ?? Infinity) < (growth.mediaRetentionMs ?? Infinity)
    );

    // Neither plan's media limits ever exceed the absolute platform
    // ceiling (@/domain/media/policy) — a plan can only narrow it.
    for (const plan of [free, growth, scale]) {
      assert.ok(plan.maxVideoBytes <= 100 * 1024 * 1024);
      assert.ok(plan.maxMediaPerPost <= 4);
    }
  });
});
