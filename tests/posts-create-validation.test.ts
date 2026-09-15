import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  allowsEmptyPostText,
  validateCreatePostContent,
} from "../src/lib/platforms/overrides";

describe("validateCreatePostContent", () => {
  test("valid request passes on every implemented platform", () => {
    assert.deepEqual(
      validateCreatePostContent({
        text: "Hello world",
        mediaCount: 1,
        platforms: ["THREADS", "TIKTOK", "INSTAGRAM"],
      }),
      { ok: true }
    );
    assert.deepEqual(
      validateCreatePostContent({
        text: "Hello world",
        mediaCount: 0,
        platforms: ["THREADS", "X", "TIKTOK", "INSTAGRAM"],
      }),
      { ok: true }
    );
  });

  test("over-limit text names the platform and its limit", () => {
    const result = validateCreatePostContent({
      text: "a".repeat(281),
      mediaCount: 0,
      platforms: ["THREADS", "X"],
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false ? result.error : null,
      "Text exceeds the 280 character limit for X"
    );
  });

  test("threads limit is enforced independently", () => {
    const result = validateCreatePostContent({
      text: "a".repeat(501),
      mediaCount: 0,
      platforms: ["THREADS"],
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false ? result.error : null,
      "Text exceeds the 500 character limit for Threads"
    );
  });

  test("emoji count as one character each (code points, not UTF-16)", () => {
    // 279 rocket emoji: 558 UTF-16 units but 279 code points — fits X 280.
    const fits = validateCreatePostContent({
      text: "🚀".repeat(279),
      mediaCount: 0,
      platforms: ["X"],
    });
    assert.deepEqual(fits, { ok: true });
    // 281 emoji are 281 code points — over the limit.
    const over = validateCreatePostContent({
      text: "🚀".repeat(281),
      mediaCount: 0,
      platforms: ["X"],
    });
    assert.equal(over.ok, false);
  });

  test("mixed unicode counts grapheme-adjacent sequences by code point", () => {
    // "é" as e + combining accent is 2 code points, matching Array.from.
    const text = "é".normalize("NFD").repeat(140);
    assert.equal(Array.from(text).length, 280);
    assert.deepEqual(
      validateCreatePostContent({ text, mediaCount: 0, platforms: ["X"] }),
      { ok: true }
    );
    assert.equal(
      validateCreatePostContent({
        text: `${text}x`,
        mediaCount: 0,
        platforms: ["X"],
      }).ok,
      false
    );
  });

  test("media count beyond maxItems is rejected per platform", () => {
    const result = validateCreatePostContent({
      text: "Hello",
      mediaCount: 2,
      platforms: ["THREADS"],
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false ? result.error : null,
      "Threads supports at most 1 media item"
    );
  });

  test("up to 4 media on X passes, 5 is rejected by count", () => {
    assert.deepEqual(
      validateCreatePostContent({ text: "Hello", mediaCount: 4, platforms: ["X"] }),
      { ok: true }
    );
    const result = validateCreatePostContent({
      text: "Hello",
      mediaCount: 5,
      platforms: ["X"],
    });
    assert.equal(result.ok, false);
  });

  test("legacy callers without mediaCount skip the count check", () => {
    assert.deepEqual(
      validateCreatePostContent({
        text: "Hello",
        mediaCount: null,
        platforms: ["THREADS"],
      }),
      { ok: true }
    );
  });

  test("zero media passes everywhere text-only is allowed", () => {
    assert.deepEqual(
      validateCreatePostContent({
        text: "Hello",
        mediaCount: 0,
        platforms: ["THREADS", "X"],
      }),
      { ok: true }
    );
  });
});

describe("allowsEmptyPostText (description-only TikTok photo)", () => {
  test("TikTok-only with a description override is allowed", () => {
    assert.equal(
      allowsEmptyPostText({
        platforms: ["TIKTOK"],
        contents: [{ title: "", description: "look at this" }],
      }),
      true
    );
    assert.equal(
      allowsEmptyPostText({
        platforms: ["TIKTOK", "TIKTOK"],
        contents: [{}, { title: "hi", description: "" }],
      }),
      true
    );
  });

  test("TikTok-only without any caption is rejected", () => {
    assert.equal(
      allowsEmptyPostText({ platforms: ["TIKTOK"], contents: [{}] }),
      false
    );
    assert.equal(
      allowsEmptyPostText({
        platforms: ["TIKTOK"],
        contents: [{ title: "  ", description: "" }],
      }),
      false
    );
  });

  test("mixed platforms are rejected even with a description", () => {
    assert.equal(
      allowsEmptyPostText({
        platforms: ["TIKTOK", "THREADS"],
        contents: [{ title: "", description: "look" }],
      }),
      false
    );
  });

  test("empty platform list is rejected", () => {
    assert.equal(allowsEmptyPostText({ platforms: [], contents: [] }), false);
  });
});
