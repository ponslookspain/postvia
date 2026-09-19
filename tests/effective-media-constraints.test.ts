import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getEffectiveMediaConstraints } from "../src/lib/platforms/overrides";

describe("getEffectiveMediaConstraints", () => {
  test("single platforms keep their registry maxItems", () => {
    assert.equal(getEffectiveMediaConstraints(["X"])?.maxItems, 4);
    assert.equal(getEffectiveMediaConstraints(["TIKTOK"])?.maxItems, 4);
    assert.equal(getEffectiveMediaConstraints(["INSTAGRAM"])?.maxItems, 1);
    assert.equal(getEffectiveMediaConstraints(["THREADS"])?.maxItems, 1);
  });

  test("maxItems is the minimum across the selection", () => {
    assert.equal(getEffectiveMediaConstraints(["X", "TIKTOK"])?.maxItems, 4);
    assert.equal(getEffectiveMediaConstraints(["X", "INSTAGRAM"])?.maxItems, 1);
    assert.equal(
      getEffectiveMediaConstraints(["INSTAGRAM", "THREADS"])?.maxItems,
      1
    );
    assert.equal(
      getEffectiveMediaConstraints(["X", "TIKTOK", "INSTAGRAM"])?.maxItems,
      1
    );
  });

  test("mimeTypes is the intersection across the selection", () => {
    assert.deepEqual(getEffectiveMediaConstraints(["X"])?.mimeTypes, [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
    ]);
    // PNG is X-only, GIF is X/Threads-only: both drop out of X + TikTok.
    assert.deepEqual(getEffectiveMediaConstraints(["X", "TIKTOK"])?.mimeTypes, [
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ]);
    assert.deepEqual(
      getEffectiveMediaConstraints(["X", "INSTAGRAM"])?.mimeTypes,
      ["image/jpeg", "video/mp4"]
    );
    assert.deepEqual(
      getEffectiveMediaConstraints(["INSTAGRAM", "THREADS"])?.mimeTypes,
      ["image/jpeg", "video/mp4"]
    );
  });

  test("image/video kinds follow every selected platform", () => {
    const both = getEffectiveMediaConstraints(["X", "INSTAGRAM"]);
    assert.equal(both?.allowImage, true);
    assert.equal(both?.allowVideo, true);
  });

  test("mixing and multiple videos follow AND semantics", () => {
    for (const platforms of [
      ["X"],
      ["X", "TIKTOK"],
      ["X", "INSTAGRAM"],
      ["INSTAGRAM", "THREADS"],
    ] as const) {
      const effective = getEffectiveMediaConstraints([...platforms]);
      assert.equal(effective?.supportsMixedMedia, false);
      assert.equal(effective?.supportsMultipleVideos, false);
    }
  });

  test("byte caps surface the strictest defined platform cap", () => {
    assert.deepEqual(
      getEffectiveMediaConstraints(["X"])?.maxFileSizeBytes,
      { image: 5 * 1024 * 1024 }
    );
    assert.deepEqual(
      getEffectiveMediaConstraints(["X", "THREADS"])?.maxFileSizeBytes,
      { image: 5 * 1024 * 1024 }
    );
    assert.equal(
      getEffectiveMediaConstraints(["THREADS"])?.maxFileSizeBytes,
      undefined
    );
    assert.equal(
      getEffectiveMediaConstraints(["TIKTOK"])?.maxFileSizeBytes,
      undefined
    );
  });

  test("platforms lists the implemented selection", () => {
    assert.deepEqual(
      getEffectiveMediaConstraints(["X", "INSTAGRAM"])?.platforms,
      ["X", "INSTAGRAM"]
    );
  });

  test("empty selection returns null (global-only behavior)", () => {
    assert.equal(getEffectiveMediaConstraints([]), null);
  });

  test("stub-only selection returns null (stubs stay unselectable)", () => {
    assert.equal(getEffectiveMediaConstraints(["FACEBOOK"]), null);
    assert.equal(
      getEffectiveMediaConstraints(["FACEBOOK", "LINKEDIN"]),
      null
    );
  });

  test("stubs never narrow an implemented selection", () => {
    // Defensive: UI disables stubs, but the helper must stay fail-closed
    // and ignore them rather than crashing or over-restricting.
    assert.equal(
      getEffectiveMediaConstraints(["X", "FACEBOOK"])?.maxItems,
      4
    );
  });
});
