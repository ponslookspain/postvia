/**
 * Media policy lives in `@/domain/media/policy` (pure, client-safe).
 * This module keeps only what must stay in `lib`:
 * - `makeBlobPathname` — storage path layout + random UUID (infrastructure);
 * - `resolveThreadsMediaPolicy` — platform-specific Threads rule, moving to
 *   `domain/social` policies on a later step (NOT part of Step 2a).
 *
 * Existing `@/lib/media` imports keep working through the re-export below.
 */
export * from "@/domain/media/policy";
import { slugifyPathSegment, type MediaKind } from "@/domain/media/policy";

export function makeBlobPathname(
  userId: string,
  postId: string,
  filename: string
): string {
  const safe = slugifyPathSegment(filename);
  const random = globalThis.crypto.randomUUID().replace(/-/g, "");
  return `media/${userId}/${postId}/${random}-${safe}`;
}

export type ThreadsMediaPolicy =
  | { kind: "text" }
  | { kind: "media"; mediaId: string; mediaType: MediaKind }
  | { kind: "error"; message: string };

const THREADS_MP4_MIME = "video/mp4";

export function resolveThreadsMediaPolicy(
  media: readonly { id: string; type: MediaKind; mimeType: string }[]
): ThreadsMediaPolicy {
  if (media.length === 0) return { kind: "text" };
  if (media.length > 1) {
    return {
      kind: "error",
      message: "Threads posts currently support one image or one video.",
    };
  }
  const only = media[0];
  if (only.type === "VIDEO" && only.mimeType !== THREADS_MP4_MIME) {
    return {
      kind: "error",
      message:
        "Threads video posts require an MP4 file. WebM videos are not supported by Threads.",
    };
  }
  return { kind: "media", mediaId: only.id, mediaType: only.type };
}
