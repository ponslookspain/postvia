import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  bucketCalendarPosts,
  dayKeyInTimeZone,
  dropTimeFor,
  gridDayKeys,
  isMovableStatus,
  monthKey,
  parseMonthParam,
  postReferenceIso,
  type CalendarPost,
} from "../src/lib/calendar";

function post(overrides: Partial<CalendarPost> & { id: string }): CalendarPost {
  return {
    text: "hello",
    status: "SCHEDULED",
    scheduledAt: null,
    publishedAt: null,
    createdAt: "2026-09-10T12:00:00.000Z",
    targets: [],
    previewMedia: null,
    ...overrides,
  };
}

describe("parseMonthParam", () => {
  const fallback = new Date("2026-03-15T12:00:00Z");
  test("accepts YYYY-MM", () => {
    assert.deepEqual(parseMonthParam("2026-09", fallback), {
      year: 2026,
      monthIndex: 8,
    });
  });
  test("rejects garbage and out-of-range values", () => {
    assert.deepEqual(parseMonthParam(undefined, fallback), {
      year: 2026,
      monthIndex: 2,
    });
    assert.deepEqual(parseMonthParam("next friday", fallback), {
      year: 2026,
      monthIndex: 2,
    });
    assert.deepEqual(parseMonthParam("2026-13", fallback), {
      year: 2026,
      monthIndex: 2,
    });
    assert.deepEqual(parseMonthParam("1999-01", fallback), {
      year: 2026,
      monthIndex: 2,
    });
  });
});

describe("month grid", () => {
  test("42 Monday-start keys covering September 2026", () => {
    const keys = gridDayKeys(2026, 8);
    assert.equal(keys.length, 42);
    // 2026-09-01 is a Tuesday: grid starts Monday 2026-08-31.
    assert.equal(keys[0], "2026-08-31");
    assert.ok(keys.includes("2026-09-01"));
    assert.ok(keys.includes("2026-09-30"));
    assert.equal(keys[41], "2026-10-11");
    // Mondays only at week starts.
    for (const key of [keys[0], keys[7], keys[14]]) {
      assert.equal(new Date(`${key}T12:00:00Z`).getUTCDay(), 1);
    }
  });
  test("month starting on Monday needs no lead days", () => {
    // 2026-06-01 is a Monday.
    const keys = gridDayKeys(2026, 5);
    assert.equal(keys[0], "2026-06-01");
  });
  test("addMonths wraps years", () => {
    assert.deepEqual(addMonths(2026, 11, 1), { year: 2027, monthIndex: 0 });
    assert.deepEqual(addMonths(2026, 0, -1), { year: 2025, monthIndex: 11 });
    assert.deepEqual(monthKey(2026, 8), "2026-09");
  });
});

describe("timezone-aware bucketing", () => {
  test("same instant lands on different days per timezone", () => {
    // 2026-09-10 01:30 UTC = Sep 9 in New York, Sep 10 in Auckland.
    assert.equal(
      dayKeyInTimeZone("2026-09-10T01:30:00.000Z", "America/New_York"),
      "2026-09-09"
    );
    assert.equal(
      dayKeyInTimeZone("2026-09-10T01:30:00.000Z", "Pacific/Auckland"),
      "2026-09-10"
    );
  });
  test("reference prefers scheduled, then published, then created", () => {
    const p = post({
      id: "a",
      scheduledAt: "2026-09-12T10:00:00.000Z",
      publishedAt: "2026-09-11T10:00:00.000Z",
    });
    assert.equal(postReferenceIso(p), "2026-09-12T10:00:00.000Z");
    assert.equal(
      postReferenceIso(post({ id: "b", publishedAt: "2026-09-11T10:00:00.000Z" })),
      "2026-09-11T10:00:00.000Z"
    );
  });
  test("buckets group by viewer day", () => {
    const buckets = bucketCalendarPosts(
      [
        post({ id: "a", scheduledAt: "2026-09-10T01:30:00.000Z" }),
        post({ id: "b", scheduledAt: "2026-09-10T20:00:00.000Z" }),
      ],
      "America/New_York"
    );
    assert.deepEqual(
      buckets.get("2026-09-09")?.map((p) => p.id),
      ["a"]
    );
    assert.deepEqual(
      buckets.get("2026-09-10")?.map((p) => p.id),
      ["b"]
    );
  });
});

describe("drop interactions", () => {
  test("only scheduled posts and drafts are movable", () => {
    assert.equal(isMovableStatus("SCHEDULED"), true);
    assert.equal(isMovableStatus("DRAFT"), true);
    for (const status of ["PUBLISHING", "PUBLISHED", "PARTIALLY_PUBLISHED", "FAILED"]) {
      assert.equal(isMovableStatus(status), false);
    }
  });
  test("drop keeps source time, drafts default to 09:00", () => {
    assert.equal(dropTimeFor("2026-09-10T18:30:00.000Z"), "18:30");
    assert.equal(dropTimeFor("2026-09-10T18:30:00+02:00"), "18:30");
    assert.equal(dropTimeFor(null), "09:00");
    assert.equal(dropTimeFor("not-a-date"), "09:00");
  });
});
