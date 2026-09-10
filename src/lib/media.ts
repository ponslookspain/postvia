export type MediaKind = "IMAGE" | "VIDEO";

export const MEDIA_LIMITS: {
  IMAGE: { maxBytes: number; mimeTypes: readonly string[] };
  VIDEO: { maxBytes: number; mimeTypes: readonly string[] };
} = {
  IMAGE: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  VIDEO: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/webm"],
  },
};

export function detectMediaKind(mimeType: string): MediaKind | null {
  if (MEDIA_LIMITS.IMAGE.mimeTypes.includes(mimeType)) return "IMAGE";
  if (MEDIA_LIMITS.VIDEO.mimeTypes.includes(mimeType)) return "VIDEO";
  return null;
}

export function formatMaxMegabytes(kind: MediaKind): string {
  return String(MEDIA_LIMITS[kind].maxBytes / (1024 * 1024));
}

export type MediaValidation =
  | { ok: true; kind: MediaKind }
  | { ok: false; error: string };

export function validateMediaInput(
  mimeType: string,
  size: number
): MediaValidation {
  if (!mimeType) {
    return { ok: false, error: "File type could not be determined" };
  }
  const kind = detectMediaKind(mimeType);
  if (!kind) {
    return {
      ok: false,
      error:
        "Unsupported file type. Use a JPG, PNG, WebP or GIF image, or an MP4 or WebM video.",
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (size > MEDIA_LIMITS[kind].maxBytes) {
    return {
      ok: false,
      error: `File exceeds the ${formatMaxMegabytes(kind)} MB limit for ${
        kind === "IMAGE" ? "images" : "videos"
      }`,
    };
  }
  return { ok: true, kind };
}

const UNSAFE_FILENAME_CHARS = /[\\/<>:"'`|?*%#&\x00-\x1f\x7f]/g;

export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(UNSAFE_FILENAME_CHARS, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return cleaned || "file";
}

export function makeBlobPathname(userId: string, filename: string): string {
  const safe = sanitizeFilename(filename);
  const random = globalThis.crypto.randomUUID().replace(/-/g, "");
  return `media/${userId}/${random}-${safe}`;
}

export type ThreadsMediaPolicy =
  | { kind: "text" }
  | { kind: "image"; mediaId: string }
  | { kind: "error"; message: string };

export function resolveThreadsMediaPolicy(
  media: readonly { id: string; type: MediaKind }[]
): ThreadsMediaPolicy {
  if (media.length === 0) return { kind: "text" };
  if (media.length > 1) {
    return {
      kind: "error",
      message: "Threads image posts currently support one image.",
    };
  }
  const only = media[0];
  if (only.type !== "IMAGE") {
    return {
      kind: "error",
      message: "Threads posts currently support images only.",
    };
  }
  return { kind: "image", mediaId: only.id };
}