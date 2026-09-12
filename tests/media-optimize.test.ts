import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_IMAGE_QUALITY,
  CANONICAL_IMAGE_WIDTH,
  selectImageOptimization,
} from "../src/lib/media-optimize";

describe("selectImageOptimization", () => {
  test("png and webp stills become canonical jpeg", () => {
    for (const mimeType of ["image/png", "image/webp"]) {
      assert.deepEqual(
        selectImageOptimization({ mimeType, size: 5 * 1024 * 1024 }),
        { width: CANONICAL_IMAGE_WIDTH, quality: CANONICAL_IMAGE_QUALITY, format: "jpeg" }
      );
    }
  });

  test("large jpeg is canonicalized", () => {
    assert.deepEqual(
      selectImageOptimization({ mimeType: "image/jpeg", size: 8 * 1024 * 1024 }),
      { width: CANONICAL_IMAGE_WIDTH, quality: CANONICAL_IMAGE_QUALITY, format: "jpeg" }
    );
  });

  test("small jpeg is kept as-is (no pointless re-encode)", () => {
    assert.equal(
      selectImageOptimization({ mimeType: "image/jpeg", size: 100 * 1024 }),
      null
    );
  });

  test("gif is kept byte-identical (animation)", () => {
    assert.equal(
      selectImageOptimization({ mimeType: "image/gif", size: 5 * 1024 * 1024 }),
      null
    );
  });

  test("video and unknown types are never image-optimized", () => {
    assert.equal(
      selectImageOptimization({ mimeType: "video/mp4", size: 50 * 1024 * 1024 }),
      null
    );
    assert.equal(
      selectImageOptimization({ mimeType: "application/octet-stream", size: 1024 }),
      null
    );
  });
});
