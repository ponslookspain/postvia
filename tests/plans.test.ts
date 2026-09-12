import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPlan, parsePlanParam, PLANS } from "../src/lib/plans";

describe("plans", () => {
  test("parses only known plan ids", () => {
    assert.equal(parsePlanParam("starter"), "starter");
    assert.equal(parsePlanParam("growth"), "growth");
    assert.equal(parsePlanParam("scale"), "scale");
    assert.equal(parsePlanParam("free"), null);
    assert.equal(parsePlanParam(undefined), null);
    assert.equal(parsePlanParam(""), null);
  });

  test("three paid tiers, no free tier", () => {
    assert.equal(PLANS.length, 3);
    assert.deepEqual(
      PLANS.map((plan) => plan.price),
      [10, 20, 50]
    );
    assert.ok(
      PLANS.every((plan) => plan.price > 0),
      "no free tier may exist"
    );
    assert.equal(PLANS.filter((plan) => plan.highlighted).length, 1);
  });

  test("getPlan falls back to growth", () => {
    assert.equal(getPlan("growth").name, "Growth");
    assert.equal(getPlan("starter").price, 10);
  });
});
