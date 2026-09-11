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
  // The current X provider publishes text only. Media is intentionally
  // blocked until X media upload is implemented separately.
  media: { image: false, video: false, maxItems: 0 },
  fields: [
    { key: "text", label: "Text", type: "text", maxLength: 280 },
  ],
};

const TIKTOK: PlatformCapabilities = {
  platform: "TIKTOK",
  label: "TikTok",
  implemented: true,
  // TikTok Direct Post requires media: exactly one video in the first scope.
  supportsText: false,
  media: {
    image: false,
    video: true,
    maxItems: 1,
    requiredKind: "VIDEO",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
  },
  fields: [
    { key: "title", label: "Title", type: "text", maxLength: 2200 },
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
    // Instagram professional accounts require media: single JPEG photo or
    // single MP4 Reel in the MVP. Text-only posts are not publishable.
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
