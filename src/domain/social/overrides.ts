import type { Platform } from "@prisma/client";
import {
  isMediaKind,
  MAX_MEDIA_PER_POST,
  MEDIA_LIMITS,
  type MediaKind,
} from "../media/policy";
import {
  getPlatformCapabilities,
  type CapabilityField,
  type PlatformCapabilities,
} from "./capabilities";

export type TargetOverrides = {
  content?: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type EffectiveTargetContent = {
  text: string;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type OverrideValidation =
  | { ok: true; overrides: TargetOverrides }
  | { ok: false; error: string };

export type TargetAccountSelection = {
  id: string;
  userId: string;
  platform: Platform;
};

export function validateTargetAccountSelection(
  accounts: readonly TargetAccountSelection[],
  requestedIds: readonly string[],
  userId: string
): { ok: true; accounts: TargetAccountSelection[] } | { ok: false; error: string } {
  const uniqueIds = [...new Set(requestedIds)];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "Select at least one connected social account" };
  }
  const selected = uniqueIds.map((id) => accounts.find((account) => account.id === id));
  if (selected.some((account) => !account || account.userId !== userId)) {
    return { ok: false, error: "One or more selected social accounts are unavailable" };
  }
  const resolved = selected as TargetAccountSelection[];
  for (const account of resolved) {
    if (!getPlatformCapabilities(account.platform).implemented) {
      return {
        ok: false,
        error: `${getPlatformCapabilities(account.platform).label} publishing is not implemented yet`,
      };
    }
  }
  return { ok: true, accounts: resolved };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateField(
  field: CapabilityField,
  value: unknown
): string | null {
  if (field.type === "text") {
    if (typeof value !== "string") return `${field.key} must be a string`;
    if (field.maxLength !== undefined && Array.from(value).length > field.maxLength) {
      return `${field.key} exceeds the ${field.maxLength} character limit`;
    }
    return null;
  }
  if (field.type === "boolean") {
    return typeof value === "boolean" ? null : `${field.key} must be a boolean`;
  }
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return `${field.key} must be an integer`;
    }
    if (field.min !== undefined && value < field.min) {
      return `${field.key} must be at least ${field.min}`;
    }
    return null;
  }
  if (field.type === "enum") {
    if (typeof value !== "string") return `${field.key} must be a string`;
    if (!field.options?.includes(value)) {
      return `${field.key} has an unsupported value`;
    }
    return null;
  }
  return `${field.key} has an unsupported type`;
}

export function validateTargetOverrides(
  platform: Platform,
  input: unknown
): OverrideValidation {
  if (input === null || input === undefined) {
    return { ok: true, overrides: {} };
  }
  if (!isRecord(input)) {
    return { ok: false, error: "Target overrides must be an object" };
  }

  const content = input.content === undefined ? {} : input.content;
  const settings = input.settings === undefined ? {} : input.settings;
  if (!isRecord(content) || !isRecord(settings)) {
    return { ok: false, error: "Target override content/settings must be objects" };
  }

  const caps = getPlatformCapabilities(platform);
  const fields = new Map(caps.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(content)) {
    const field = fields.get(key);
    if (!field) return { ok: false, error: `${key} is not supported on ${platform}` };
    const error = validateField(field, value);
    if (error) return { ok: false, error };
  }
  for (const [key, value] of Object.entries(settings)) {
    const field = fields.get(key);
    if (!field) return { ok: false, error: `${key} is not supported on ${platform}` };
    const error = validateField(field, value);
    if (error) return { ok: false, error };
  }

  return {
    ok: true,
    overrides: {
      content: { ...content },
      settings: { ...settings },
    },
  };
}

export type NormalizedTiktokContent = {
  title: string;
  description: string;
};

/**
 * Backward-compatible reader for TikTok override content. Historical
 * drafts store only `{ title }`; newer ones store `{ title, description }`.
 * Unknown shapes degrade to empty strings — user text is never dropped,
 * only absent values default. A legacy `text` key (never written by the
 * composer, but tolerated) falls back into `title` so no caption is lost.
 */
export function normalizeTiktokContent(content: unknown): NormalizedTiktokContent {
  if (!isRecord(content)) return { title: "", description: "" };
  const rawTitle = content.title;
  const rawDescription = content.description;
  const rawText = content.text;
  const title =
    typeof rawTitle === "string"
      ? rawTitle
      : typeof rawText === "string"
        ? rawText
        : "";
  const description = typeof rawDescription === "string" ? rawDescription : "";
  return { title, description };
}

