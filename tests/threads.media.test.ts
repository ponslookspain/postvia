import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chooseThreadsImageUrl } from "../src/lib/publish";

const signedUrl = (pathname: string) => `https://signed.example/${pathname}?sig=abc`;

describe("chooseThreadsImageUrl", () => {
  test("returns no image for a post without media (text-only flow)", async () => {
    const calls: string[] = [];
    const result = await chooseThreadsImageUrl([], async (p) => {
      calls.push(p);
      return signedUrl(p);
    });

    assert.deepEqual(result, {});
    assert.deepEqual(calls, []);
  });

  test("signs the exact single image pathname of this post", async () => {
    const calls: string[] = [];
    const result = await chooseThreadsImageUrl(
      [{ id: "m1", type: "IMAGE", pathname: "media/u1/photo.jpg" }],
      async (p) => {
        calls.push(p);
        return signedUrl(p);
      }
    );

    assert.deepEqual(calls, ["media/u1/photo.jpg"]);
    assert.equal(
      result.imageUrl,
      "https://signed.example/media/u1/photo.jpg?sig=abc"
    );
  });

  test("resolves membership strictly inside the given post's own media list", async () => {
    const posts = [
      { id: "m1", type: "IMAGE" as const, pathname: "media/u1/own.jpg" },
      { id: "m9", type: "IMAGE" as const, pathname: "media/u1/other-post.jpg" },
    ];
    const calls: string[] = [];

    // Only this post's media is ever passed in (the DB layer scopes to postId);
    // the resolver must not sign anything that is not part of that list.
    const result = await chooseThreadsImageUrl(posts, async (p) => {
      calls.push(p);
      return signedUrl(p);
    });

    assert.deepEqual(result, {
      error: "Threads image posts currently support one image.",
    });
    for (const call of calls) {
      assert.ok(posts.some((m) => m.pathname === call));
    }
  });

  test("never publishes silently and asks for a signer when multiple images", async () => {
    const calls: string[] = [];
    const result = await chooseThreadsImageUrl(
      [
        { id: "m1", type: "IMAGE", pathname: "media/u1/a.jpg" },
        { id: "m2", type: "IMAGE", pathname: "media/u1/b.jpg" },
      ],
      async (p) => {
        calls.push(p);
        return signedUrl(p);
      }
    );

    assert.deepEqual(result, {
      error: "Threads image posts currently support one image.",
    });
    assert.deepEqual(calls, [], "no image URL should be signed for multiple media");
  });

  test("rejects videos with a clear error and no signing", async () => {
    const calls: string[] = [];
    const result = await chooseThreadsImageUrl(
      [{ id: "m1", type: "VIDEO", pathname: "media/u1/clip.mp4" }],
      async (p) => {
        calls.push(p);
        return signedUrl(p);
      }
    );

    assert.deepEqual(result, {
      error: "Threads posts currently support images only.",
    });
    assert.deepEqual(calls, []);
  });

  test("surfaces a signing failure as a controlled publish error", async () => {
    const result = await chooseThreadsImageUrl(
      [{ id: "m1", type: "IMAGE", pathname: "media/u1/photo.jpg" }],
      async () => {
        throw new Error("no token");
      }
    );

    assert.deepEqual(result, {
      error: "Failed to generate media URL for Threads",
    });
  });
});