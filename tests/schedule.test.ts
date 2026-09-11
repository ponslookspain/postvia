import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  localDateInputValue,
  localInputToIso,
  localTimeInputValue,
  resolveScheduledAtUpdate,
  validateScheduledAt,
} from "../src/lib/schedule";
import {
  runScheduledPublishTick,
  type SchedulingDb,
  type StoredPost,
} from "../src/lib/scheduling";

const ORIGINAL_TZ = process.env.TZ;

function withTz<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  }
}

describe("date/time input -> absolute instant (timezone handling)", () => {
  test("18:30 chosen in Europe/Madrid becomes 16:30 UTC (CEST)", () => {
    withTz("Europe/Madrid", () => {
      assert.equal(
        localInputToIso("2026-09-15", "18:30"),
        "2026-09-15T16:30:00.000Z"
      );
    });
  });

  test("winter Madrid time uses CET (+01:00)", () => {
    withTz("Europe/Madrid", () => {
      assert.equal(
        localInputToIso("2026-01-15", "18:30"),
        "2026-01-15T17:30:00.000Z"
      );
    });
  });

  test("the same wall-clock time differs across timezones", () => {
    withTz("Asia/Kolkata", () => {
      assert.equal(
        localInputToIso("2026-09-15", "18:30"),
        "2026-09-15T13:00:00.000Z"
      );
    });
    withTz("UTC", () => {
      assert.equal(
        localInputToIso("2026-09-15", "18:30"),
        "2026-09-15T18:30:00.000Z"
      );
    });
  });

  test("invalid or missing input yields null", () => {
    withTz("UTC", () => {
      assert.equal(localInputToIso("", "18:30"), null);
      assert.equal(localInputToIso("2026-09-15", ""), null);
      assert.equal(localInputToIso("not-a-date", "18:30"), null);
    });
  });

  test("absolute instant renders back to the same local wall-clock values", () => {
    withTz("Europe/Madrid", () => {
      const instant = new Date("2026-09-15T16:30:00.000Z");
      assert.equal(localDateInputValue(instant), "2026-09-15");
      assert.equal(localTimeInputValue(instant), "18:30");
    });
  });
});

describe("validateScheduledAt", () => {
  const NOW = new Date("2026-09-11T12:00:00.000Z");

  test("future datetime is accepted", () => {
    const result = validateScheduledAt("2026-09-15T16:30:00.000Z", NOW);
    assert.ok(result.ok);
    assert.equal(result.date.toISOString(), "2026-09-15T16:30:00.000Z");
  });

  test("past datetime is rejected", () => {
    const result = validateScheduledAt("2026-09-10T16:30:00.000Z", NOW);
    assert.ok(!result.ok);
    assert.match(result.error, /future/);
  });

  test("garbage and non-string input is rejected", () => {
    assert.match((validateScheduledAt("сегодня вечером", NOW) as { error: string }).error, /Invalid/);
    assert.match((validateScheduledAt(123456, NOW) as { error: string }).error, /Invalid/);
    assert.match((validateScheduledAt("", NOW) as { error: string }).error, /Invalid/);
    assert.equal(validateScheduledAt(null, NOW).ok, false);
  });

  test("offset ISO strings compare as absolute instants, not local strings", () => {
    // 17:00 +05:30 = 11:30 UTC -> already past when NOW = 12:00 UTC
    const past = validateScheduledAt("2026-09-11T17:00:00+05:30", NOW);
    assert.equal(past.ok, false);

    // 18:00 +05:30 = 12:30 UTC -> future
    const future = validateScheduledAt("2026-09-11T18:00:00+05:30", NOW);
    assert.ok(future.ok);
    assert.equal(future.date.toISOString(), "2026-09-11T12:30:00.000Z");
  });
});