export function resolveEffectiveTargetContent(
  globalText: string,
  overrides: unknown
): EffectiveTargetContent {
  const source = isRecord(overrides) ? overrides : {};
  const content = isRecord(source.content) ? source.content : {};
  const settings = isRecord(source.settings) ? source.settings : {};
  const text = typeof content.text === "string" ? content.text : globalText;
  return { text, content, settings };
}

export type ValidatableMediaItem = {
  type: MediaKind;
  mimeType: string;
  /** Byte size when known (bulk pre-upload check, stored Media rows). */
  size?: number;
};

function maxItemsError(caps: PlatformCapabilities): string {
  return `${caps.label} supports at most ${caps.media.maxItems} media item${caps.media.maxItems === 1 ? "" : "s"}`;
}

function mixingError(caps: PlatformCapabilities): string {
  const kinds =
    caps.platform === "X"
      ? "photos and videos"
      : caps.platform === "TIKTOK"
        ? "photos and videos"
        : "images and videos";
  // Historical messages name the platform explicitly ("X does not support
  // mixing…", "TikTok does not support mixing…"); keep them verbatim.
  if (caps.platform === "X") {
    return "X does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.";
  }
  if (caps.platform === "TIKTOK") {
    return "TikTok does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.";
  }
  return `${caps.label} does not support mixing ${kinds} in one post.`;
}

function singleVideoError(caps: PlatformCapabilities): string {
  // Historical messages kept verbatim (tests pin "only one video").
  if (caps.platform === "X") return "X supports only one video per post.";
  if (caps.platform === "TIKTOK") return "TikTok supports only one video per post.";
  return `${caps.label} supports only one video per post.`;
}

/**
 * Structural media rules driven by the capability registry flags
 * (supportsMixedMedia / supportsMultipleVideos / maxItems). The X and
 * TikTok branches below only add their platform-specific empty-set and
 * GIF rules; the mixing / single-video verdicts come from the flags so
 * the registry stays the single source of truth.
 */
function checkMediaStructure(
  caps: PlatformCapabilities,
  media: readonly ValidatableMediaItem[]
): string | null {
  const hasVideo = media.some((item) => item.type === "VIDEO");
  const hasImage = media.some((item) => item.type === "IMAGE");
  if (hasVideo && hasImage && !caps.media.supportsMixedMedia) {
    return mixingError(caps);
  }
  if (hasVideo && media.length > 1 && !caps.media.supportsMultipleVideos) {
    return singleVideoError(caps);
  }
  if (media.length > caps.media.maxItems) {
    return maxItemsError(caps);
  }
  return null;
}

/**
 * Single kind-support check behind the capability flags (E2): replaces
 * the parallel IMAGE/VIDEO if-pair so a new kind extends one predicate,
 * not every call site. Unknown values fail closed.
 */
