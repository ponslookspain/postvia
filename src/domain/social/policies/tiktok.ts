/**
 * TikTok platform policies (domain).
 *
 * Pure media routing, error classification, post-info construction, chunk
 * planning and status rules. No OAuth, no token refresh, no Prisma, no
 * fetch, no environment access, no signed URLs — deterministic over inputs.
 * The TikTok API client, upload pipelines and polling stay in
 * `src/lib/social/tiktok.ts`, which re-exports this module for
 * compatibility.
 *
 * DOMAIN RULE: import nothing except standard primitives and domain types.
 * Never Prisma, Stripe SDK, React, process.env, fetch, Blob SDK, Sentry,
 * diagnostics, `src/lib/*` or `src/app/*`.
 */

export class TiktokApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "TiktokApiError";
  }
}

/** Video caption (`post_info.title` on the video init endpoint). */
export const TIKTOK_CAPTION_MAX_LENGTH = 2200;
/**
 * Photo post limits from the TikTok Content Posting API reference
 * (`/v2/post/publish/content/init/` Post Info Object, photo flow):
 * title is a short photo title, description carries the caption body.
 * Both are optional per TikTok; callers fall back to the global post
 * text first, so empty text only reaches the gates below for textless
 * posts.
 */
export const TIKTOK_PHOTO_TITLE_MAX_LENGTH = 90;
export const TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH = 4000;

export const TIKTOK_CHUNK_LIMIT = 64 * 1024 * 1024;
const TIKTOK_SPLIT_CHUNK_SIZE = 20 * 1024 * 1024;

export type TiktokChunkPlan = { chunkSize: number; totalChunkCount: number };

/**
 * TikTok rules: files <= 64 MB upload as ONE whole-file chunk; larger files
 * split into 5-64 MB chunks where the final chunk absorbs the remainder.
 */
export function planTiktokChunks(videoSize: number): TiktokChunkPlan {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error("Invalid video size");
  }
  if (videoSize <= TIKTOK_CHUNK_LIMIT) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const totalChunkCount = Math.max(2, Math.floor(videoSize / TIKTOK_SPLIT_CHUNK_SIZE));
  return { chunkSize: TIKTOK_SPLIT_CHUNK_SIZE, totalChunkCount };
}

export type ByteRange = { start: number; end: number; length: number; last: boolean };

export function tiktokChunkRanges(videoSize: number, plan: TiktokChunkPlan): ByteRange[] {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error("Invalid video size");
  }
  if (!Number.isInteger(plan.totalChunkCount) || plan.totalChunkCount < 1) {
    throw new Error("Invalid chunk plan");
  }
  if (!Number.isFinite(plan.chunkSize) || plan.chunkSize <= 0) {
    throw new Error("Invalid chunk plan");
  }
  const ranges: ByteRange[] = [];
  for (let index = 0; index < plan.totalChunkCount; index++) {
    const start = index * plan.chunkSize;
    if (start >= videoSize) {
      throw new Error("Chunk plan exceeds video size");
    }
    // The final chunk absorbs all remaining bytes.
    const end = index === plan.totalChunkCount - 1 ? videoSize - 1 : start + plan.chunkSize - 1;
    if (end < start) {
      throw new Error("Invalid chunk range");
    }
    ranges.push({ start, end, length: end - start + 1, last: index === plan.totalChunkCount - 1 });
  }
  return ranges;
}

export type TiktokPublishSettings = {
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
  photoCoverIndex?: number;
};

export const TIKTOK_PHOTO_MAX_COUNT = 35;
export const TIKTOK_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const TIKTOK_PHOTO_MIME_TYPES = ["image/jpeg", "image/webp"] as const;

export type TiktokMediaPolicyInput = {
  id: string;
  type: string;
  mimeType: string;
  size: number;
};

export type TiktokMediaPolicy =
  | { kind: "video"; mediaId: string }
  | { kind: "photo"; mediaIds: string[]; coverIndex: number }
  | { kind: "error"; message: string };

