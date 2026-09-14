import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  bulkItemOperationId,
  createSingleFlight,
  isIdempotencyConflict,
  isValidBulkOperationId,
  isValidOperationId,
  newOperationId,
  normalizeOperationId,
} from "../src/lib/idempotency";
import { runScheduleFlow } from "../src/lib/composer-media";
import {
  computeBulkSchedule,
  validateBulkVideoForAccountsDetailed,
  zonedTimeToIso,
} from "../src/lib/bulk-schedule";
import {
  getPlatformCapabilities,
  X_PHOTO_MAX_BYTES,
} from "../src/lib/platforms/capabilities";
import { validateTargetMedia } from "../src/lib/platforms/overrides";
import { X_IMAGE_MAX_BYTES } from "../src/lib/social/x";
import type { Platform } from "@prisma/client";

const MIN = 60_000;

describe("operation ids", () => {
  test("minted ids are valid, unique UUIDs", () => {
    const a = newOperationId();
    const b = newOperationId();
    assert.ok(isValidOperationId(a));
    assert.ok(isValidOperationId(b));
    assert.notEqual(a, b);
  });

  test("garbage keys normalize to null (legacy non-idempotent create)", () => {
    assert.equal(normalizeOperationId(undefined), null);
    assert.equal(normalizeOperationId(null), null);
    assert.equal(normalizeOperationId(""), null);
    assert.equal(normalizeOperationId("text+scheduledAt"), null);
    assert.equal(normalizeOperationId("not-a-uuid"), null);
    assert.equal(normalizeOperationId(123), null);
    const valid = newOperationId();
    assert.equal(normalizeOperationId(valid), valid);
  });

  test("idempotency is bound to the operation, never to post content", () => {
    // Two genuinely identical posts MUST be creatable: distinct keys.
    const first = newOperationId();
    const second = newOperationId();
    assert.notEqual(first, second);
    assert.ok(isValidOperationId(first) && isValidOperationId(second));
  });
});

describe("bulk item keys", () => {
  test("key derives from (batch, slot), stable across list positions", () => {
    const batch = newOperationId();
    const key = bulkItemOperationId(batch, 3);
    assert.ok(isValidBulkOperationId(key));
    // Removing an earlier item shifts positions but never the slot.
    assert.equal(bulkItemOperationId(batch, 3), key);
    assert.notEqual(bulkItemOperationId(batch, 4), key);
  });

  test("different batches never share keys", () => {
    assert.notEqual(
      bulkItemOperationId(newOperationId(), 0),
      bulkItemOperationId(newOperationId(), 0)
    );
  });

  test("malformed bulk keys are rejected", () => {
    assert.equal(isValidBulkOperationId(""), false);
    assert.equal(isValidBulkOperationId("no-separator"), false);
    assert.equal(isValidBulkOperationId("notauuid:3"), false);
    assert.equal(isValidBulkOperationId(`${newOperationId()}:x`), false);
  });
});

describe("createSingleFlight", () => {
  test("second acquire while in flight fails (same-tick double click)", () => {
    const flight = createSingleFlight();
    assert.equal(flight.tryAcquire(), true);
    assert.equal(flight.inFlight, true);
    // React state would still read false here — the ref does not.
    assert.equal(flight.tryAcquire(), false);
    flight.release();
    assert.equal(flight.inFlight, false);
    assert.equal(flight.tryAcquire(), true);
    flight.release();
  });

  test("two guarded schedule runs issue exactly one create", async () => {
    const flight = createSingleFlight();
    let creates = 0;
    const runOnce = async (): Promise<string | null> => {
      if (!flight.tryAcquire()) return null;
      try {
        const result = await runScheduleFlow({
          scheduledIso: new Date(Date.now() + 3600_000).toISOString(),
          hasMedia: false,
          createDraft: async () => {
            creates += 1;
            return { ok: true, id: `post-${creates}` };
          },
          uploadMedia: async () => [],
          applySchedule: async () => ({ ok: true }),
        });
        return result.outcome === "scheduled" ? result.postId : null;
      } finally {
        flight.release();
      }
    };
    // Same-tick double invocation, as two click events before re-render.
    const [first, second] = await Promise.all([runOnce(), runOnce()]);
    assert.equal(creates, 1);
    assert.ok(first === "post-1" || second === "post-1");
    assert.ok(first === null || second === null);
  });

  test("sequential runs after release both proceed (retry is allowed)", async () => {
    const flight = createSingleFlight();
    let runs = 0;
    const runOnce = async () => {
      if (!flight.tryAcquire()) return false;
      try {
        runs += 1;
        return true;
      } finally {
        flight.release();
      }
    };
    assert.equal(await runOnce(), true);
    assert.equal(await runOnce(), true);
    assert.equal(runs, 2);
  });
});

