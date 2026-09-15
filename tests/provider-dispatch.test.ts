import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_DISPATCH,
  resolveResumeEntry,
} from "../src/lib/publish";
import {
  getDispatchEntry,
  UnknownPlatformError,
} from "../src/lib/platforms/providers";
import { XProvider } from "../src/lib/social/x";
import { ThreadsProvider } from "../src/lib/social/threads";
import { InstagramProvider } from "../src/lib/social/instagram";
import { getImplementedPlatforms } from "../src/lib/platforms/capabilities";

/**
 * E1 dispatch table contract: every implemented platform resolves an
 * execute + resume pair (and a generic provider factory except TikTok,
 * which publishes only through its custom Direct Post pipeline).
 * Unknown platforms throw on execute dispatch and resolve to null
 * (skip) on resume — never a silent TikTok fallback.
 */
describe("platform dispatch table", () => {
  test("every implemented platform has execute + resume", () => {
    for (const caps of getImplementedPlatforms()) {
      const entry = getDispatchEntry(PLATFORM_DISPATCH, caps.platform);
      assert.equal(typeof entry.execute, "function");
      assert.equal(typeof entry.resume, "function");
    }
  });

  test("provider factories build the right provider classes", () => {
    const x = getDispatchEntry(PLATFORM_DISPATCH, "X");
    assert.ok(x.createProvider?.() instanceof XProvider);
    const threads = getDispatchEntry(PLATFORM_DISPATCH, "THREADS");
    assert.ok(threads.createProvider?.() instanceof ThreadsProvider);
    const instagram = getDispatchEntry(PLATFORM_DISPATCH, "INSTAGRAM");
    assert.ok(instagram.createProvider?.() instanceof InstagramProvider);
  });

  test("TikTok has no generic provider factory", () => {
    const tiktok = getDispatchEntry(PLATFORM_DISPATCH, "TIKTOK");
    assert.equal(tiktok.createProvider, undefined);
    assert.equal(typeof tiktok.execute, "function");
    assert.equal(typeof tiktok.resume, "function");
  });

  test("unknown platforms throw UnknownPlatformError on dispatch", () => {
    assert.throws(
      () => getDispatchEntry(PLATFORM_DISPATCH, "FACEBOOK"),
      (error: unknown) =>
        error instanceof UnknownPlatformError &&
        error.platform === "FACEBOOK" &&
        /Unsupported platform/.test(error.message)
    );
    assert.throws(
      () => getDispatchEntry(PLATFORM_DISPATCH, "NOPE"),
      UnknownPlatformError
    );
  });
});

describe("resume routing", () => {
  test("each implemented platform resolves its own resume function", () => {
    for (const caps of getImplementedPlatforms()) {
      assert.equal(typeof resolveResumeEntry(caps.platform), "function");
    }
  });

  test("unknown platforms and missing ids resolve to null (skip)", () => {
    assert.equal(resolveResumeEntry("FACEBOOK"), null);
    assert.equal(resolveResumeEntry("NOPE"), null);
    assert.equal(resolveResumeEntry(null), null);
    assert.equal(resolveResumeEntry(undefined), null);
  });
});
