/**
 * Canonical image policy for stored media.
 *
 * The store keeps one optimized canonical version per upload — never the
 * heavy original:
 * - still images (JPEG/PNG/WebP) are normalized to JPEG, max 2048px wide,
 *   quality 82 via Vercel's server-side `putImage` (no extra dependency,
 *   OIDC-authenticated, billed as one transformation + one put);
 * - animated GIFs are kept byte-identical (re-encoding would destroy the
 *   animation, and Threads serves GIFs natively);
 * - already-small JPEGs skip the transform (no pointless quality loss or
 *   billed transformation);
 * - videos pass through untouched: no heavy transcoding inside a request.
 *   The upload-completed webhook + client polling + cron recovery already
 *   form the async pipeline videos travel through.
 *
 * The strictest publisher (Instagram: JPEG + MP4 only) drives the canonical
 * choice, so one stored object satisfies every platform in the capability
 * registry without per-platform variants.
 */

export const CANONICAL_IMAGE_WIDTH = 2048;
export const CANONICAL_IMAGE_QUALITY = 82;
/** JPEGs at or below this size are already canonical enough to keep. */
export const CANONICAL_JPEG_SKIP_BYTES = 512 * 1024;

export type CanonicalImageSpec = {
  width: number;
  quality: number;
  format: "jpeg";
};

/**
 * Pure decision: which canonical transform applies to an upload, or null
 * when the original should be stored as-is (GIF, video, tiny JPEG).
 */
export function selectImageOptimization(input: {
  mimeType: string;
  size: number;
}): CanonicalImageSpec | null {
  if (input.mimeType === "image/gif") return null;
  if (
    input.mimeType === "image/jpeg" &&
    input.size <= CANONICAL_JPEG_SKIP_BYTES
  ) {
    return null;
  }
  if (
    input.mimeType === "image/jpeg" ||
    input.mimeType === "image/png" ||
    input.mimeType === "image/webp"
  ) {
    return {
      width: CANONICAL_IMAGE_WIDTH,
      quality: CANONICAL_IMAGE_QUALITY,
      format: "jpeg",
    };
  }
  return null;
}
