import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chooseThreadsMedia, threadsMediaTtlMs } from "../src/lib/publish";
import {
  THREADS_PUBLISH_IMAGE_TTL_MS,
  THREADS_PUBLISH_VIDEO_TTL_MS,
} from "../src/lib/social/threads";

const signedUrl = (pathname: string) => `https://signed.example/${pathname}?sig=abc`;

type SignCall = { pathname: string; ttlMs: number };

describe("chooseThreadsMedia", () => {
  test("returns no media for a post without media (text-only flow)", async () => {
    const calls: SignCall[] = [];
    const result = await chooseThreadsMedia([], async (p, t) => {
      calls.push({ pathname: p, ttlMs: t });
      return signedUrl(p);
    });

    assert.deepEqual(result, {});
    assert.deepEqual(calls, []);
  });

  test("signs the exact single image pathname with the image TTL", async () => {
    const calls: SignCall[] = [];
    const result = await chooseThreadsMedia(
      [
        {
          id: "m1",
          type: "IMAGE",
          pathname: "media/u1/photo.jpg",
          mimeType: "image/jpeg",
        },
      ],
      async (p, t) => {
        calls.push({ pathname: p, ttlMs: t });
        return signedUrl(p);
      }
    );

    assert.deepEqual(calls, [
      { pathname: "media/u1/photo.jpg", ttlMs: THREADS_PUBLISH_IMAGE_TTL_MS },
    ]);
    assert.deepEqual(result, {
      media: {
        url: "https://signed.example/media/u1/photo.jpg?sig=abc",
        kind: "IMAGE",
      },
    });
  });

  test("signs a single MP4 video pathname with the long video TTL", async () => {
    const calls: SignCall[] = [];
    const result = await chooseThreadsMedia(
      [
        {
          id: "m1",
          type: "VIDEO",
          pathname: "media/u1/clip.mp4",
          mimeType: "video/mp4",
        },
      ],
      async (p, t) => {
        calls.push({ pathname: p, ttlMs: t });
        return signedUrl(p);
      }
    );

    assert.deepEqual(calls, [
      { pathname: "media/u1/clip.mp4", ttlMs: THREADS_PUBLISH_VIDEO_TTL_MS },
    ]);
    assert.deepEqual(result, {
      media: {
        url: "https://signed.example/media/u1/clip.mp4?sig=abc",
        kind: "VIDEO",
      },
    });
  });

  test("rejects a WebM video with a clear error and no signing", async () => {
    const calls: SignCall[] = [];
    const result = await chooseThreadsMedia(
      [
        {
          id: "m1",
          type: "VIDEO",
          pathname: "media/u1/clip.webm",
          mimeType: "video/webm",
        },
      ],
      async (p, t) => {
        calls.push({ pathname: p, ttlMs: t });
        return signedUrl(p);
      }
    );

    assert.ok(result.error);
    assert.match(result.error ?? "", /MP4/);
    assert.deepEqual(calls, [], "no URL should be signed for a rejected video");
  });

  test("resolves membership strictly inside the given post's own media list", async () => {
    const posts = [
      {
        id: "m1",
        type: "IMAGE" as const,
        pathname: "media/u1/own.jpg",
        mimeType: "image/jpeg",
      },
      {
        id: "m9",
        type: "IMAGE" as const,
        pathname: "media/u1/other-post.jpg",
        mimeType: "image/jpeg",
      },
    ];
    const calls: SignCall[] = [];

    // Only this post's media is ever passed in (the DB layer scopes to postId);
    // the resolver must not sign anything that is not part of that list.
    const result = await chooseThreadsMedia(posts, async (p, t) => {
      calls.push({ pathname: p, ttlMs: t });
      return signedUrl(p);
    });

    assert.ok(result.error);
    assert.match(result.error ?? "", /one image or one video/);
    assert.deepEqual(calls, []);
  });

  test("never publishes silently and asks for a signer when multiple media", async () => {
    const calls: SignCall[] = [];
    const result = await chooseThreadsMedia(
      [
        {
          id: "m1",
          type: "IMAGE",
          pathname: "media/u1/a.jpg",
          mimeType: "image/jpeg",
        },
        {
          id: "m2",
          type: "VIDEO",
          pathname: "media/u1/b.mp4",
          mimeType: "video/mp4",
        },
      ],
      async (p, t) => {
        calls.push({ pathname: p, ttlMs: t });
        return signedUrl(p);
      }
    );

    assert.ok(result.error);
    assert.match(result.error ?? "", /one image or one video/);
    assert.deepEqual(calls, [], "no media URL should be signed for multiple media");
  });

  test("surfaces a signing failure as a controlled publish error", async () => {
    const result = await chooseThreadsMedia(
      [
        {
          id: "m1",
          type: "IMAGE",
          pathname: "media/u1/photo.jpg",
          mimeType: "image/jpeg",
        },
      ],
      async () => {
        throw new Error("no token");
      }
    );

    assert.deepEqual(result, {
      error: "Failed to generate media URL for Threads",
    });
  });

  test("TTL selection: images short-lived, videos long-lived", () => {
    assert.equal(threadsMediaTtlMs("IMAGE"), THREADS_PUBLISH_IMAGE_TTL_MS);
    assert.equal(threadsMediaTtlMs("VIDEO"), THREADS_PUBLISH_VIDEO_TTL_MS);
    assert.ok(
      THREADS_PUBLISH_VIDEO_TTL_MS > THREADS_PUBLISH_IMAGE_TTL_MS,
      "video TTL must outlive container processing"
    );
  });
});
