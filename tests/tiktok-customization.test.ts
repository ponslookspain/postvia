import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.TIKTOK_CLIENT_KEY = "test-client-key";
process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
delete process.env.TIKTOK_REDIRECT_URI;

import * as tiktok from "../src/lib/social/tiktok";
import {
  buildComposerPreviewModel,
  TIKTOK_PHOTO_DESCRIPTION_LIMIT,
  TIKTOK_PHOTO_TITLE_LIMIT,
} from "../src/lib/composer-previews";
import {
  validateTargetOverrides,
  normalizeTiktokContent,
} from "../src/lib/platforms/overrides";
import { getPlatformCapabilities } from "../src/lib/platforms/capabilities";

const creator = {
  creatorUsername: "u",
  creatorNickname: "n",
  privacyLevelOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 300,
};

const TIKTOK_ACCOUNT = { id: "acc-tiktok", platform: "TIKTOK", username: "creator" } as const;
const photoMedia = [{ type: "IMAGE", mimeType: "image/jpeg" }] as const;
const videoMedia = [{ type: "VIDEO", mimeType: "video/mp4" }] as const;

function photoModel(overrides: { accountId: string; text?: string; description?: string }[]) {
  return buildComposerPreviewModel({
    accounts: [TIKTOK_ACCOUNT],
    globalText: "Shared post text",
    overrides,
    media: [...photoMedia],
  })[0]!;
}

describe("TikTok customization contract", () => {
  test("preview photo limits mirror the provider constants", () => {
    assert.equal(TIKTOK_PHOTO_TITLE_LIMIT, tiktok.TIKTOK_PHOTO_TITLE_MAX_LENGTH);
    assert.equal(
      TIKTOK_PHOTO_DESCRIPTION_LIMIT,
      tiktok.TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH
    );
  });

  test("capability registry accepts title + description content", () => {
    const caps = getPlatformCapabilities("TIKTOK");
    assert.ok(caps.fields.some((field) => field.key === "description"));
    const ok = validateTargetOverrides("TIKTOK", {
      content: { title: "short", description: "longer body #fyp" },
      settings: {},
    });
    assert.equal(ok.ok, true);
    const tooLong = validateTargetOverrides("TIKTOK", {
      content: { description: "x".repeat(4001) },
      settings: {},
    });
    assert.equal(tooLong.ok, false);
    // Video caption gate stays at the 2200 superset.
    const videoOk = validateTargetOverrides("TIKTOK", {
      content: { title: "x".repeat(2200) },
      settings: {},
    });
    assert.equal(videoOk.ok, true);
  });
});

describe("normalizeTiktokContent (backward compatibility)", () => {
  test("legacy title-only drafts keep their text", () => {
    assert.deepEqual(normalizeTiktokContent({ content: undefined }), {
      title: "",
      description: "",
    });
    assert.deepEqual(normalizeTiktokContent({ title: "old caption" }), {
      title: "old caption",
      description: "",
    });
  });

  test("new title + description drafts round-trip", () => {
    assert.deepEqual(
      normalizeTiktokContent({ title: "t", description: "d" }),
      { title: "t", description: "d" }
    );
  });

  test("non-string values degrade to empty, non-records to empty", () => {
    assert.deepEqual(
      normalizeTiktokContent({ title: 123, description: null }),
      { title: "", description: "" }
    );
    assert.deepEqual(normalizeTiktokContent(null), { title: "", description: "" });
    assert.deepEqual(normalizeTiktokContent("text"), { title: "", description: "" });
  });

  test("legacy text key falls back into title so nothing is lost", () => {
    assert.deepEqual(normalizeTiktokContent({ text: "legacy caption" }), {
      title: "legacy caption",
      description: "",
    });
  });
});

