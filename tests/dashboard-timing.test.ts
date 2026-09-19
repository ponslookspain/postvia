import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_QUERY_KEYS,
  isDashboardTimingEnabled,
  roundMs,
  timeQuery,
} from "../src/lib/dashboard-timing";

describe("timeQuery", () => {
  test("passes the resolved value through untouched", async () => {
    const payload = { rows: [1, 2, 3] };
    const { value, ms } = await timeQuery(async () => payload);
    assert.equal(value, payload);
    assert.equal(typeof ms, "number");
    assert.ok(ms >= 0);
  });

  test("rethrows the original error with identical identity", async () => {
    const boom = new Error("bench-boom");
    await assert.rejects(
      timeQuery(async () => {
        throw boom;
      }),
      (error: unknown) => error === boom,
    );
  });

  test("does not alter rejected reason for non-Error values", async () => {
    await assert.rejects(
      timeQuery(async () => {
        throw "string-reason";
      }),
      (error: unknown) => error === "string-reason",
    );
  });
});

describe("isDashboardTimingEnabled", () => {
  test("opt-in only via DASHBOARD_QUERY_TIMING=1", () => {
    assert.equal(isDashboardTimingEnabled({}), false);
    assert.equal(isDashboardTimingEnabled({ DASHBOARD_QUERY_TIMING: "0" }), false);
    assert.equal(isDashboardTimingEnabled({ DASHBOARD_QUERY_TIMING: "1" }), true);
  });
});

describe("dashboard timing keys", () => {
  test("covers Q1-Q10 plus total and viewModel", () => {
    for (const key of [
      "dashboard.q1.statusGroups",
      "dashboard.q2.recentPosts",
      "dashboard.q3.attentionPosts",
      "dashboard.q4.upcomingPosts",
      "dashboard.q5.accounts",
      "dashboard.q6.effective",
      "dashboard.q7.usage",
      "dashboard.q8.targetStats",
      "dashboard.q9.recentActivity",
      "dashboard.q10.accountPulse",
      "dashboard.total",
      "dashboard.viewModel",
    ] as const) {
      assert.ok(
        (DASHBOARD_QUERY_KEYS as readonly string[]).includes(key),
        `missing timing key ${key}`,
      );
    }
  });

  test("no timing key suggests post content or credentials", () => {
    const forbidden = ["text", "token", "password", "username", "email", "secret"];
    for (const key of DASHBOARD_QUERY_KEYS) {
      for (const word of forbidden) {
        assert.ok(
          !key.toLowerCase().includes(word),
          `timing key ${key} must not hint at PII`,
        );
      }
    }
  });
});

describe("roundMs", () => {
  test("rounds to two decimals for stable log payloads", () => {
    assert.equal(roundMs(1.23456), 1.23);
    assert.equal(roundMs(0), 0);
  });
});
