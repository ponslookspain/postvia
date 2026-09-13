import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BULK_MAX_VIDEOS,
  buildBulkPostBody,
  computeBulkSchedule,
  partitionDuplicateAdds,
  shouldAcceptRunRequest,
  validateBulkConfig,
  validateBulkVideoForAccounts,
  zonedTimeToIso,
} from "../src/lib/bulk-schedule";
import type { Platform } from "@prisma/client";

const MIN = 60_000;

describe("computeBulkSchedule", () => {
  test("spaces several videos by the interval", () => {
    const start = Date.UTC(2026, 8, 10, 9, 0);
    assert.deepEqual(computeBulkSchedule(start, 60, 3), [
      new Date(start).toISOString(),
      new Date(start + 60 * MIN).toISOString(),
      new Date(start + 120 * MIN).toISOString(),
    ]);
  });

  test("spacing survives a DST transition (absolute arithmetic)", () => {
    // US spring forward: 2026-03-08 02:00 -> 03:00 America/New_York.
    const start = Date.UTC(2026, 2, 8, 6, 30);
    const [first, second] = computeBulkSchedule(start, 60, 2);
    assert.equal(
      new Date(second).getTime() - new Date(first).getTime(),
      60 * MIN
    );
  });

  test("empty batch yields no dates", () => {
    assert.deepEqual(computeBulkSchedule(Date.now(), 60, 0), []);
  });
});

describe("zonedTimeToIso", () => {
  test("converts wall time in a fixed-offset zone", () => {
    // Madrid is UTC+2 in September (DST).
    assert.equal(
      zonedTimeToIso("2026-09-10", "09:00", "Europe/Madrid"),
      "2026-09-10T07:00:00.000Z"
    );
    assert.equal(
      zonedTimeToIso("2026-01-10", "09:00", "Europe/Madrid"),
      "2026-01-10T08:00:00.000Z"
    );
  });

  test("rejects malformed input and unknown zones", () => {
    assert.equal(zonedTimeToIso("", "09:00", "UTC"), null);
    assert.equal(zonedTimeToIso("2026-09-10", "", "UTC"), null);
    assert.equal(zonedTimeToIso("2026-13-40", "09:00", "UTC"), null);
    assert.equal(zonedTimeToIso("2026-09-10", "25:00", "UTC"), null);
    assert.equal(zonedTimeToIso("2026-09-10", "09:00", "Mars/Olympus"), null);
  });

  test("nonexistent spring-forward wall time is rejected, not shifted", () => {
    // 2026-03-08 02:30 does not exist in America/New_York.
    assert.equal(zonedTimeToIso("2026-03-08", "02:30", "America/New_York"), null);
    // The valid hour right after the gap works.
    assert.equal(
      zonedTimeToIso("2026-03-08", "03:30", "America/New_York"),
      "2026-03-08T07:30:00.000Z"
    );
  });

  test("ambiguous fall-back wall time resolves deterministically", () => {
    // 2026-11-01 01:30 happens twice in New York; first occurrence (EDT).
    const first = zonedTimeToIso("2026-11-01", "01:30", "America/New_York");
    assert.equal(first, "2026-11-01T05:30:00.000Z");
    assert.equal(zonedTimeToIso("2026-11-01", "01:30", "America/New_York"), first);
  });
});

describe("validateBulkConfig", () => {
  const base = {
    fileCount: 3,
    intervalMinutes: 60,
    startUtcMs: Date.now() + 60 * MIN,
    accountCount: 2,
  };
  test("accepts a sane config", () => {
    assert.deepEqual(validateBulkConfig(base), { ok: true });
  });
  test("rejects past starts", () => {
    assert.deepEqual(validateBulkConfig({ ...base, startUtcMs: Date.now() - MIN }), {
      ok: false,
      error: "The batch must start in the future.",
    });
    assert.deepEqual(validateBulkConfig({ ...base, startUtcMs: null }), {
      ok: false,
      error: "Choose a valid start date and time.",
    });
  });
  test("rejects bad counts and intervals", () => {
    assert.equal(validateBulkConfig({ ...base, fileCount: 0 }).ok, false);
    assert.equal(
      validateBulkConfig({ ...base, fileCount: BULK_MAX_VIDEOS + 1 }).ok,
      false
    );
    assert.equal(validateBulkConfig({ ...base, accountCount: 0 }).ok, false);
    assert.equal(validateBulkConfig({ ...base, intervalMinutes: 0 }).ok, false);
    assert.equal(
      validateBulkConfig({ ...base, intervalMinutes: 60 * 24 * 31 }).ok,
      false
    );
  });
});

