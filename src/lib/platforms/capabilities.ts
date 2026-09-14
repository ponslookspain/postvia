import type { Platform } from "@prisma/client";
import type { MediaKind } from "@/lib/media";

export type CapabilityFieldType = "text" | "boolean" | "enum" | "number";

export type CapabilityField = {
  key: string;
  label: string;
  type: CapabilityFieldType;
  maxLength?: number;
  min?: number;
  required?: boolean;
  options?: readonly string[];
  mediaKinds?: readonly MediaKind[];
};

export type PlatformCapabilities = {
  platform: Platform;
  label: string;
  implemented: boolean;
  supportsText: boolean;
  media: {
    image: boolean;
    video: boolean;
    maxItems: number;
    requiredKind?: MediaKind;
    mimeTypes?: readonly string[];
  };
  fields: readonly CapabilityField[];
};

const THREADS: PlatformCapabilities = {
  platform: "THREADS",
  label: "Threads",
  implemented: true,
  supportsText: true,
  // Conscious product scope (NOT an API gap): the official Threads API
  // also supports carousel posts (media_type=CAROUSEL + children, 2+
  // items). Postvia publishes single-media posts only; multi-file
  // composer input fails closed with an explicit per-platform error.
  media: {
    image: true,
    video: true,
    maxItems: 1,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"],
  },
  fields: [
    { key: "text", label: "Text", type: "text", maxLength: 500 },
  ],
};

const X: PlatformCapabilities = {
  platform: "X",
  label: "X",
  implemented: true,
  supportsText: true,
  // Media via the X API v2 chunked upload (INIT → APPEND → FINALIZE →
  // STATUS) with the same user-context Bearer token: up to 4 photos,
  // 1 GIF, or 1 video attached as media_ids on POST /2/tweets.
  // Operator note: X bills pay-per-use per post (and more for posts
  // containing URLs); media posts cost the same as text posts.
  media: {
    image: true,
    video: true,
    maxItems: 4,
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ],
  },
  fields: [
    { key: "text", label: "Text", type: "text", maxLength: 280 },
  ],
};

const TIKTOK: PlatformCapabilities = {
  platform: "TIKTOK",
  label: "TikTok",
  implemented: true,
  // TikTok Direct Post requires media: exactly one video OR 1..4 photos
  // (Postvia global limit; the TikTok API itself allows up to 35).
  supportsText: false,
  media: {
    image: true,
    video: true,
    maxItems: 4,
    mimeTypes: [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "image/jpeg",
      "image/webp",
    ],
  },
  fields: [
    // The `title` capability is the superset gate (video caption, 2200):
    // the photo flow narrows it to 90 downstream in
    // resolveTiktokPhotoPostInfo, because capabilities are platform-level
    // while the title limit is media-flow-specific. `description` is
    // photo-only — the video endpoint has no such parameter.
    { key: "title", label: "Title", type: "text", maxLength: 2200 },
    {
      key: "description",
      label: "Description",
      type: "text",
      maxLength: 4000,
    },
    {
      key: "privacy_level",
      label: "Privacy",
      type: "enum",
      required: true,
      // Fallback whitelist only: the real options are served per-account by
      // /api/social/tiktok/creator-info and must drive the UI.
      options: [
        "PUBLIC_TO_EVERYONE",
        "MUTUAL_FOLLOW_FRIENDS",
        "FOLLOWER_OF_CREATOR",
        "SELF_ONLY",
      ],
    },
    { key: "disable_comment", label: "Allow comments", type: "boolean" },
    { key: "disable_duet", label: "Allow Duet", type: "boolean", mediaKinds: ["VIDEO"] },
    { key: "disable_stitch", label: "Allow Stitch", type: "boolean", mediaKinds: ["VIDEO"] },
    {
      key: "video_cover_timestamp_ms",
      label: "Cover timestamp (ms)",
      type: "number",
      min: 0,
    },
    {
      key: "photo_cover_index",
      label: "Cover photo index",
      type: "number",
      min: 0,
    },
  ],
};

const REGISTRY: Record<Platform, PlatformCapabilities> = {
  THREADS,
  X,
  TIKTOK,
  INSTAGRAM: {
    platform: "INSTAGRAM",
    label: "Instagram",
    implemented: true,
    // Conscious product scope (NOT an API gap): the official Content
    // Publishing API also supports carousels (CAROUSEL + up to 10
    // children), stories (STORIES), and alt_text on images. Postvia's MVP
    // publishes a single JPEG photo or a single MP4 Reel only; anything
    // else fails closed with an explicit per-platform error.
    // Text-only posts are not publishable.
    supportsText: false,
    media: {
      image: true,
      video: true,
      maxItems: 1,
      // Meta's Content Publishing accepts JPEG images only and MP4/MOV video;
      // our store uploads MP4, so the API-compatible pair is jpeg + mp4.
      mimeTypes: ["image/jpeg", "video/mp4"],
    },
    fields: [
      { key: "text", label: "Caption", type: "text", maxLength: 2200 },
    ],
  },
  FACEBOOK: {
    platform: "FACEBOOK",
    label: "Facebook",
    implemented: false,
    supportsText: true,
    media: { image: true, video: true, maxItems: 1 },
    fields: [],
  },
  LINKEDIN: {
    platform: "LINKEDIN",
    label: "LinkedIn",
    implemented: false,
    supportsText: true,
    media: { image: true, video: true, maxItems: 1 },
    fields: [],
  },
  YOUTUBE: {
    platform: "YOUTUBE",
    label: "YouTube",
    implemented: false,
    supportsText: false,
    media: { image: false, video: true, maxItems: 1 },
    fields: [],
  },
  PINTEREST: {
    platform: "PINTEREST",
    label: "Pinterest",
    implemented: false,
    supportsText: false,
    media: { image: true, video: true, maxItems: 1 },
    fields: [],
  },
};

export function getPlatformCapabilities(platform: Platform): PlatformCapabilities {
  return REGISTRY[platform];
}

export function getCapabilitiesRegistry(): readonly PlatformCapabilities[] {
  return Object.values(REGISTRY);
}