describe("photo post_info contract", () => {
  test("title + description are sent as separate post_info fields", () => {
    const result = tiktok.resolveTiktokPhotoPostInfo({
      title: "funny cat",
      description: "a #funny photomode",
      settings: { privacyLevel: "SELF_ONLY" },
      creatorInfo: creator,
    });
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.equal(result.postInfo["title"], "funny cat");
    assert.equal(result.postInfo["description"], "a #funny photomode");
    assert.equal(result.postInfo["privacy_level"], "SELF_ONLY");
    assert.ok(!("disable_duet" in result.postInfo));
    assert.ok(!("disable_stitch" in result.postInfo));
    assert.ok(!("video_cover_timestamp_ms" in result.postInfo));
  });

  test("description-only photo post omits the empty title", () => {
    const result = tiktok.resolveTiktokPhotoPostInfo({
      title: "   ",
      description: "only a description",
      settings: {},
      creatorInfo: creator,
    });
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.ok(!("title" in result.postInfo));
    assert.equal(result.postInfo["description"], "only a description");
  });

  test("both empty is invalid", () => {
    const result = tiktok.resolveTiktokPhotoPostInfo({
      title: "  ",
      description: "",
      settings: {},
      creatorInfo: creator,
    });
    assert.ok("error" in result);
  });

  test("photo title over 90 and description over 4000 are invalid", () => {
    const longTitle = tiktok.resolveTiktokPhotoPostInfo({
      title: "x".repeat(91),
      description: "",
      settings: {},
      creatorInfo: creator,
    });
    assert.ok("error" in longTitle && /90/.test(longTitle.error));
    const okTitle = tiktok.resolveTiktokPhotoPostInfo({
      title: "x".repeat(90),
      description: "",
      settings: {},
      creatorInfo: creator,
    });
    assert.ok(!("error" in okTitle));
    const longDesc = tiktok.resolveTiktokPhotoPostInfo({
      title: "",
      description: "x".repeat(4001),
      settings: {},
      creatorInfo: creator,
    });
    assert.ok("error" in longDesc && /4000/.test(longDesc.error));
  });

  test("video contract is unchanged: single 2200 caption, no description", () => {
    const ok = tiktok.resolveTiktokPostInfo({
      title: "x".repeat(2200),
      settings: {},
      creatorInfo: creator,
    });
    assert.ok(!("error" in ok));
    if ("error" in ok) return;
    assert.equal(Array.from(String(ok.postInfo["title"])).length, 2200);
    assert.ok(!("description" in ok.postInfo));
  });

  test("photo init payload carries description through", () => {
    const result = tiktok.buildTiktokPhotoInitPayload({
      title: "t",
      description: "d",
      settings: {},
      creatorInfo: creator,
      photoUrls: ["https://cdn.example/a.jpg"],
      coverIndex: 0,
    });
    assert.ok("payload" in result);
    if (!("payload" in result)) return;
    assert.equal(
      (result.payload.post_info as Record<string, unknown>)["description"],
      "d"
    );
  });
});

describe("composer preview model for TikTok flows", () => {
  test("images-only media selects the photo flow with a 90 title gate", () => {
    const model = photoModel([]);
    assert.equal(model.tiktokMode, "photo");
    assert.equal(model.maxLength, 90);
    assert.equal(model.descriptionMaxLength, 4000);
    assert.equal(model.text, "Shared post text");
    assert.equal(model.description, "");
    assert.equal(model.validation.valid, true);
    assert.deepEqual(
      model.validation.errors.map((issue) => issue.code),
      []
    );
  });

  test("photo title + description become the effective content", () => {
    const model = photoModel([
      { accountId: "acc-tiktok", text: "short", description: "body #fyp" },
    ]);
    assert.equal(model.text, "short");
    assert.equal(model.description, "body #fyp");
    assert.equal(model.customized, true);
    assert.equal(model.source, "override");
    assert.equal(model.validation.valid, true);
  });

  test("description alone satisfies the photo requirement", () => {
    const model = photoModel([{ accountId: "acc-tiktok", description: "body" }]);
    assert.equal(model.validation.valid, true);
    assert.equal(model.customized, true);
  });

  test("photo title over 90 is a text-over-limit error naming 90", () => {
    const model = photoModel([{ accountId: "acc-tiktok", text: "x".repeat(91) }]);
    assert.equal(model.overLimit, true);
    assert.ok(
      model.validation.errors.some(
        (issue) =>
          issue.code === "text-over-limit" && issue.message.includes("90")
      )
    );
  });

  test("photo description over 4000 is its own error", () => {
    const model = photoModel([
      { accountId: "acc-tiktok", description: "x".repeat(4001) },
    ]);
    assert.deepEqual(
      model.validation.errors.map((issue) => issue.code),
      ["tiktok-description-over-limit"]
    );
  });

  test("video media keeps the single 2200 caption flow", () => {
    const [model] = buildComposerPreviewModel({
      accounts: [TIKTOK_ACCOUNT],
      globalText: "Shared post text",
      overrides: [{ accountId: "acc-tiktok", text: "caption" }],
      media: [...videoMedia],
    });
    assert.equal(model!.tiktokMode, "video");
    assert.equal(model!.maxLength, 2200);
    assert.equal(model!.text, "caption");
    assert.equal(model!.validation.valid, true);
  });

  test("no media keeps the single-title behavior with global fallback", () => {
    const [model] = buildComposerPreviewModel({
      accounts: [TIKTOK_ACCOUNT],
      globalText: "Shared post text",
      overrides: [],
    });
    assert.equal(model!.tiktokMode, "unknown");
    assert.equal(model!.maxLength, 2200);
    assert.equal(model!.text, "Shared post text");
    // No media attached: only the platform media requirement remains.
    assert.deepEqual(
      model!.validation.errors.map((issue) => issue.code),
      ["media-required"]
    );
  });

  test("global text flows into every TikTok flow", () => {
    assert.equal(photoModel([]).text, "Shared post text");
    assert.equal(photoModel([]).description, "");
  });
});
