import type { Platform } from "@prisma/client";
import type { MediaKind } from "@/lib/media";
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

export function validateTargetMedia(
  caps: PlatformCapabilities,
  media: readonly { type: MediaKind; mimeType: string }[]
): { ok: true } | { ok: false; error: string } {
  if (media.length > 0 && caps.media.maxItems === 0) {
    return {
      ok: false,
      error: `${caps.label} does not support image or video media publishing yet`,
    };
  }
  // X supports text, up to 4 photos, 1 GIF, or 1 video per post
  // (official v2 media upload + media_ids attach). Mixing photos and
  // video is always rejected; the fine-grained rules (5 MB photos,
  // 15 MB GIF, MP4/MOV video) live in resolveXMediaPolicy so the global
  // media pipeline stays broader than X.
  if (caps.platform === "X") {
    if (media.length === 0) return { ok: true };
    const hasVideo = media.some((item) => item.type === "VIDEO");
    const hasImage = media.some((item) => item.type === "IMAGE");
    if (hasVideo && hasImage) {
      return {
        ok: false,
        error:
          "X does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.",
      };
    }
    if (hasVideo && media.length > 1) {
      return {
        ok: false,
        error: "X supports only one video per post.",
      };
    }
    if (media.length > caps.media.maxItems) {
      return {
        ok: false,
        error: `${caps.label} supports at most ${caps.media.maxItems} media item${caps.media.maxItems === 1 ? "" : "s"}`,
      };
    }
  } else if (caps.platform === "TIKTOK") {
    if (media.length === 0) {
      return {
        ok: false,
        error: "TikTok requires one video or at least one photo (JPEG/WebP).",
      };
    }
    const hasVideo = media.some((item) => item.type === "VIDEO");
    const hasImage = media.some((item) => item.type === "IMAGE");
    if (hasVideo && hasImage) {
      return {
        ok: false,
        error:
          "TikTok does not support mixing photos and videos in one post. Publish the video and the photos as separate posts.",
      };
    }
    if (hasVideo && media.length > 1) {
      return {
        ok: false,
        error: "TikTok supports only one video per post.",
      };
    }
    if (media.length > caps.media.maxItems) {
      return {
        ok: false,
        error: `${caps.label} supports at most ${caps.media.maxItems} media item${caps.media.maxItems === 1 ? "" : "s"}`,
      };
    }
  } else {
    if (media.length === 0) {
      return caps.supportsText
        ? { ok: true }
        : { ok: false, error: `${caps.label} requires exactly one media item` };
    }
    if (media.length > caps.media.maxItems) {
      return {
        ok: false,
        error: `${caps.label} supports at most ${caps.media.maxItems} media item${caps.media.maxItems === 1 ? "" : "s"}`,
      };
    }
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
      if (item.type === "IMAGE" && !caps.media.image) {
        return { ok: false, error: `${caps.label} does not support image media yet` };
      }
      if (item.type === "VIDEO" && !caps.media.video) {
        return { ok: false, error: `${caps.label} does not support video media yet` };
      }
      if (caps.media.mimeTypes && !caps.media.mimeTypes.includes(item.mimeType)) {
        return {
          ok: false,
          error: `${caps.label} does not support ${item.mimeType}. ${caps.label} accepts ${caps.media.mimeTypes.map((m) => m.split("/").pop()).join(" / ")} files.`,
        };
      }
    }
  return { ok: true };
}

/**
 * Defense-in-depth for POST /api/posts: the client gates text length and
 * media count, but the server re-checks global text against every selected
 * platform's text limit and the declared media count against maxItems.
 * `mediaCount` may be absent on legacy callers — then only the text check
 * runs and media rules stay with the publish flow.
 */
export function validateCreatePostContent(input: {
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
