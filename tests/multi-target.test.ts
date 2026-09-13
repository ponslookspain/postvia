import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePostStatus,
  isPublishableTargetStatus,
  publishTargetsInParallel,
  selectPublishableTargetIds,
} from "../src/lib/publish";
import {
  resolveEffectiveTargetContent,
  validateTargetAccountSelection,
  validateTargetMedia,
  validateTargetOverrides,
} from "../src/lib/platforms/overrides";
import { getPlatformCapabilities } from "../src/lib/platforms/capabilities";

describe("multi-target status and claiming", () => {
  test("PUBLISHED targets are never publishable", () => {
    assert.equal(isPublishableTargetStatus("PUBLISHED"), false);
    assert.deepEqual(
      selectPublishableTargetIds([
        { id: "a", status: "PUBLISHED" },
        { id: "b", status: "FAILED" },
        { id: "c", status: "PENDING" },
      ]),
      ["b", "c"]
    );
  });

  test("mixed target results produce PARTIALLY_PUBLISHED", () => {
    assert.equal(
      derivePostStatus([
        { status: "PUBLISHED" },
        { status: "FAILED" },
      ]),
      "PARTIALLY_PUBLISHED"
    );
  });

  test("all published produces PUBLISHED and all failed produces FAILED", () => {
    assert.equal(derivePostStatus([{ status: "PUBLISHED" }, { status: "PUBLISHED" }]), "PUBLISHED");
    assert.equal(derivePostStatus([{ status: "FAILED" }, { status: "FAILED" }]), "FAILED");
  });

  test("leftover PENDING next to settled siblings means still in flight", () => {
    assert.equal(
      derivePostStatus([{ status: "PUBLISHED" }, { status: "PENDING" }]),
      "PUBLISHING"
    );
    assert.equal(
      derivePostStatus([{ status: "FAILED" }, { status: "PENDING" }]),
      "PUBLISHING"
    );
  });

  test("all PENDING keeps the fallback (nothing happened yet)", () => {
    assert.equal(
      derivePostStatus([{ status: "PENDING" }, { status: "PENDING" }]),
      "DRAFT"
    );
    assert.equal(
      derivePostStatus([{ status: "PENDING" }], "SCHEDULED"),
      "SCHEDULED"
    );
  });

  test("target publish runs in parallel and isolates one failure", async () => {
    const started: string[] = [];
    const results = await publishTargetsInParallel(
      [{ id: "threads" }, { id: "x" }],
      async (target) => {
        started.push(target.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (target.id === "x") return { ok: false, error: "X failed" };
        return { ok: true, externalPostId: "threads-1" };
      }
    );
    assert.deepEqual(started.sort(), ["threads", "x"]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "fulfilled");
    if (results[1].status === "fulfilled") assert.equal(results[1].value.ok, false);
  });
});

describe("multi-target effective content", () => {
  test("global text is used when target override is missing", () => {
    assert.equal(
      resolveEffectiveTargetContent("global", { content: {} }).text,
      "global"
    );
  });

  test("target override is isolated to that target", () => {
    const a = resolveEffectiveTargetContent("global", {
      content: { text: "Threads copy" },
    });
    const b = resolveEffectiveTargetContent("global", { content: {} });
    assert.equal(a.text, "Threads copy");
    assert.equal(b.text, "global");
  });

  test("unknown platform-specific fields are rejected", () => {
    const result = validateTargetOverrides("X", {
      settings: { privacy_level: "PUBLIC_TO_EVERYONE" },
    });
    assert.equal(result.ok, false);
  });

  test("TikTok settings are validated against the capability whitelist", () => {
    assert.ok(
      validateTargetOverrides("TIKTOK", {
        settings: {
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          video_cover_timestamp_ms: 1000,
        },
      }).ok
    );
    assert.equal(
      validateTargetOverrides("TIKTOK", { settings: { privacy_level: "EVERYONE" } }).ok,
      false
    );
    assert.equal(
      validateTargetOverrides("TIKTOK", { settings: { video_cover_timestamp_ms: -5 } }).ok,
      false
    );
    assert.equal(
      validateTargetOverrides("TIKTOK", { settings: { video_cover_timestamp_ms: 1.5 } }).ok,
      false
    );
  });
});

describe("multi-account target selection security", () => {
  const accounts = [
    { id: "threads-a", userId: "u1", platform: "THREADS" as const },
    { id: "threads-b", userId: "u1", platform: "THREADS" as const },
    { id: "x-a", userId: "u1", platform: "X" as const },
    { id: "other", userId: "u2", platform: "THREADS" as const },
  ];

  test("allows multiple accounts on the same platform", () => {
    const result = validateTargetAccountSelection(
      accounts,
      ["threads-a", "threads-b"],
      "u1"
    );
    assert.ok(result.ok);
    assert.equal(result.accounts.length, 2);
  });

  test("rejects an account owned by another user", () => {
    const result = validateTargetAccountSelection(accounts, ["other"], "u1");
    assert.equal(result.ok, false);
  });

  test("X stays selected when media exists (v2 media upload)", () => {
    const result = validateTargetAccountSelection(accounts, ["x-a"], "u1");
    assert.ok(result.ok);
    assert.equal(result.accounts.length, 1);
  });

  test("rejects duplicate account ids without creating duplicate targets", () => {
    const result = validateTargetAccountSelection(
      accounts,
      ["threads-a", "threads-a"],
      "u1"
    );
    assert.ok(result.ok);
    assert.equal(result.accounts.length, 1);
  });
});

describe("target media compatibility", () => {
  test("X accepts photos, GIF, and single video; mixing fails closed", () => {
    const caps = getPlatformCapabilities("X");
    assert.deepEqual(validateTargetMedia(caps, [{ type: "IMAGE", mimeType: "image/png" }]), {
      ok: true,
    });
    assert.deepEqual(
      validateTargetMedia(caps, [
        { type: "IMAGE", mimeType: "image/jpeg" },
        { type: "IMAGE", mimeType: "image/jpeg" },
      ]),
      { ok: true }
    );
    assert.deepEqual(validateTargetMedia(caps, [{ type: "VIDEO", mimeType: "video/mp4" }]), {
      ok: true,
    });
    const mixed = validateTargetMedia(caps, [
      { type: "VIDEO", mimeType: "video/mp4" },
      { type: "IMAGE", mimeType: "image/jpeg" },
    ]);
    assert.equal(mixed.ok, false);
    if (!mixed.ok) assert.match(mixed.error, /mixing/);
  });

  test("Threads image and video are accepted independently", () => {
    const caps = getPlatformCapabilities("THREADS");
    assert.deepEqual(
      validateTargetMedia(caps, [{ type: "IMAGE", mimeType: "image/png" }]),
      { ok: true }
    );
    assert.deepEqual(
      validateTargetMedia(caps, [{ type: "VIDEO", mimeType: "video/mp4" }]),
      { ok: true }
    );
  });

  test("TikTok accepts MOV while Threads rejects it", () => {
    assert.deepEqual(
      validateTargetMedia(getPlatformCapabilities("TIKTOK"), [
        { type: "VIDEO", mimeType: "video/quicktime" },
      ]),
      { ok: true }
    );
    const threads = validateTargetMedia(getPlatformCapabilities("THREADS"), [
      { type: "VIDEO", mimeType: "video/quicktime" },
    ]);
    assert.equal(threads.ok, false);
    assert.match(
      threads.ok === false ? threads.error : "",
      /does not support video\/quicktime/i
    );
  });
});
