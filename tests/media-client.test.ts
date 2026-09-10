import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_LIMITS, validateMediaInput } from "../src/lib/media";
import {
  authorizeMediaUpload,
  CLIENT_UPLOAD_TTL_MS,
  shouldUseClientUpload,
} from "../src/lib/media-upload";
import {
  buildGetPresignOptions,
  buildPutPresignOptions,
} from "../src/lib/blob";
import { THREADS_PUBLISH_IMAGE_TTL_MS } from "../src/lib/social/threads";
import { safePathname } from "../src/lib/diagnostics";

const MB = 1024 * 1024;

describe("media upload size policy", () => {
  test("image at the 4.5MB boundary is allowed", () => {
    const result = validateMediaInput("image/jpeg", Math.round(4.5 * MB));
    assert.deepEqual(result, { ok: true, kind: "IMAGE" });
  });

  test("image above 4.5MB is allowed by policy (10MB image limit)", () => {
    const result = validateMediaInput("image/webp", Math.round(4.6 * MB));
    assert.ok(result.ok);
  });

  test("image at the 10MB limit is allowed", () => {
    const result = validateMediaInput("image/png", MEDIA_LIMITS.IMAGE.maxBytes);
    assert.deepEqual(result, { ok: true, kind: "IMAGE" });
  });

  test("image above the 10MB limit is rejected", () => {
    const result = validateMediaInput(
      "image/jpeg",
      MEDIA_LIMITS.IMAGE.maxBytes + 1
    );
    assert.ok(!result.ok);
  });

  test("video 10MB is allowed", () => {
    const result = validateMediaInput("video/mp4", 10 * MB);
    assert.deepEqual(result, { ok: true, kind: "VIDEO" });
  });

  test("video 50MB is allowed", () => {
    const result = validateMediaInput("video/webm", 50 * MB);
    assert.deepEqual(result, { ok: true, kind: "VIDEO" });
  });

  test("video at the 100MB limit is allowed", () => {
    const result = validateMediaInput("video/mp4", MEDIA_LIMITS.VIDEO.maxBytes);
    assert.deepEqual(result, { ok: true, kind: "VIDEO" });
  });

  test("video above the 100MB limit is rejected", () => {
    const result = validateMediaInput(
      "video/mp4",
      MEDIA_LIMITS.VIDEO.maxBytes + 1
    );
    assert.ok(!result.ok);
  });
});

describe("client upload flow selection", () => {
  test("every valid size from <=4.5MB up to videos uses direct Blob client upload", () => {
    const boundary = 4.5 * MB;
    for (const size of [
      1,
      boundary,
      Math.round(boundary + 0.1 * MB),
      10 * MB,
      50 * MB,
    ]) {
      assert.equal(
        shouldUseClientUpload(size),
        true,
        `size ${size} should use client upload`
      );
    }
  });

  test("empty file is not eligible for upload", () => {
    assert.equal(shouldUseClientUpload(0), false);
  });
});

describe("media upload authorization / ownership", () => {
  const user = { id: "alice" };
  const ownPost = { userId: "alice" };

  test("unauthenticated request is rejected with 401", () => {
    const result = authorizeMediaUpload({
      user: null,
      post: ownPost,
      statedPostId: "p1",
    });
    assert.deepEqual(result, {
      ok: false,
      status: 401,
      error: "Not authenticated",
    });
  });

  test("missing postId is rejected with 400", () => {
    const result = authorizeMediaUpload({
      user,
      post: null,
      statedPostId: "",
    });
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      error: "postId is required",
    });
  });

  test("post owned by another user resolves to not-found (ownership-scoped query)", () => {
    const result = authorizeMediaUpload({
      user,
      post: null,
      statedPostId: "p2",
    });
    assert.deepEqual(result, {
      ok: false,
      status: 404,
      error: "Post not found",
    });
  });

  test("own post authorizes and returns the scoped ids", () => {
    const result = authorizeMediaUpload({
      user,
      post: ownPost,
      statedPostId: "p1",
    });
    assert.deepEqual(result, { ok: true, userId: "alice", postId: "p1" });
  });
});

describe("signed URL generation", () => {
  test("GET presign is scoped to exactly one private pathname with get operation", () => {
    const options = buildGetPresignOptions("media/alice/photo.jpg");
    assert.deepEqual(options, {
      access: "private",
      operation: "get",
      pathname: "media/alice/photo.jpg",
    });
  });

  test("PUT presign is scoped to exactly one private pathname and carries limits", () => {
    const options = buildPutPresignOptions("media/alice/video.mp4", {
      maximumSizeInBytes: 100 * MB,
      allowedContentTypes: ["video/mp4"] as const,
    });
    assert.equal(options.access, "private");
    assert.equal(options.operation, "put");
    assert.equal(options.pathname, "media/alice/video.mp4");
    assert.equal(options.maximumSizeInBytes, 100 * MB);
    assert.deepEqual(options.allowedContentTypes, ["video/mp4"]);
  });

  test("presign TTL constants are finite positive timestamps", () => {
    for (const ttl of [CLIENT_UPLOAD_TTL_MS, THREADS_PUBLISH_IMAGE_TTL_MS]) {
      assert.ok(Number.isInteger(ttl) && ttl > 0, `ttl ${ttl} must be positive`);
    }
  });
});

describe("safe pathname logging", () => {
  test("logs only the user-level path, never the random suffix or filename", () => {
    assert.equal(
      safePathname("media/alice/9f2c-vacation video.mp4"),
      "media/alice/***"
    );
    assert.equal(safePathname("not-a-media-path"), "***");
  });
});