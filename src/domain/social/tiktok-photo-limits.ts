/**
 * TikTok photo-flow limits (domain).
 *
 * Flow-specific limits from the TikTok Content Posting API reference
 * (`/v2/post/publish/content/init/` Post Info Object, photo flow):
 * title is a short photo title, description carries the caption body.
 *
 * These are deliberately NOT part of the platform-level capability
 * registry (`./capabilities`, title 2200 superset gate): the registry
 * describes what a platform supports, while these describe one
 * media-flow contract inside TikTok publishing. Every consumer —
 * the publish pipeline (`./policies/tiktok`, `src/lib/publish.ts`),
 * the composer preview model (`src/lib/composer-previews.ts`), the
 * upload guidance (`src/lib/composer-media.ts`) and bulk scheduling
 * (`src/lib/bulk-schedule.ts`) — imports from here, so the values
 * exist exactly once.
 *
 * DOMAIN RULE: zero dependencies (not even domain types), no Prisma,
 * no env, no fetch — safe to import from client bundles. Never add
 * provider runtime logic here.
 */

/** Photo title (`post_info.title` on the photo init endpoint). */
export const TIKTOK_PHOTO_TITLE_MAX_LENGTH = 90;

/** Photo description (`post_info.description`, photo flow only). */
export const TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH = 4000;

/** Per-photo byte cap enforced by the TikTok photo router. */
export const TIKTOK_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
