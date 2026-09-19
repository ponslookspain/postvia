/**
 * Video inspection adapter.
 *
 * Pure inspection (`probeIsoBaseMediaDuration`, `checkVideoDuration`, …)
 * lives in `@/domain/media/video`. This module keeps the environment
 * boundary (`maxVideoDurationSeconds` reads `MEDIA_MAX_VIDEO_SECONDS`)
 * and re-exports the domain functions so existing
 * `@/lib/media-video` imports keep working. No behavior change.
 */
export * from "@/domain/media/video";

/**
 * Optional outer bound on video length.
 *
 * Deliberately NOT given a default. Every platform has its own cap and
 * choosing Postvia's is a product decision, not an engineering one — see
 * docs/backend-audit-followup.md. Unset (the shipped state) means duration is
 * measured and recorded but never used to reject.
 */
export function maxVideoDurationSeconds(
  env: Record<string, string | undefined> = process.env
): number | null {
  const raw = Number(env.MEDIA_MAX_VIDEO_SECONDS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return null;
}