describe("partitionDuplicateAdds", () => {
  const existing = [{ name: "a.mp4", size: 10, lastModified: 1 }];
  test("splits repeats from fresh files, keeps first occurrences", () => {
    const incoming = [
      { name: "b.mp4", size: 10, lastModified: 1 },
      { name: "a.mp4", size: 10, lastModified: 1 },
      { name: "a.mp4", size: 11, lastModified: 1 },
    ];
    assert.deepEqual(partitionDuplicateAdds(existing, incoming), {
      unique: [
        { name: "b.mp4", size: 10, lastModified: 1 },
        { name: "a.mp4", size: 11, lastModified: 1 },
      ],
      duplicates: [{ name: "a.mp4", size: 10, lastModified: 1 }],
    });
  });
  test("same file twice in one add flags the second", () => {
    const file = { name: "a.mp4", size: 10, lastModified: 1 };
    assert.deepEqual(partitionDuplicateAdds([], [file, file]), {
      unique: [file],
      duplicates: [file],
    });
  });
  test("empty input has no duplicates", () => {
    assert.deepEqual(partitionDuplicateAdds([], []), {
      unique: [],
      duplicates: [],
    });
  });
});

describe("duplicate instances stay independent", () => {
  test("the same video twice yields two distinct scheduled slots", () => {
    const start = Date.UTC(2026, 8, 10, 9, 0);
    const [first, second] = computeBulkSchedule(start, 60, 2);
    assert.notEqual(first, second);
    assert.equal(
      new Date(second).getTime() - new Date(first).getTime(),
      3_600_000
    );
  });
  test("each instance builds its own post body", () => {
    const one = buildBulkPostBody({ text: "launch", accountIds: ["a1"] });
    const two = buildBulkPostBody({ text: "launch", accountIds: ["a1"] });
    assert.deepEqual(one, two);
    assert.notEqual(one, two, "separate objects per instance");
  });
});

describe("shouldAcceptRunRequest", () => {
  test("rejects a second submit while a run is in flight", () => {
    assert.equal(shouldAcceptRunRequest(true), false);
    assert.equal(shouldAcceptRunRequest(false), true);
  });
});

describe("validateBulkVideoForAccounts", () => {
  const threads = { id: "t", platform: "THREADS" as Platform, username: "u" };
  const tiktok = { id: "k", platform: "TIKTOK" as Platform, username: "u" };
  const instagram = { id: "i", platform: "INSTAGRAM" as Platform, username: "u" };
  const x = { id: "x", platform: "X" as Platform, username: "u" };

  test("mp4 passes Threads/TikTok/Instagram", () => {
    assert.deepEqual(
      validateBulkVideoForAccounts("video/mp4", [threads, tiktok, instagram]),
      []
    );
  });

  test("webm is rejected for Threads and Instagram", () => {
    const errors = validateBulkVideoForAccounts("video/webm", [threads, instagram]);
    assert.equal(errors.length, 2);
    assert.ok(errors.every((message) => /webm/i.test(message)));
  });

  test("X accepts mp4 video (v2 media upload)", () => {
    assert.deepEqual(validateBulkVideoForAccounts("video/mp4", [x]), []);
  });

  test("mov passes TikTok but is rejected for Threads", () => {
    assert.deepEqual(
      validateBulkVideoForAccounts("video/quicktime", [tiktok]),
      []
    );
    const errors = validateBulkVideoForAccounts("video/quicktime", [
      threads,
      tiktok,
    ]);
    assert.equal(errors.length, 1);
    assert.ok(/quicktime/i.test(errors[0] ?? ""));
  });

  test("identical problems are deduped across accounts", () => {
    const errors = validateBulkVideoForAccounts("video/webm", [threads, threads]);
    assert.equal(errors.length, 1);
  });
});

describe("buildBulkPostBody", () => {
  test("creates an independent draft body per video", () => {
    const body = buildBulkPostBody({
      text: "  launch day  ",
      accountIds: ["a1", "a2"],
    });
    assert.deepEqual(body, {
      text: "launch day",
      hasMedia: true,
      accountIds: ["a1", "a2"],
      targets: [
        { accountId: "a1", overrides: null },
        { accountId: "a2", overrides: null },
      ],
    });
  });
});