export function supportsMediaKind(
  caps: PlatformCapabilities,
  kind: unknown
): boolean {
  if (!isMediaKind(kind)) return false;
  return kind === "IMAGE" ? caps.media.image : caps.media.video;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export function validateTargetMedia(
  caps: PlatformCapabilities,
  media: readonly ValidatableMediaItem[]
): { ok: true } | { ok: false; error: string } {
  if (media.length > 0 && caps.media.maxItems === 0) {
    return {
      ok: false,
      error: `${caps.label} does not support image or video media publishing yet`,
    };
  }
  // X supports text, up to 4 photos, 1 GIF, or 1 video per post
  // (official v2 media upload + media_ids attach). The fine-grained
  // publish-time rules (15 MB GIF, MP4/MOV video, per-photo bytes) live
  // in resolveXMediaPolicy; the registry-level size cap below (5 MB
  // photos) is the pre-upload subset that binds tighter than global.
  if (caps.platform === "X") {
    if (media.length === 0) return { ok: true };
    const structural = checkMediaStructure(caps, media);
    if (structural) return { ok: false, error: structural };
  } else if (caps.platform === "TIKTOK") {
    if (media.length === 0) {
      return {
        ok: false,
        error: "TikTok requires one video or at least one photo (JPEG/WebP).",
      };
    }
    const structural = checkMediaStructure(caps, media);
    if (structural) return { ok: false, error: structural };
  } else {
    if (media.length === 0) {
      return caps.supportsText
        ? { ok: true }
        : { ok: false, error: `${caps.label} requires exactly one media item` };
    }
    const structural = checkMediaStructure(caps, media);
    if (structural) return { ok: false, error: structural };
    if (caps.media.requiredKind && caps.media.requiredKind === "VIDEO") {
      if (media.some((item) => item.type !== "VIDEO")) {
        return {
          ok: false,
          error: `${caps.label} requires exactly one MP4/WebM video.`,
        };
      }
    }
  }
if (!caps.implemented) {
      return { ok: false, error: `${caps.label} publishing is not implemented yet` };
    }
    for (const item of media) {
      if (!supportsMediaKind(caps, item.type)) {
        const noun = isMediaKind(item.type)
          ? item.type === "IMAGE"
            ? "image"
            : "video"
          : "image or video";
        return { ok: false, error: `${caps.label} does not support ${noun} media yet` };
      }
      if (caps.media.mimeTypes && !caps.media.mimeTypes.includes(item.mimeType)) {
        return {
          ok: false,
          error: `${caps.label} does not support ${item.mimeType}. ${caps.label} accepts ${caps.media.mimeTypes.map((m) => m.split("/").pop()).join(" / ")} files.`,
        };
      }
      // Platform byte caps stricter than global (today: X stills 5 MB).
      // Size is optional — callers without it (legacy text checks) skip.
      const cap =
        item.type === "VIDEO"
          ? caps.media.maxFileSizeBytes?.video
          : caps.media.maxFileSizeBytes?.image;
      if (
        cap !== undefined &&
        Number.isFinite(item.size) &&
        (item.size as number) > 0 &&
        (item.size as number) > cap
      ) {
        const kindNoun = item.type === "VIDEO" ? "video" : "image";
        return {
          ok: false,
          error: `${caps.label} accepts ${kindNoun} files up to ${formatMegabytes(cap)} MB.`,
        };
      }
    }
  return { ok: true };
}

/**
 * Media constraints shared by every selected platform, derived from the
 * capability registry (not a second source of truth — a view over it).
 *
 * Postvia publishes ONE common media set to all targets of a post, so a
 * file is addable only when it satisfies EVERY selected implemented
 * platform: counts take the minimum, MIME types the intersection, and
 * the mixing/multiple-video flags the AND. Callers use this for UX
 * gating (add button, counter, picker hint) only — server validation
 * (`validateTargetMedia` per target) stays authoritative, and file size
 * is deliberately NOT part of the add gate (size violations keep
 * surfacing on the preview/upload layer).
 */
export type EffectiveMediaConstraints = {
  /** Minimum `maxItems` across the selection, clamped to the global upload ceiling. */
  maxItems: number;
  /**
   * MIME intersection across the selection. `null` means unconstrained
   * (fail-safe: keep the global picker); per-target validation still
   * rejects incompatible files.
   */
  mimeTypes: readonly string[] | null;
  /** True when every selected platform accepts images / videos. */
  allowImage: boolean;
  allowVideo: boolean;
  /** AND across the selection (matches `validateTargetMedia` structure). */
  supportsMixedMedia: boolean;
  supportsMultipleVideos: boolean;
  /**
   * Per-kind byte caps stricter than global, where any selected platform
   * defines them. Informational for the preview layer — the add gate
   * ignores size by design.
   */
  maxFileSizeBytes?: {
    image?: number;
    video?: number;
  };
  /** Implemented platforms the constraints were derived from. */
  platforms: readonly Platform[];
};

/**
 * Derive add-gate constraints for a multi-platform selection. Returns
 * `null` when no implemented platform is selected (empty selection or
 * stubs only) — callers then keep the global-only behavior.
 */
export function getEffectiveMediaConstraints(
  platforms: readonly Platform[]
): EffectiveMediaConstraints | null {
  const caps = platforms
    .map((platform) => getPlatformCapabilities(platform))
    .filter(
      (entry): entry is PlatformCapabilities =>
        Boolean(entry) && entry.implemented
    );
  if (caps.length === 0) return null;

  const maxItems = Math.min(
    MAX_MEDIA_PER_POST,
    ...caps.map((entry) => entry.media.maxItems)
  );

  // A platform without its own list accepts the global set.
  const globalMimes: readonly string[] = [
    ...MEDIA_LIMITS.IMAGE.mimeTypes,
    ...MEDIA_LIMITS.VIDEO.mimeTypes,
  ];
  // Seed with the global set (every registry MIME is a subset of it),
  // so the result is the exact intersection across the selection.
  const narrowed = caps
    .map((entry) => entry.media.mimeTypes ?? globalMimes)
    .reduce<readonly string[]>(
      (intersection, list) =>
        intersection.filter((mime) => list.includes(mime)),
      globalMimes
    );
  // Empty intersection must never brick the picker: fall back to the
  // global hint while per-target validation keeps rejecting mismatches.
  const mimeTypes = narrowed.length > 0 ? narrowed : null;

  const requiredKinds = [
    ...new Set(
      caps
        .map((entry) => entry.media.requiredKind)
        .filter((kind): kind is MediaKind => kind !== undefined)
    ),
  ];
  const kindsAgree = requiredKinds.length <= 1;
  const allowImage =
    kindsAgree &&
    (requiredKinds[0] === undefined || requiredKinds[0] === "IMAGE") &&
    caps.every((entry) => supportsMediaKind(entry, "IMAGE"));
  const allowVideo =
    kindsAgree &&
    (requiredKinds[0] === undefined || requiredKinds[0] === "VIDEO") &&
    caps.every((entry) => supportsMediaKind(entry, "VIDEO"));

  const imageCap = Math.min(
    ...caps
      .map((entry) => entry.media.maxFileSizeBytes?.image)
      .filter((cap): cap is number => cap !== undefined)
  );
  const videoCap = Math.min(
    ...caps
      .map((entry) => entry.media.maxFileSizeBytes?.video)
      .filter((cap): cap is number => cap !== undefined)
  );

  return {
    maxItems,
    mimeTypes,
    allowImage,
    allowVideo,
    supportsMixedMedia: caps.every((entry) => entry.media.supportsMixedMedia),
    supportsMultipleVideos: caps.every(
      (entry) => entry.media.supportsMultipleVideos
    ),
    ...(Number.isFinite(imageCap) || Number.isFinite(videoCap)
      ? {
          maxFileSizeBytes: {
            ...(Number.isFinite(imageCap) ? { image: imageCap } : {}),
            ...(Number.isFinite(videoCap) ? { video: videoCap } : {}),
          },
        }
      : {}),
    platforms: caps.map((entry) => entry.platform),
  };
}

/**
 * Defense-in-depth for POST /api/posts: the client gates text length and
 * media count, but the server re-checks global text against every selected
 * platform's text limit and the declared media count against maxItems.
 * `mediaCount` may be absent on legacy callers — then only the text check
 * runs and media rules stay with the publish flow.
 */

/**
 * Empty global text is valid only as a TikTok-description post: every
 * target must be TikTok and at least one must carry a non-empty title or
 * description override (the photo flow publishes description-only).
 * Anything else keeps the historical "Text is required" rejection.
 */
export function allowsEmptyPostText(input: {
  platforms: readonly Platform[];
  contents: readonly unknown[];
}): boolean {
  if (input.platforms.length === 0) return false;
  if (!input.platforms.every((platform) => platform === "TIKTOK")) {
    return false;
  }
  return input.contents.some((content) => {
    const normalized = normalizeTiktokContent(content);
    return (
      normalized.title.trim().length > 0 ||
      normalized.description.trim().length > 0
    );
  });
}export function validateCreatePostContent(input: {
  text: string;
  mediaCount: number | null;
  platforms: readonly Platform[];
}): { ok: true } | { ok: false; error: string } {
  for (const platform of input.platforms) {
    const caps = getPlatformCapabilities(platform);
    const limit = caps.fields.find((field) => field.type === "text")?.maxLength;
    if (limit !== undefined && Array.from(input.text).length > limit) {
      return {
        ok: false,
        error: `Text exceeds the ${limit} character limit for ${caps.label}`,
      };
    }
  }
  if (
    input.mediaCount !== null &&
    Number.isInteger(input.mediaCount) &&
    input.mediaCount >= 0
  ) {
    for (const platform of input.platforms) {
      const caps = getPlatformCapabilities(platform);
      if (input.mediaCount > caps.media.maxItems) {
        return {
          ok: false,
          error: `${caps.label} supports at most ${caps.media.maxItems} media item${caps.media.maxItems === 1 ? "" : "s"}`,
        };
      }
    }
  }
  return { ok: true };
}