describe("isIdempotencyConflict", () => {
  test("P2002 on clientOperationId is a replay, other conflicts are not", () => {
    assert.equal(
      isIdempotencyConflict({
        code: "P2002",
        meta: { target: ["clientOperationId"] },
      }),
      true
    );
    assert.equal(
      isIdempotencyConflict({
        code: "P2002",
        meta: { target: "Post_clientOperationId_key" },
      }),
      true
    );
    assert.equal(
      isIdempotencyConflict({ code: "P2002", meta: { target: ["pathname"] } }),
      false
    );
    assert.equal(isIdempotencyConflict({ code: "P2025" }), false);
    assert.equal(isIdempotencyConflict(new Error("boom")), false);
    assert.equal(isIdempotencyConflict(null), false);
  });
});

describe("registry size SSOT", () => {
  test("registry X photo cap mirrors the X provider constant", () => {
    assert.equal(X_PHOTO_MAX_BYTES, X_IMAGE_MAX_BYTES);
    assert.equal(getPlatformCapabilities("X").media.maxFileSizeBytes?.image, X_IMAGE_MAX_BYTES);
  });

  test("no platform mixes media or takes multiple videos (flag-driven)", () => {
    for (const platform of ["THREADS", "X", "INSTAGRAM", "TIKTOK"] as Platform[]) {
      const caps = getPlatformCapabilities(platform);
      assert.equal(caps.media.supportsMixedMedia, false, platform);
      assert.equal(caps.media.supportsMultipleVideos, false, platform);
    }
  });

  test("X stills enforce the 5 MB platform cap pre-upload", () => {
    const caps = getPlatformCapabilities("X");
    const over = validateTargetMedia(caps, [
      { type: "IMAGE", mimeType: "image/jpeg", size: 6 * 1024 * 1024 },
    ]);
    assert.equal(over.ok, false);
    if (!over.ok) assert.match(over.error, /5 MB/);
    const under = validateTargetMedia(caps, [
      { type: "IMAGE", mimeType: "image/jpeg", size: 4 * 1024 * 1024 },
    ]);
    assert.deepEqual(under, { ok: true });
  });

  test("size is optional: legacy callers without sizes keep working", () => {
    const caps = getPlatformCapabilities("X");
    assert.deepEqual(
      validateTargetMedia(caps, [{ type: "IMAGE", mimeType: "image/jpeg" }]),
      { ok: true }
    );
  });
});

