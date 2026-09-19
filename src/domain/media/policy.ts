export type MediaKind = "IMAGE" | "VIDEO";

/**
 * Authoritative media-kind registry (E2). Exactly one list of kinds;
 * per-kind global policy stays in MEDIA_LIMITS below (single source —
 * `MEDIA_KIND_META` derives from it, never duplicates it). Adding a
 * kind (audio, carousel, document) starts here; platform policies and
 * overrides consume it instead of parallel unions/booleans.
 */
export const MEDIA_KINDS: readonly MediaKind[] = ["IMAGE", "VIDEO"];

/** Type guard for unknown values (DB rows, API input, webhook payloads). */
export function isMediaKind(value: unknown): value is MediaKind {
  return value === "IMAGE" || value === "VIDEO";
}

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
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
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

export type MediaKindMeta = {
  kind: MediaKind;
  /** Singular noun for messages ("image"/"video"). */
  noun: string;
  maxBytes: number;
  mimeTypes: readonly string[];
};

/**
 * Per-kind metadata derived from MEDIA_LIMITS (never duplicated).
 * Declared after MEDIA_LIMITS so module init order is safe.
 */
export const MEDIA_KIND_META: Record<MediaKind, MediaKindMeta> = {
  IMAGE: {
    kind: "IMAGE",
    noun: "image",
    maxBytes: MEDIA_LIMITS.IMAGE.maxBytes,
    mimeTypes: MEDIA_LIMITS.IMAGE.mimeTypes,
  },
  VIDEO: {
    kind: "VIDEO",
    noun: "video",
    maxBytes: MEDIA_LIMITS.VIDEO.maxBytes,
    mimeTypes: MEDIA_LIMITS.VIDEO.mimeTypes,
  },
};

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
        "Unsupported file type. Use a JPG, PNG, WebP or GIF image, or an MP4, WebM or MOV video.",
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

export function isAscii(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

/** Human file-size label for upload rows (B/KB/MB). Pure, client-safe. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function slugifyPathSegment(filename: string): string {
  const ascii = filename
    .replace(UNSAFE_FILENAME_CHARS, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "")
    .trim();
  const dot = ascii.lastIndexOf(".");
  const base = dot > 0 ? ascii.slice(0, dot) : ascii;
  const ext = dot > 0 ? ascii.slice(dot + 1) : "";
  const name =
    base.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_") || "file";
  const keptExt = /^[A-Za-z0-9]{1,10}$/.test(ext) ? `.${ext}` : "";
  return `${name.slice(0, 80 - keptExt.length)}${keptExt}`;
}

export const MAX_MEDIA_PER_POST = 4;
