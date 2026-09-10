import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  detectMediaKind,
  validateMediaInput,
  sanitizeFilename,
  makeBlobPathname,
  resolveThreadsMediaPolicy,
  MEDIA_LIMITS,
} from "../src/lib/media";

describe("detectMediaKind", () => {
  test("recognizes allowed image MIME types", () => {
    for (const type of MEDIA_LIMITS.IMAGE.mimeTypes) {
      assert.equal(detectMediaKind(type), "IMAGE");
    }
  });

  test("recognizes allowed video MIME types", () => {
    for (const type of MEDIA_LIMITS.VIDEO.mimeTypes) {
      assert.equal(detectMediaKind(type), "VIDEO");
    }
  });

  test("returns null for unsupported MIME types", () => {
    assert.equal(detectMediaKind("text/html"), null);
    assert.equal(detectMediaKind("application/pdf"), null);
    assert.equal(detectMediaKind("image/svg+xml"), null);
    assert.equal(detectMediaKind("video/avi"), null);
    assert.equal(detectMediaKind(""), null);
  });
});

describe("validateMediaInput", () => {
  test("accepts an image under the limit", () => {
    const result = validateMediaInput("image/png", 1024);
    assert.deepEqual(result, { ok: true, kind: "IMAGE" });
  });

  test("rejects an image over 10 MB", () => {
    const result = validateMediaInput("image/jpeg", 10 * 1024 * 1024 + 1);
    assert.ok(!result.ok);
    assert.match(result.error, /10 MB/);
  });

  test("accepts a video under the limit", () => {
    const result = validateMediaInput("video/mp4", 100 * 1024 * 1024);
    assert.deepEqual(result, { ok: true, kind: "VIDEO" });
  });

  test("rejects a video over 100 MB", () => {
    const result = validateMediaInput("video/webm", 100 * 1024 * 1024 + 1);
    assert.ok(!result.ok);
    assert.match(result.error, /100 MB/);
  });

  test("rejects unsupported MIME type regardless of size", () => {
    const result = validateMediaInput("application/octet-stream", 100);
    assert.ok(!result.ok);
    assert.match(result.error, /Unsupported file type/);
  });

  test("rejects empty or invalid sizes", () => {
    assert.ok(!validateMediaInput("image/png", 0).ok);
    assert.ok(!validateMediaInput("image/png", Number.NaN).ok);
  });
});

describe("sanitizeFilename", () => {
  test("strips path traversal sequences", () => {
    assert.ok(!sanitizeFilename("../../etc/passwd").includes("/"));
    assert.ok(!sanitizeFilename("..\\..\\win").includes("\\"));
  });

  test("collapses whitespace to underscores", () => {
    assert.equal(sanitizeFilename("my photo 1.jpg"), "my_photo_1.jpg");
  });

  test("falls back to a safe name when input is unsafe or empty", () => {
    assert.equal(sanitizeFilename("..."), "file");
    assert.equal(sanitizeFilename(""), "file");
  });
});

describe("makeBlobPathname", () => {
  test("scopes the path to the user and post id", () => {
    const pathname = makeBlobPathname("user-1", "post-1", "photo.jpg");
    assert.ok(pathname.startsWith("media/user-1/post-1/"));
    assert.ok(pathname.endsWith("-photo.jpg"));
  });

  test("produces unique paths for the same input", () => {
    const a = makeBlobPathname("user-1", "post-1", "photo.jpg");
    const b = makeBlobPathname("user-1", "post-1", "photo.jpg");
    assert.notEqual(a, b);
  });
});

describe("resolveThreadsMediaPolicy", () => {
  test("no media keeps the text-only flow", () => {
    assert.deepEqual(resolveThreadsMediaPolicy([]), { kind: "text" });
  });

  test("a single image selects that image", () => {
    const result = resolveThreadsMediaPolicy([
      { id: "media-1", type: "IMAGE", mimeType: "image/png" },
    ]);
    assert.deepEqual(result, {
      kind: "media",
      mediaId: "media-1",
      mediaType: "IMAGE",
    });
  });

  test("a single MP4 video is accepted for publishing", () => {
    const result = resolveThreadsMediaPolicy([
      { id: "media-1", type: "VIDEO", mimeType: "video/mp4" },
    ]);
    assert.deepEqual(result, {
      kind: "media",
      mediaId: "media-1",
      mediaType: "VIDEO",
    });
  });

  test("a WebM video is rejected with a clear MP4-only error", () => {
    const result = resolveThreadsMediaPolicy([
      { id: "media-1", type: "VIDEO", mimeType: "video/webm" },
    ]);
    assert.equal(result.kind, "error");
    if (result.kind === "error") {
      assert.match(result.message, /MP4/);
      assert.match(result.message, /WebM/);
    }
  });

  test("multiple media produce the controlled error message", () => {
    const result = resolveThreadsMediaPolicy([
      { id: "media-1", type: "IMAGE", mimeType: "image/png" },
      { id: "media-2", type: "IMAGE", mimeType: "image/jpeg" },
    ]);
    assert.deepEqual(result, {
      kind: "error",
      message: "Threads posts currently support one image or one video.",
    });
  });

  test("mixed image and video also produce the controlled error message", () => {
    const result = resolveThreadsMediaPolicy([
      { id: "media-1", type: "IMAGE", mimeType: "image/png" },
      { id: "media-2", type: "VIDEO", mimeType: "video/mp4" },
    ]);
    assert.deepEqual(result, {
      kind: "error",
      message: "Threads posts currently support one image or one video.",
    });
  });
});