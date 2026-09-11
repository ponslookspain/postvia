import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPlatformCapabilities } from "../src/lib/platforms/capabilities";
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

  test("X is implemented for text but blocks media", () => {
    const caps = getPlatformCapabilities("X");
    assert.equal(caps.implemented, true);
    assert.equal(caps.supportsText, true);
    assert.equal(caps.media.image, false);
    assert.equal(caps.media.video, false);
  });

  test("TikTok has registry metadata but no provider implementation", () => {
    const caps = getPlatformCapabilities("TIKTOK");
    assert.equal(caps.implemented, false);
    assert.ok(caps.fields.some((field) => field.key === "privacy_level"));
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
  test("X media is hard-blocked", () => {
    const result = validateTargetMedia(getPlatformCapabilities("X"), [
      { type: "IMAGE", mimeType: "image/png" },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /does not support image/);
  });

  test("Threads accepts a single MP4 video", () => {
    assert.deepEqual(
      validateTargetMedia(getPlatformCapabilities("THREADS"), [
        { type: "VIDEO", mimeType: "video/mp4" },
      ]),
      { ok: true }
    );
  });

  test("unimplemented platforms are rejected at publish validation", () => {
    const result = validateTargetMedia(getPlatformCapabilities("TIKTOK"), [
      { type: "VIDEO", mimeType: "video/mp4" },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /not implemented/);
  });
});
