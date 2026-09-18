import type { Platform } from "@prisma/client";
import type { MediaKind } from "../media/policy";

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
  /**
   * Display/tab order across the app (composer switcher, account lists,
   * post filters). Lower first. Matches the historical order
   * (X, Threads, Instagram, TikTok); unimplemented stubs sort last.
   */
  order: number;
  /**
   * Accounts-page connect metadata. Present only for connectable
   * (implemented) platforms; derived lists (AccountsContent, post
   * filters) build on it instead of parallel hardcoded tables.
   */
  connect?: {
    /** Display name (may differ from the short label, e.g. "X (Twitter)"). */
    name: string;
    blurb: string;
    connectLabel: string;
    connectEndpoint: string;
    disconnectEndpoint: string;
    multi: boolean;
  };
  media: {
    image: boolean;
    video: boolean;
    maxItems: number;
    requiredKind?: MediaKind;
    mimeTypes?: readonly string[];
    /**
     * Per-kind byte caps STRICTER than the global MEDIA_LIMITS
     * (validateMediaInput: 10 MB images, 100 MB videos). Absent means the
     * platform accepts everything the global gate lets through:
     *   - video: Threads / X (official 512 MB chunked upload) / Instagram
     *     (Reels, GB-scale) / TikTok (Direct Post, GB-scale) all sit far
     *     above the global 100 MB ceiling, so no platform video cap binds.
     *   - image: only X stills are stricter (5 MB per photo). TikTok photos
     *     (20 MB) are LOOSER than global — a known gap: 10–20 MB JPEGs are
     *     blocked globally before TikTok's own gate. Narrowing the global
     *     image ceiling per platform is out of scope; the publish pipeline
     *     (resolveTiktokMediaPolicy) stays authoritative at publish time.
     * Sizes here mirror the provider constants (X_IMAGE_MAX_BYTES, …) —
     * update both sides together; a unit test pins the equality.
     */
    maxFileSizeBytes?: {
      image?: number;
      video?: number;
    };
    /** False: photos and video can never share one post on this platform. */
    supportsMixedMedia: boolean;
    /** False: at most one video per post, even when maxItems > 1. */
    supportsMultipleVideos: boolean;
  };
  fields: readonly CapabilityField[];
};

/** 5 MB — mirrors X_IMAGE_MAX_BYTES in @/lib/social/x. */
export const X_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const THREADS: PlatformCapabilities = {
  platform: "THREADS",
  label: "Threads",
  implemented: true,
  supportsText: true,
  order: 1,
  connect: {
    name: "Threads",
    blurb: "Text posts and replies on Threads",
    connectLabel: "Connect Threads",
    connectEndpoint: "/api/auth/threads/connect",
    disconnectEndpoint: "/api/accounts/threads",
    multi: true,
  },
  // Conscious product scope (NOT an API gap): the official Threads API
  // also supports carousel posts (media_type=CAROUSEL + children, 2+
  // items). Postvia publishes single-media posts only; multi-file
  // composer input fails closed with an explicit per-platform error.
  media: {
    image: true,
    video: true,
    maxItems: 1,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"],
    supportsMixedMedia: false,
    supportsMultipleVideos: false,
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
  order: 0,
  connect: {
    name: "X (Twitter)",
    blurb: "Short posts on X",
    connectLabel: "Connect X",
    connectEndpoint: "/api/auth/x/connect",
    disconnectEndpoint: "/api/accounts/x",
    multi: true,
  },
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
    // X stills are stricter than global (5 MB vs 10 MB). GIFs (15 MB
    // official) never bind: the global 10 MB image ceiling is tighter.
    // Video (official 512 MB chunked) never binds either.
    maxFileSizeBytes: { image: X_PHOTO_MAX_BYTES },
    supportsMixedMedia: false,
    supportsMultipleVideos: false,
  },
  fields: [
    { key: "text", label: "Text", type: "text", maxLength: 280 },
  ],
};

const TIKTOK: PlatformCapabilities = {
  platform: "TIKTOK",
  label: "TikTok",
  implemented: true,
  order: 3,
  connect: {
    name: "TikTok",
    blurb: "Vertical video on TikTok",
    connectLabel: "Connect TikTok",
    connectEndpoint: "/api/auth/tiktok/connect",
    disconnectEndpoint: "/api/accounts/tiktok",
    multi: true,
  },
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
    supportsMixedMedia: false,
    supportsMultipleVideos: false,
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
    order: 2,
    connect: {
      name: "Instagram",
      blurb: "Photos and reels on Instagram",
      connectLabel: "Connect Instagram",
      connectEndpoint: "/api/auth/instagram/connect",
      disconnectEndpoint: "/api/accounts/instagram",
      multi: true,
    },
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
      supportsMixedMedia: false,
      supportsMultipleVideos: false,
    },
    fields: [
      { key: "text", label: "Caption", type: "text", maxLength: 2200 },
    ],
  },
  FACEBOOK: {
    platform: "FACEBOOK",
    label: "Facebook",
    implemented: false,
    order: 99,
    supportsText: true,
    media: { image: true, video: true, maxItems: 1, supportsMixedMedia: false, supportsMultipleVideos: false },
    fields: [],
  },
  LINKEDIN: {
    platform: "LINKEDIN",
    label: "LinkedIn",
    implemented: false,
    order: 99,
    supportsText: true,
    media: { image: true, video: true, maxItems: 1, supportsMixedMedia: false, supportsMultipleVideos: false },
    fields: [],
  },
  YOUTUBE: {
    platform: "YOUTUBE",
    label: "YouTube",
    implemented: false,
    order: 99,
    supportsText: false,
    media: { image: false, video: true, maxItems: 1, supportsMixedMedia: false, supportsMultipleVideos: false },
    fields: [],
  },
  PINTEREST: {
    platform: "PINTEREST",
    label: "Pinterest",
    implemented: false,
    order: 99,
    supportsText: false,
    media: { image: true, video: true, maxItems: 1, supportsMixedMedia: false, supportsMultipleVideos: false },
    fields: [],
  },
};

export function getPlatformCapabilities(platform: Platform): PlatformCapabilities {
  return REGISTRY[platform];
}

export function getCapabilitiesRegistry(): readonly PlatformCapabilities[] {
  return Object.values(REGISTRY);
}

/**
 * Connectable platforms in display order. Single source for every
 * platform list in the app (accounts page, post filters, composer
 * switcher, preview order) — adding a platform means adding one
 * registry entry, not editing each list.
 */
export function getImplementedPlatforms(): PlatformCapabilities[] {
  return Object.values(REGISTRY)
    .filter((caps) => caps.implemented)
    .sort((a, b) => a.order - b.order);
}
