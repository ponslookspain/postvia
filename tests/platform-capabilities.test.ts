import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getCapabilitiesRegistry,
  getImplementedPlatforms,
  getPlatformCapabilities,
} from "../src/lib/platforms/capabilities";
import {
  resolveEffectiveTargetContent,
  validateTargetMedia,
  validateTargetOverrides,
} from "../src/lib/platforms/overrides";

describe("platform capability registry", () => {
  test("Threads supports text, image, and video", () => {
    const caps = getPlatformCapabilities("THREADS");
    assert.equal(caps.implemented, true);
    assert.equal(caps.supportsText, true);
    assert.equal(caps.media.image, true);
    assert.equal(caps.media.video, true);
  });

  test("X is implemented for text + media (v2 upload, up to 4 items)", () => {
    const caps = getPlatformCapabilities("X");
    assert.equal(caps.implemented, true);
    assert.equal(caps.supportsText, true);
    assert.equal(caps.media.image, true);
    assert.equal(caps.media.video, true);
    assert.equal(caps.media.maxItems, 4);
    assert.ok(caps.fields.some((field) => field.key === "text"));
  });

  test("TikTok is implemented for video + photo Direct Post with settings fields", () => {
    const caps = getPlatformCapabilities("TIKTOK");
    assert.equal(caps.implemented, true);
    assert.equal(caps.supportsText, false);
    assert.equal(caps.media.image, true);
    assert.equal(caps.media.video, true);
    assert.ok(caps.fields.some((field) => field.key === "privacy_level"));
    assert.ok(caps.fields.some((field) => field.key === "video_cover_timestamp_ms"));
    assert.ok(caps.fields.some((field) => field.key === "photo_cover_index"));
  });
});

describe("target overrides", () => {
  test("missing text falls back to global text", () => {
    const result = resolveEffectiveTargetContent("global text", {
      content: {},
      settings: {},
    });
    assert.equal(result.text, "global text");
  });

  test("target text overrides global text and reset means key removal", () => {
    const result = resolveEffectiveTargetContent("global text", {
      content: { text: "target text" },
    });
    assert.equal(result.text, "target text");
    assert.equal(
      resolveEffectiveTargetContent("global text", { content: {} }).text,
      "global text"
    );
  });

  test("unknown fields and invalid types are rejected", () => {
    assert.equal(
      validateTargetOverrides("THREADS", { content: { title: "wrong" } }).ok,
      false
    );
    assert.equal(
      validateTargetOverrides("THREADS", { content: { text: 123 } }).ok,
      false
    );
    assert.equal(
      validateTargetOverrides("X", { content: { text: "hello" } }).ok,
      true
    );
  });
});

describe("capability media validation", () => {
  test("X accepts text, photos, GIF, and single video", () => {
    const caps = getPlatformCapabilities("X");
    assert.deepEqual(validateTargetMedia(caps, []), { ok: true });
    assert.deepEqual(validateTargetMedia(caps, [{ type: "IMAGE", mimeType: "image/png" }]), {
      ok: true,
    });
    assert.deepEqual(validateTargetMedia(caps, [{ type: "VIDEO", mimeType: "video/mp4" }]), {
      ok: true,
    });
    const mixed = validateTargetMedia(caps, [
      { type: "VIDEO", mimeType: "video/mp4" },
      { type: "IMAGE", mimeType: "image/jpeg" },
    ]);
    assert.equal(mixed.ok, false);
    const tooMany = validateTargetMedia(caps, [
      { type: "IMAGE", mimeType: "image/jpeg" },
      { type: "IMAGE", mimeType: "image/jpeg" },
      { type: "IMAGE", mimeType: "image/jpeg" },
      { type: "IMAGE", mimeType: "image/jpeg" },
      { type: "IMAGE", mimeType: "image/jpeg" },
    ]);
    assert.equal(tooMany.ok, false);
  });

  test("Threads accepts a single MP4 video", () => {
    assert.deepEqual(
      validateTargetMedia(getPlatformCapabilities("THREADS"), [
        { type: "VIDEO", mimeType: "video/mp4" },
      ]),
      { ok: true }
    );
  });

  test("TikTok accepts one video or JPEG/WebP photos, rejects mixing", () => {
    const caps = getPlatformCapabilities("TIKTOK");
    const none = validateTargetMedia(caps, []);
    assert.equal(none.ok, false);
    const twoVideos = validateTargetMedia(caps, [
      { type: "VIDEO", mimeType: "video/mp4" },
      { type: "VIDEO", mimeType: "video/mp4" },
    ]);
    assert.equal(twoVideos.ok, false);
    if (!twoVideos.ok) assert.match(twoVideos.error, /only one video/);
    // PNG is not in the TikTok mime whitelist.
    const png = validateTargetMedia(caps, [
      { type: "IMAGE", mimeType: "image/png" },
    ]);
    assert.equal(png.ok, false);
    const unsupported = validateTargetMedia(caps, [
      { type: "VIDEO", mimeType: "video/x-msvideo" },
    ]);
    assert.equal(unsupported.ok, false);
    const videoOk = validateTargetMedia(caps, [{ type: "VIDEO", mimeType: "video/mp4" }]);
    assert.deepEqual(videoOk, { ok: true });
    const photoOk = validateTargetMedia(caps, [{ type: "IMAGE", mimeType: "image/jpeg" }]);
    assert.deepEqual(photoOk, { ok: true });
    const carouselOk = validateTargetMedia(caps, [
      { type: "IMAGE", mimeType: "image/jpeg" },
      { type: "IMAGE", mimeType: "image/webp" },
    ]);
    assert.deepEqual(carouselOk, { ok: true });
    const mixed = validateTargetMedia(caps, [
      { type: "VIDEO", mimeType: "video/mp4" },
      { type: "IMAGE", mimeType: "image/jpeg" },
    ]);
    assert.equal(mixed.ok, false);
    if (!mixed.ok) assert.match(mixed.error, /mixing photos and videos/);
  });

  test("unimplemented platforms are rejected at publish validation", () => {
    const result = validateTargetMedia(getPlatformCapabilities("FACEBOOK"), [
      { type: "IMAGE", mimeType: "image/png" },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /not implemented/);
  });
});

describe("implemented platform derivation (E1 single registry)", () => {
  test("exactly the four launched platforms, in shared display order", () => {
    const implemented = getImplementedPlatforms();
    assert.deepEqual(
      implemented.map((caps) => caps.platform),
      ["X", "THREADS", "INSTAGRAM", "TIKTOK"]
    );
  });

  test("every registry entry has a stable order; stubs sort last", () => {
    for (const caps of getCapabilitiesRegistry()) {
      assert.equal(typeof caps.order, "number");
    }
    const stubs = getCapabilitiesRegistry().filter((caps) => !caps.implemented);
    assert.ok(stubs.length > 0);
    for (const stub of stubs) {
      assert.ok(stub.order >= 90);
      assert.equal(stub.connect, undefined);
    }
  });

  test("every implemented platform carries connect metadata", () => {
    for (const caps of getImplementedPlatforms()) {
      assert.ok(caps.connect, `${caps.platform} needs connect metadata`);
      assert.equal(typeof caps.connect?.connectEndpoint, "string");
      assert.equal(typeof caps.connect?.disconnectEndpoint, "string");
      assert.equal(typeof caps.connect?.connectLabel, "string");
    }
  });
});
