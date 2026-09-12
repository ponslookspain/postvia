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
    assert.equal(free.maxAccountsPerPlatform, 1);
    assert.equal(free.monthlyPosts, 15);
    assert.equal(free.maxBulkVideos, 0);
    assert.equal(free.bulk, false);
    assert.equal(free.calendar, true);
    const growth = getPlan("growth").entitlements;
    assert.equal(growth.maxAccountsPerPlatform, 5);
    assert.equal(growth.monthlyPosts, 300);
    assert.equal(growth.maxBulkVideos, 10);
    const scale = getPlan("scale").entitlements;
    assert.equal(scale.maxAccountsPerPlatform, null);
    assert.equal(scale.monthlyPosts, null);
    assert.equal(scale.maxBulkVideos, 10);
  });
});