/**
 * Pure TikTok media router. Keeps TikTok-only restrictions (JPEG/WebP,
 * 20 MB per photo, 35 photos, no mixing) out of the global
 * validateMediaInput(), which intentionally stays broader for other
 * platforms. Order of `media` is the publish order; the cover defaults
 * to the first image.
 *
 * Pixel dimensions are deliberately NOT pre-validated here: this stack
 * has no image decoder (no sharp/jimp), and neither the video flow nor
 * Threads/Instagram pre-check dimensions either — they rely on the
 * platform transcode pipeline. A photo whose pixels exceed TikTok's
 * 1080p limit surfaces as a terminal TikTok `fail_reason` mapped to a
 * user-facing message, never as a silent hang. The canonical store
 * (max 2048px wide) means very wide panoramas are the residual risk
 * class; narrowing global canonicalization for TikTok alone would
 * degrade every other platform and is out of scope.
 */
export function resolveTiktokMediaPolicy(
  media: readonly TiktokMediaPolicyInput[],
  requestedCoverIndex?: number
): TiktokMediaPolicy {
  if (media.length === 0) {
    return {
      kind: "error",
      message:
        "TikTok requires media: one video or at least one photo (JPEG/WebP, up to 4 per Postvia post).",
    };
  }
  const hasVideo = media.some((item) => item.type === "VIDEO");
  const hasImage = media.some((item) => item.type === "IMAGE");
  if (hasVideo && hasImage) {
    return {
      kind: "error",
      message:
        "TikTok does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.",
    };
  }
  if (hasVideo) {
    if (media.length > 1) {
      return {
        kind: "error",
        message: "TikTok supports only one video per post.",
      };
    }
    return { kind: "video", mediaId: media[0].id };
  }
  // Photo path: every item must be an image at this point.
  if (media.some((item) => item.type !== "IMAGE")) {
    return {
      kind: "error",
      message: "TikTok photo posts support images only.",
    };
  }
  if (media.length > TIKTOK_PHOTO_MAX_COUNT) {
    return {
      kind: "error",
      message: `TikTok supports at most ${TIKTOK_PHOTO_MAX_COUNT} photos per post.`,
    };
  }
  for (const item of media) {
    if (
      !(TIKTOK_PHOTO_MIME_TYPES as readonly string[]).includes(item.mimeType)
    ) {
      const short = item.mimeType.split("/").pop() ?? item.mimeType;
      return {
        kind: "error",
        message: `TikTok photo posts support JPEG and WebP images only (got ${short}). Convert the image to JPG or WebP and retry.`,
      };
    }
    if (!Number.isFinite(item.size) || item.size <= 0) {
      return {
        kind: "error",
        message: "TikTok photo posts require a valid image file.",
      };
    }
    if (item.size > TIKTOK_PHOTO_MAX_BYTES) {
      return {
        kind: "error",
        message:
          "One of the photos exceeds TikTok's 20 MB per-image limit. Use a smaller file.",
      };
    }
  }
  const coverIndex =
    requestedCoverIndex === undefined ? 0 : requestedCoverIndex;
  if (!Number.isInteger(coverIndex) || coverIndex < 0 || coverIndex >= media.length) {
    return {
      kind: "error",
      message: "TikTok cover index is out of range for the selected photos.",
    };
  }
  return {
    kind: "photo",
    mediaIds: media.map((item) => item.id),
    coverIndex,
  };
}

export const TIKTOK_STATUS_COMPLETE = "PUBLISH_COMPLETE";
export const TIKTOK_STATUS_FAILED = "FAILED";

export function isTiktokTerminalStatus(status: string): boolean {
  return status === TIKTOK_STATUS_COMPLETE || status === TIKTOK_STATUS_FAILED;
}

