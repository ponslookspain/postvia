import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isAscii,
  makeBlobPathname,
  MAX_MEDIA_PER_POST,
  MEDIA_LIMITS,
  sanitizeFilename,
  validateMediaInput,
} from "../src/lib/media";
import {
  authorizeMediaUpload,
  buildUploadTokenPayload,
  CLIENT_UPLOAD_TTL_MS,
  parseClientPayload,
  parseUploadTokenPayload,
  validateCompletedUpload,
  validateReservedPathname,
} from "../src/lib/media-upload";
import { buildGetPresignOptions } from "../src/lib/blob";
import { THREADS_PUBLISH_IMAGE_TTL_MS } from "../src/lib/social/threads";
import { safePathname } from "../src/lib/diagnostics";

const MB = 1024 * 1024;

describe("media upload size policy", () => {
  test("image at the 4.5MB boundary is allowed", () => {
    const result = validateMediaInput("image/jpeg", Math.round(4.5 * MB));
    assert.deepEqual(result, { ok: true, kind: "IMAGE" });
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

  test("video 2MB is allowed", () => {
    const result = validateMediaInput("video/mp4", 2 * MB);
    assert.deepEqual(result, { ok: true, kind: "VIDEO" });
  });

  test("video webm is allowed", () => {
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

  test("unsupported MIME type is rejected", () => {
    const result = validateMediaInput("application/x-msdownload", 1024);
    assert.ok(!result.ok);
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

  test("media count per post is capped at 4", () => {
    assert.equal(MAX_MEDIA_PER_POST, 4);
  });
});

describe("client upload payload parsing", () => {
  test("valid client payload parses", () => {
    const result = parseClientPayload(
      JSON.stringify({
        postId: "p1",
        filename: "Снимок экрана.png",
        mimeType: "image/png",
        size: 1024,
      })
    );
    assert.ok(result.ok);
    assert.equal(result.data.postId, "p1");
    assert.equal(result.data.filename, "Снимок экрана.png");
  });

  test("missing or malformed client payload is rejected", () => {
    assert.equal(parseClientPayload(null).ok, false);
    assert.equal(parseClientPayload("not json").ok, false);
    assert.equal(parseClientPayload("[1,2]").ok, false);
    assert.equal(parseClientPayload(JSON.stringify({ filename: "a" })).ok, false);
  });
});

describe("reserved upload pathnames (official client upload flow)", () => {
  test("reserved pathname is user + post scoped and ASCII-only", () => {
    const pathname = makeBlobPathname(
      "alice",
      "post123",
      "Снимок экрана 2026-09-07 055429.png"
    );
    assert.ok(isAscii(pathname));
    assert.ok(pathname.startsWith("media/alice/post123/"));
    assert.ok(pathname.endsWith(".png"));
    assert.ok(validateReservedPathname(pathname, "alice", "post123"));
  });

  test("pathname for one user/post is rejected for another", () => {
    const pathname = makeBlobPathname("alice", "post1", "photo.jpg");
    assert.equal(validateReservedPathname(pathname, "bob", "post1"), false);
    assert.equal(validateReservedPathname(pathname, "alice", "post2"), false);
  });

  test("crafted pathnames are rejected", () => {
    assert.equal(
      validateReservedPathname("media/alice/post1/x", "alice", "post1"),
      false
    );
    assert.equal(
      validateReservedPathname(
        "media/alice/post1/../post2/file.png",
        "alice",
        "post1"
      ),
      false
    );
    assert.equal(
      validateReservedPathname(
        `media/alice/post1/${"0".repeat(31)}z-file.png`,
        "alice",
        "post1"
      ),
      false
    );
    assert.equal(
      validateReservedPathname(
        `media/alice/post1/${"0".repeat(32)}-snímek.png`,
        "alice",
        "post1"
      ),
      false
    );
  });

  test("reserved pathname survives the SDK atob base64 round-trip unchanged", () => {
    function simulateSdkAtobRoundTrip(pathname: string): string {
      const payload = JSON.stringify({ pathname });
      const segment = Buffer.from(payload).toString("base64url");
      let base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
      const pad = 4 - (base64.length % 4);
      if (pad !== 4) base64 += "=".repeat(pad);
      return JSON.parse(atob(base64)).pathname;
    }
    for (const name of [
      "Запись_экрана_2026-09-10_192139.mp4",
      "Снимок_экрана.png",
      "plain.jpg",
    ]) {
      const pathname = makeBlobPathname("alice", "post1", name);
      assert.equal(
        simulateSdkAtobRoundTrip(pathname),
        pathname,
        `pathname for '${name}' must round-trip through atob`
      );
    }
  });

  test("sanitizeFilename still preserves Cyrillic for display", () => {
    assert.equal(
      sanitizeFilename("Снимок экрана 2026-09-07 055429.png"),
      "Снимок_экрана_2026-09-07_055429.png"
    );
  });
});

describe("signed token payload (server-issued upload context)", () => {
  test("round-trips through JSON string", () => {
    const raw = buildUploadTokenPayload({
      userId: "alice",
      postId: "post1",
      filename: "Запись экрана.mp4",
    });
    assert.equal(typeof raw, "string");
    const parsed = parseUploadTokenPayload(raw);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data, {
      userId: "alice",
      postId: "post1",
      filename: "Запись экрана.mp4",
    });
  });

  test("garbage token payloads are rejected", () => {
    assert.equal(parseUploadTokenPayload(null).ok, false);
    assert.equal(parseUploadTokenPayload("nope{").ok, false);
    assert.equal(parseUploadTokenPayload(JSON.stringify({ userId: "a" })).ok, false);
  });
});

describe("completed upload validation (webhook -> media row input)", () => {
  const tokenPayload = buildUploadTokenPayload({
    userId: "alice",
    postId: "post1",
    filename: "Снимок экрана.png",
  });

  test("successful image upload produces a Media create input", () => {
    const outcome = validateCompletedUpload({
      blob: {
        pathname: `media/alice/post1/${"f".repeat(32)}-screenshot.png`,
        url: "https://example.private.blob.vercel-storage.com/x.png",
        contentType: "image/png",
      },
      tokenPayloadRaw: tokenPayload,
      size: 2 * MB,
    });
    assert.ok(outcome.ok);
    assert.equal(outcome.userId, "alice");
    assert.equal(outcome.postId, "post1");
    assert.equal(outcome.createInput.type, "IMAGE");
    assert.equal(outcome.createInput.mimeType, "image/png");
    assert.equal(outcome.createInput.size, 2 * MB);
    assert.equal(
      outcome.createInput.filename,
      "Снимок_экрана.png",
      "display filename keeps Cyrillic"
    );
  });

  test("upload outside the authorized scope is rejected", () => {
    const outcome = validateCompletedUpload({
      blob: {
        pathname: `media/bob/post9/${"f".repeat(32)}-x.png`,
        url: "https://example/x.png",
        contentType: "image/png",
      },
      tokenPayloadRaw: tokenPayload,
      size: 1024,
    });
    assert.equal(outcome.ok, false);
  });

  test("oversized or wrong-type stored blob is rejected", () => {
    const oversized = validateCompletedUpload({
      blob: {
        pathname: `media/alice/post1/${"f".repeat(32)}-big.png`,
        url: "https://example/big.png",
        contentType: "image/png",
      },
      tokenPayloadRaw: tokenPayload,
      size: MEDIA_LIMITS.IMAGE.maxBytes + 1,
    });
    assert.equal(oversized.ok, false);

    const wrongType = validateCompletedUpload({
      blob: {
        pathname: `media/alice/post1/${"f".repeat(32)}-evil`,
        url: "https://example/evil",
        contentType: "application/x-msdownload",
      },
      tokenPayloadRaw: tokenPayload,
      size: 1024,
    });
    assert.equal(wrongType.ok, false);
  });

  test("missing tokenPayload cannot create a row", () => {
    const outcome = validateCompletedUpload({
      blob: {
        pathname: `media/alice/post1/${"f".repeat(32)}-x.png`,
        url: "https://example/x.png",
        contentType: "image/png",
      },
      tokenPayloadRaw: null,
      size: 1024,
    });
    assert.equal(outcome.ok, false);
  });
});

describe("signed URL generation (Threads image publishing)", () => {
  test("GET presign is scoped to exactly one private pathname with get operation", () => {
    const options = buildGetPresignOptions("media/alice/post1/photo.jpg");
    assert.deepEqual(options, {
      access: "private",
      operation: "get",
      pathname: "media/alice/post1/photo.jpg",
    });
  });

  test("presign TTL constants are finite positive timestamps", () => {
    for (const ttl of [CLIENT_UPLOAD_TTL_MS, THREADS_PUBLISH_IMAGE_TTL_MS]) {
      assert.ok(Number.isInteger(ttl) && ttl > 0, `ttl ${ttl} must be positive`);
    }
  });
});

describe("safe pathname logging", () => {
  test("logs only the user-level path, never the post, random suffix or filename", () => {
    assert.equal(
      safePathname("media/alice/post1/9f2c-vacation video.mp4"),
      "media/alice/***"
    );
    assert.equal(safePathname("not-a-media-path"), "***");
  });
});