describe("resolveScheduledAtUpdate (reschedule rules)", () => {
  const NOW = new Date("2026-09-11T12:00:00.000Z");
  const FUTURE = "2026-09-15T16:30:00.000Z";

  test("reschedules a SCHEDULED post to a new absolute instant", () => {
    const result = resolveScheduledAtUpdate({
      currentStatus: "SCHEDULED",
      platform: "THREADS",
      rawScheduledAt: FUTURE,
      now: NOW,
    });
    assert.ok(result.ok);
    assert.equal(result.data.status, "SCHEDULED");
    assert.equal(result.data.scheduledAt?.toISOString(), FUTURE);
  });

  test("scheduling a DRAFT post moves it to SCHEDULED", () => {
    const result = resolveScheduledAtUpdate({
      currentStatus: "DRAFT",
      platform: "THREADS",
      rawScheduledAt: FUTURE,
      now: NOW,
    });
    assert.ok(result.ok);
    assert.equal(result.data.status, "SCHEDULED");
  });

  test("null clears the schedule back to DRAFT", () => {
    const result = resolveScheduledAtUpdate({
      currentStatus: "SCHEDULED",
      platform: "THREADS",
      rawScheduledAt: null,
      now: NOW,
    });
    assert.ok(result.ok);
    assert.equal(result.data.scheduledAt, null);
    assert.equal(result.data.status, "DRAFT");
  });

  test("past reschedule time is rejected with 400", () => {
    const result = resolveScheduledAtUpdate({
      currentStatus: "SCHEDULED",
      platform: "THREADS",
      rawScheduledAt: "2026-09-10T10:00:00.000Z",
      now: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.error, /future/);
    }
  });

  test("PUBLISHING / PUBLISHED / FAILED posts cannot be rescheduled", () => {
    for (const currentStatus of ["PUBLISHING", "PUBLISHED", "FAILED"]) {
      const result = resolveScheduledAtUpdate({
        currentStatus,
        platform: "THREADS",
        rawScheduledAt: FUTURE,
        now: NOW,
      });
      assert.equal(result.ok, false, currentStatus);
      const rejected = resolveScheduledAtUpdate({
        currentStatus,
        platform: "THREADS",
        rawScheduledAt: null,
        now: NOW,
      });
      assert.equal(rejected.ok, false, `${currentStatus} unschedule`);
    }
  });

  test("X posts cannot be scheduled", () => {
    const result = resolveScheduledAtUpdate({
      currentStatus: "DRAFT",
      platform: "X",
      rawScheduledAt: FUTURE,
      now: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /X is not available/);
  });
});

describe("cron due-selection works on absolute instants (timezone end-to-end)", () => {
  type Row = StoredPost & { updatedAt: Date };

  function createTickDb(rows: Row[]) {
    const due = (row: Row, where: Record<string, unknown>): boolean => {
      for (const [key, cond] of Object.entries(where)) {
        if (cond && typeof cond === "object" && !(cond instanceof Date)) {
          const range = cond as { lte?: Date; lt?: Date };
          const value = (row as unknown as Record<string, Date>)[key];
          if (range.lte && !(value.getTime() <= range.lte.getTime())) return false;
          if (range.lt && !(value.getTime() < range.lt.getTime())) return false;
        } else if ((row as unknown as Record<string, unknown>)[key] !== cond) {
          return false;
        }
      }
      return true;
    };

    const db: SchedulingDb = {
      post: {
        findMany: async ({ where }) =>
          rows.filter((r) => due(r, where)).map((r) => structuredClone(r)),
        updateMany: async ({ where, data }) => {
          let count = 0;
          for (const r of rows) {
            if (due(r, where)) {
              Object.assign(r, data);
              count++;
            }
          }
          return { count };
        },
        update: async ({ where, data }) => {
          const row = rows.find((r) => r.id === where.id);
          if (!row) throw new Error("missing");
          Object.assign(row, data);
          return row;
        },
      },
      postTarget: {
        updateMany: async () => ({ count: 0 }),
        update: async () => null,
      },
      socialAccount: {
        findFirst: async () => ({
          accessToken: "token",
          externalId: "123",
          username: "alice",
        }),
      },
    };
    return db;
  }

  function madridRow(): Row {
    // "15 сентября 18:30 Europe/Madrid" captured in a Madrid browser
    const iso = withTz("Europe/Madrid", () =>
      localInputToIso("2026-09-15", "18:30")
    );
    return {
      id: "p1",
      userId: "alice",
      status: "SCHEDULED",
      text: "ole!",
      scheduledAt: new Date(iso!),
      updatedAt: new Date("2026-09-14T00:00:00.000Z"),
      targets: [
        {
          id: "t1",
          status: "PENDING",
          platform: "THREADS",
          externalPostId: null,
          publishedAt: null,
        },
      ],
    };
  }

  test("not yet due a minute before 16:30 UTC", async () => {
    const rows = [madridRow()];
    const published: string[] = [];
    await runScheduledPublishTick({
      db: createTickDb(rows),
      publish: async (post) => {
        published.push(post.id);
        return { ok: true };
      },
      now: new Date("2026-09-15T16:29:00.000Z"),
    });
    assert.deepEqual(published, []);
    assert.equal(rows[0].status, "SCHEDULED");
  });

  test("due at 16:31 UTC (= 18:31 Madrid) regardless of process timezone", async () => {
    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo"]) {
      const rows = [madridRow()];
      const published: string[] = [];
      await withTz(tz, () =>
        runScheduledPublishTick({
          db: createTickDb(rows),
          publish: async (post) => {
            published.push(post.id);
            return { ok: true };
          },
          now: new Date("2026-09-15T16:31:00.000Z"),
        })
      );
      assert.deepEqual(published, ["p1"], `should be due in ${tz}`);
    }
  });
});