export type TiktokCreatorInfo = {
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

export function tiktokErrorCode(error: unknown): string {
  if (error instanceof TiktokApiError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "";
}

/**
 * Auth/token failures that always mean the user must reconnect —
 * shared by publish, resume, and creator-info so the contract stays
 * in one place.
 */
export function isTiktokAuthErrorCode(code: string): boolean {
  return (
    code === "scope_not_authorized" ||
    code === "token_expired" ||
    code === "invalid_refresh_token" ||
    code === "refresh_token_expired" ||
    code === "access_token_invalid" ||
    code === "access_token_expired" ||
    code === "invalid_token"
  );
}

export function tiktokErrorMessage(error: unknown): string {
  const code = tiktokErrorCode(error);
  switch (code) {
    case "privacy_level_option_mismatch":
      return "TikTok rejected the privacy setting for this account. Pick a different option in the post's TikTok settings.";
    case "spam_risk_too_many_posts":
      return "This TikTok account hit its daily publishing limit. Try again tomorrow or retry this post later.";
    case "reached_active_user_cap":
      return "The TikTok app hit its daily active publishing cap. Retry later.";
    case "unaudited_client_can_only_post_to_private_accounts":
      return "This TikTok app is not audited yet: only private TikTok accounts can be posted to, and posts are restricted to private viewing.";
    case "rate_limit_exceeded":
      return "TikTok rate limit reached. Please retry in a minute.";
    case "scope_not_authorized":
    case "token_expired":
    case "invalid_refresh_token":
    case "refresh_token_expired":
    case "access_token_invalid":
    case "access_token_expired":
    case "invalid_token":
      return "TikTok access expired or was revoked. Reconnect your TikTok account.";
    case "url_ownership_unverified":
      return "TikTok could not verify the media source: TikTok could not download the media — the media URL domain is not verified for this TikTok app or the link expired. Retry the post; if it persists, verify the app's URL prefix/domain in the TikTok Developer portal.";
    case "invalid_param":
      return "TikTok rejected the photo parameters (format, size, or cover). Photos must be JPEG/WebP up to 20 MB each — convert and retry.";
    case "photo_validation_failed":
    case "image_validation_failed":
      return "TikTok rejected one of the photos. Use JPEG or WebP images up to 20 MB each and retry.";
    case "video_size_exceeds_limit":
      return "The video is too large for TikTok. Use a smaller file.";
    case "video_duration_exceeds_limit":
      return "The video is longer than this TikTok account is allowed to post.";
    case "spam_risk_too_many_hashtags":
      return "TikTok flagged too many hashtags in the title. Remove some hashtags and retry.";
    case "spam_risk_duplicate_content":
      return "TikTok flagged this as duplicate content. Change the title or media and retry.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "TikTok publishing failed. Please try again.";
  }
}

/**
 * status/fetch terminal FAILED carries a raw `fail_reason` code
 * (e.g. "video_duration_exceeds_limit"). Map it through the same
 * user-facing dictionary; unknown reasons keep the code for support.
 */
export function tiktokFailReasonMessage(failReason?: string): string {
  if (!failReason) return "TikTok rejected the post. Please review the media and retry.";
  const friendly = tiktokErrorMessage({ code: failReason });
  return friendly === "TikTok publishing failed. Please try again."
    ? `TikTok could not publish the post: ${failReason}`
    : friendly;
}

/** Settings are validated against fresh creator info; unavailable options are enforced off. */
export function resolveTiktokPostInfo(input: {
  title: string;
  settings: TiktokPublishSettings;
  creatorInfo: TiktokCreatorInfo;
}): { postInfo: Record<string, unknown> } | { error: string } {
  const { settings, creatorInfo } = input;
  const title = input.title.trim();
  if (!title) {
    return { error: "TikTok video has no caption text. Provide a title." };
  }
  if (Array.from(title).length > TIKTOK_CAPTION_MAX_LENGTH) {
    return { error: `TikTok title exceeds the ${TIKTOK_CAPTION_MAX_LENGTH} character limit.` };
  }
  if (creatorInfo.privacyLevelOptions.length === 0) {
    return { error: "TikTok did not return privacy options for this account. Reconnect or retry." };
  }
  // No hardcoded default: when the caller passes no privacy level, prefer
  // SELF_ONLY only if the account actually offers it, otherwise fall back
  // to the first live option from creator info.
  const privacyLevel =
    settings.privacyLevel ??
    (creatorInfo.privacyLevelOptions.includes("SELF_ONLY")
      ? "SELF_ONLY"
      : creatorInfo.privacyLevelOptions[0]);
  if (!creatorInfo.privacyLevelOptions.includes(privacyLevel)) {
    return {
      error: `This TikTok account cannot use the "${privacyLevel}" privacy setting. Choose another option.`,
    };
  }
  const postInfo: Record<string, unknown> = {
    title,
    privacy_level: privacyLevel,
    disable_comment: settings.disableComment === true || creatorInfo.commentDisabled,
    disable_duet: settings.disableDuet === true || creatorInfo.duetDisabled,
    disable_stitch: settings.disableStitch === true || creatorInfo.stitchDisabled,
  };
  const cover = settings.videoCoverTimestampMs;
  if (typeof cover === "number" && Number.isInteger(cover) && cover >= 0) {
    postInfo.video_cover_timestamp_ms = cover;
  }
  return { postInfo };
}

/**
 * Photo Direct Post info: only the fields the PHOTO content/init endpoint
 * accepts (title, description, privacy_level, disable_comment).
 * Duet/stitch and video cover timestamp are video-only and must never
 * be sent for PHOTO (invalid_param risk). Unlike video, the photo
 * endpoint splits text into a short title (<=90) and a description
 * (<=4000); both are API-optional. Callers fall back to the global post
 * text first, so this gate only fires for textless posts.
 */
export function resolveTiktokPhotoPostInfo(input: {
  title: string;
  description?: string;
  settings: TiktokPublishSettings;
  creatorInfo: TiktokCreatorInfo;
}): { postInfo: Record<string, unknown> } | { error: string } {
  const { settings, creatorInfo } = input;
  const title = input.title.trim();
  const description = (input.description ?? "").trim();
  if (!title && !description) {
    return { error: "TikTok photo post has no text. Add post text, a custom title, or a description." };
  }
  if (Array.from(title).length > TIKTOK_PHOTO_TITLE_MAX_LENGTH) {
    return { error: `TikTok photo title exceeds the ${TIKTOK_PHOTO_TITLE_MAX_LENGTH} character limit.` };
  }
  if (Array.from(description).length > TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH) {
    return { error: `TikTok photo description exceeds the ${TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH} character limit.` };
  }
  if (creatorInfo.privacyLevelOptions.length === 0) {
    return { error: "TikTok did not return privacy options for this account. Reconnect or retry." };
  }
  const privacyLevel =
    settings.privacyLevel ??
    (creatorInfo.privacyLevelOptions.includes("SELF_ONLY")
      ? "SELF_ONLY"
      : creatorInfo.privacyLevelOptions[0]);
  if (!creatorInfo.privacyLevelOptions.includes(privacyLevel)) {
    return {
      error: `This TikTok account cannot use the "${privacyLevel}" privacy setting. Choose another option.`,
    };
  }
  return {
    postInfo: {
      // TikTok treats missing title/description as empty; sending an
      // empty title alongside a description-only post is accepted, but
      // omitting empty values keeps the payload minimal and honest.
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      privacy_level: privacyLevel,
      disable_comment: settings.disableComment === true || creatorInfo.commentDisabled,
    },
  };
}

export type TiktokPhotoInitPayload = {
  post_info: Record<string, unknown>;
  source_info: {
    source: "PULL_FROM_URL";
    photo_images: string[];
    photo_cover_index: number;
  };
  post_mode: "DIRECT_POST";
  media_type: "PHOTO";
};

/**
 * Pure builder for the PHOTO content/init body. Keeps the exact API
 * contract (media_type, post_mode, source, ordered photo_images, cover
 * index) unit-testable without network.
 */
export function buildTiktokPhotoInitPayload(input: {
  title: string;
  description?: string;
  settings: TiktokPublishSettings;
  creatorInfo: TiktokCreatorInfo;
  photoUrls: string[];
  coverIndex: number;
}): { payload: TiktokPhotoInitPayload } | { error: string } {
  if (input.photoUrls.length === 0) {
    return { error: "TikTok photo posts require at least one photo." };
  }
  if (input.photoUrls.length > TIKTOK_PHOTO_MAX_COUNT) {
    return {
      error: `TikTok supports at most ${TIKTOK_PHOTO_MAX_COUNT} photos per post.`,
    };
  }
  if (
    !Number.isInteger(input.coverIndex) ||
    input.coverIndex < 0 ||
    input.coverIndex >= input.photoUrls.length
  ) {
    return { error: "TikTok cover index is out of range for the selected photos." };
  }
  for (const url of input.photoUrls) {
    if (typeof url !== "string" || url.trim().length === 0) {
      return { error: "TikTok photo posts require a valid public image URL for every photo." };
    }
  }
  const resolved = resolveTiktokPhotoPostInfo({
    title: input.title,
    description: input.description,
    settings: input.settings,
    creatorInfo: input.creatorInfo,
  });
  if ("error" in resolved) return resolved;
  return {
    payload: {
      post_info: resolved.postInfo,
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: [...input.photoUrls],
        photo_cover_index: input.coverIndex,
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    },
  };
}
