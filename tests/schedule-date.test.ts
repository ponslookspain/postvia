import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseDateKey, toDateKey } from "../src/lib/schedule-date";

/**
 * Pure date-key helpers shared by the schedule picker and its callers
 * (C3: lives outside the picker module so parsers never pull
 * react-day-picker into a bundle).
 */
describe("schedule date keys", () => {
  test("toDateKey formats local yyyy-MM-dd without UTC shifts", () => {
    assert.equal(toDateKey(new Date(2026, 8, 15, 12, 0, 0)), "2026-09-15");
    assert.equal(toDateKey(new Date(2026, 0, 5, 12, 0, 0)), "2026-01-05");
  });

  test("parseDateKey round-trips toDateKey output", () => {
    const parsed = parseDateKey("2026-09-15");
    assert.ok(parsed instanceof Date);
    assert.equal(toDateKey(parsed), "2026-09-15");
  });

  test("parseDateKey rejects non-matching shapes, trims padding", () => {
    assert.equal(parseDateKey(""), undefined);
    assert.equal(parseDateKey("15/09/2026"), undefined);
    assert.equal(parseDateKey("not-a-date"), undefined);
    assert.ok(parseDateKey("  2026-09-15  ") instanceof Date);
  });
});
