import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketActivityStatus,
  bucketWeeks,
  buildInsights,
  formatRelativeTime,
  summarizePlatforms,
} from "../src/lib/dashboard-analytics";

describe("bucketActivityStatus", () => {
  test("maps known statuses, skips drafts and unknowns", () => {
    assert.equal(bucketActivityStatus("PUBLISHED"), "published");
    assert.equal(bucketActivityStatus("SCHEDULED"), "scheduled");
    assert.equal(bucketActivityStatus("PUBLISHING"), "scheduled");
    assert.equal(bucketActivityStatus("FAILED"), "failed");
    assert.equal(bucketActivityStatus("PARTIALLY_PUBLISHED"), "failed");
    assert.equal(bucketActivityStatus("DRAFT"), null);
    assert.equal(bucketActivityStatus("WHATEVER"), null);
  });
});

describe("bucketWeeks", () => {
  const now = new Date("2026-09-15T12:00:00Z"); // a Tuesday

  test("returns 12 labeled buckets ending in the current week", () => {
    const buckets = bucketWeeks([], 12, now);
    assert.equal(buckets.length, 12);
    assert.ok(buckets.every((b) => b.published === 0 && b.label.length > 0));
    const keys = buckets.map((b) => b.key);
    assert.equal(new Set(keys).size, 12);
  });

  test("counts posts into the right weeks and skips drafts", () => {
    const buckets = bucketWeeks(
      [
        { createdAt: new Date("2026-09-15T08:00:00Z"), status: "PUBLISHED" },
        { createdAt: new Date("2026-09-14T08:00:00Z"), status: "SCHEDULED" },
        { createdAt: new Date("2026-09-07T08:00:00Z"), status: "FAILED" },
        { createdAt: new Date("2026-09-07T09:00:00Z"), status: "DRAFT" },
        { createdAt: new Date("2026-01-01T00:00:00Z"), status: "PUBLISHED" },
      ],
      12,
      now
    );
    const current = buckets[buckets.length - 1];
    assert.equal(current?.published, 1);
    assert.equal(current?.scheduled, 1);
    assert.equal(buckets[buckets.length - 2]?.failed, 1);
    assert.equal(
      buckets.reduce((sum, b) => sum + b.published + b.scheduled + b.failed, 0),
      3
    );
  });
});

describe("summarizePlatforms", () => {
  test("computes per-platform totals and target-level success rates", () => {
    const result = summarizePlatforms([
      { platform: "THREADS", status: "PUBLISHED", count: 8 },
      { platform: "THREADS", status: "FAILED", count: 2 },
      { platform: "X", status: "PUBLISHED", count: 3 },
      { platform: "TIKTOK", status: "PENDING", count: 1 },
    ]);
    const threads = result.platforms.find((p) => p.platform === "THREADS");
    assert.equal(threads?.successRate, 80);
    assert.equal(threads?.total, 10);
    const tiktok = result.platforms.find((p) => p.platform === "TIKTOK");
    assert.equal(tiktok?.successRate, null);
    assert.equal(result.overallSuccessRate, 85);
    assert.equal(result.totalPublished, 11);
    assert.equal(result.totalFailed, 2);
  });

  test("empty input yields nulls, never NaN", () => {
    const result = summarizePlatforms([]);
    assert.equal(result.platforms.length, 0);
    assert.equal(result.overallSuccessRate, null);
  });
});

describe("formatRelativeTime", () => {
  test("renders minutes, hours, days, months", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    assert.equal(
      formatRelativeTime(new Date("2026-09-15T11:50:00Z"), now),
      "10m ago"
    );
    assert.equal(
      formatRelativeTime(new Date("2026-09-15T09:00:00Z"), now),
      "3h ago"
    );
    assert.equal(
      formatRelativeTime(new Date("2026-09-10T12:00:00Z"), now),
      "5d ago"
    );
    assert.equal(formatRelativeTime(now, now), "just now");
  });
});

describe("buildInsights", () => {
  test("emits operational insights with real links, nothing otherwise", () => {
    const insights = buildInsights({
      failedCount: 2,
      expiredCount: 1,
      postsLeft: 2,
      scheduledCount: 3,
    });
    assert.equal(insights.length, 4);
    assert.ok(insights.every((i) => typeof i.href === "string"));
    assert.ok(
      insights.some((i) => i.text.includes("need attention"))
    );
    assert.ok(insights.some((i) => i.text.includes("expired")));
    assert.ok(insights.some((i) => i.text.includes("Only 2 posts left")));
  });

  test("quiet account gets no insights and no engagement claims", () => {
    const insights = buildInsights({
      failedCount: 0,
      expiredCount: 0,
      postsLeft: null,
      scheduledCount: 0,
    });
    assert.equal(insights.length, 0);
  });

  test("zero allowance is a hard attention signal", () => {
    const insights = buildInsights({
      failedCount: 0,
      expiredCount: 0,
      postsLeft: 0,
      scheduledCount: 0,
    });
    assert.equal(insights.length, 1);
    assert.ok(insights[0]?.text.includes("used up"));
  });
});