describe("bulk detailed capability validation", () => {
  const threads = { id: "t", platform: "THREADS" as Platform, username: "u" };
  const instagram = { id: "i", platform: "INSTAGRAM" as Platform, username: "u" };
  const tiktok = { id: "k", platform: "TIKTOK" as Platform, username: "u" };
  const x = { id: "x", platform: "X" as Platform, username: "u" };

  test("compatible mp4 yields no issues", () => {
    assert.deepEqual(
      validateBulkVideoForAccountsDetailed(
        { name: "clip.mp4", mimeType: "video/mp4", size: 8 * 1024 * 1024 },
        [threads, instagram, tiktok, x]
      ),
      []
    );
  });

  test("webm is attributed per file and per platform", () => {
    const issues = validateBulkVideoForAccountsDetailed(
      { name: "video-03.webm", mimeType: "video/webm", size: 8 * 1024 * 1024 },
      [threads, instagram, tiktok]
    );
    // Threads + Instagram reject webm; TikTok accepts it.
    assert.equal(issues.length, 2);
    assert.ok(
      issues.every((issue) => issue.fileName === "video-03.webm"),
      "every issue names the file"
    );
    const platforms = issues.map((issue) => issue.platform).sort();
    assert.deepEqual(platforms, ["INSTAGRAM", "THREADS"]);
    assert.ok(
      issues.every((issue) => issue.message.includes("video-03.webm")),
      "messages carry the filename for UI display"
    );
    assert.ok(issues.some((issue) => /threads/i.test(issue.message)));
  });

  test("oversized files are rejected before upload with per-account messages", () => {
    const issues = validateBulkVideoForAccountsDetailed(
      { name: "huge.mp4", mimeType: "video/mp4", size: 150 * 1024 * 1024 },
      [threads, x]
    );
    assert.equal(issues.length, 2);
    assert.ok(issues.every((issue) => /100 MB/.test(issue.message)));
  });

  test("non-video files are rejected for every account", () => {
    const issues = validateBulkVideoForAccountsDetailed(
      { name: "photo.jpg", mimeType: "image/jpeg", size: 1024 },
      [threads]
    );
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /only video files/i);
  });

  test("mov passes TikTok but fails Threads with an attributed message", () => {
    const issues = validateBulkVideoForAccountsDetailed(
      { name: "video-04.mov", mimeType: "video/quicktime", size: 8 * 1024 * 1024 },
      [threads, tiktok]
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].platform, "THREADS");
    assert.match(issues[0].message, /video-04\.mov.*Threads/i);
  });
});

describe("bulk timezone / DST (Europe/Madrid)", () => {
  test("15 Sep 18:00 Madrid + 24h interval keeps 18:00 local time", () => {
    const start = zonedTimeToIso("2026-09-15", "18:00", "Europe/Madrid");
    assert.equal(start, "2026-09-15T16:00:00.000Z");
    const [first, second] = computeBulkSchedule(new Date(start!).getTime(), 1440, 2);
    assert.equal(first, "2026-09-15T16:00:00.000Z");
    assert.equal(second, "2026-09-16T16:00:00.000Z");
    // Same wall time the next day (offset unchanged in September).
    assert.equal(zonedTimeToIso("2026-09-16", "18:00", "Europe/Madrid"), second);
  });

  test("interval is absolute across the Madrid DST switch", () => {
    // Europe/Madrid springs forward 2026-03-29 02:00 -> 03:00.
    const before = zonedTimeToIso("2026-03-28", "12:00", "Europe/Madrid");
    const after = zonedTimeToIso("2026-03-29", "12:00", "Europe/Madrid");
    assert.ok(before && after);
    // Absolute spacing, not wall-clock spacing: the second noon is 23h later.
    const diffMs = new Date(after!).getTime() - new Date(before!).getTime();
    assert.equal(diffMs, 23 * 60 * MIN);
    const [s1, s2] = computeBulkSchedule(new Date(before!).getTime(), 24 * 60, 2);
    assert.equal(new Date(s2).getTime() - new Date(s1).getTime(), 24 * 60 * MIN);
  });

  test("nonexistent Madrid spring-forward wall time is rejected", () => {
    assert.equal(zonedTimeToIso("2026-03-29", "02:30", "Europe/Madrid"), null);
  });

  test("midnight start works", () => {
    assert.equal(
      zonedTimeToIso("2026-09-15", "00:00", "Europe/Madrid"),
      "2026-09-14T22:00:00.000Z"
    );
  });
});
