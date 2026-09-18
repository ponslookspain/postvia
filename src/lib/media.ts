/**
 * Media policy lives in `@/domain/media/policy` (pure, client-safe).
 * This module keeps only what must stay in `lib`:
 * - `makeBlobPathname` — storage path layout + random UUID (infrastructure).
 *
 * Threads media policy lives in `@/domain/social/policies/threads` and is
 * re-exported here so existing `@/lib/media` imports keep working.
 *
 * Existing `@/lib/media` imports keep working through the re-exports below.
 */
export * from "@/domain/media/policy";
export * from "@/domain/social/policies/threads";
export type * from "@/domain/social/policies/threads";
import { slugifyPathSegment } from "@/domain/media/policy";

export function makeBlobPathname(
  userId: string,
  postId: string,
  filename: string
): string {
  const safe = slugifyPathSegment(filename);
  const random = globalThis.crypto.randomUUID().replace(/-/g, "");
  return `media/${userId}/${postId}/${random}-${safe}`;
}
