import { logDiagnostic, logErrorDiagnostic } from "@/lib/diagnostics";

/**
 * Retention for media on old, fully-published posts (storage-cost guard).
 *
 * Nothing ever expired a Media row: a post published a year ago keeps its
 * original image/video bytes in Blob storage forever, at full price, even
 * though the platform already has the copy it published and the composer
 * has no reason to ever re-read the original. Free and paid users accrue
 * this cost identically, unbounded by how much they pay.
 *
 * Eligibility is deliberately narrow — a post qualifies only when it can
 * never need its media again:
 *   - `status = "PUBLISHED"` — every target succeeded. A `FAILED` or
 *     `PARTIALLY_PUBLISHED` post is reachable from "Retry", which re-reads
 *     the original media; those posts are never swept, regardless of age.
 *   - `updatedAt` older than the horizon — reused instead of adding a new
 *     index on `publishedAt`. `Post.updatedAt` is bumped by the same write
 *     that sets `status: "PUBLISHED"` (Prisma `@updatedAt`), and a
 *     published post is not written again, so the existing
 *     `@@index([status, updatedAt])` already serves this query with no
 *     schema change — worth revisiting only if that assumption stops
 *     holding (e.g. a future feature edits published posts).
 *
 * The Post row and its text are NOT touched — only its `Media` rows and
 * their blobs. A swept post keeps its place in history/analytics; it just
 * stops carrying its original attachment.
 *
 * Deletion order follows the same DB-first policy as account deletion
 * (P1.6, `delete-resources.ts`): the Media row is removed before its blob.
 * If the blob delete then fails, the result is an unregistered blob —
 * which is exactly what the existing orphan-blob sweep
 * (`media-cleanup.ts`) looks for and removes on a later tick. The reverse
 * order (blob first) risks a Media row pointing at bytes that no longer
 * exist, which is unrecoverable and user-visible.
 *
 * Default horizon is deliberately conservative (12 months): the goal of
 * this first pass is to stop unbounded growth from posts nobody will ever
 * revisit, not to aggressively reclaim space. Tighten `MEDIA_RETENTION_MS`
 * once real storage-usage data (see `storage-usage.ts`) shows it's needed.
 */
export const MEDIA_RETENTION_MS = 365 * 86_400_000;

/** Media rows reaped per DB statement. Mirrors RATE_BUCKET_SWEEP_BATCH. */
export const MEDIA_RETENTION_BATCH = 100;

/**
 * Hard ceiling on batches per cron tick, so this sweep can never itself
 * blow the tick budget. A backlog beyond the cap carries to the next
 * invocation — daily on Hobby, so at most 500 media/day is reclaimed by
 * this sweep alone; that is a deliberate trade against tick-budget safety,
 * not a target.
 */
export const MEDIA_RETENTION_MAX_BATCHES = 5;

export type EligibleMedia = { id: string; pathname: string };

export type MediaRetentionDeps = {
  /** Media rows attached to a PUBLISHED post untouched since before `olderThan`. */
  findEligible: (olderThan: Date, limit: number) => Promise<EligibleMedia[]>;
  /** Deletes the given Media rows; returns how many existed. */
  deleteMediaRows: (ids: string[]) => Promise<number>;
  /** Best-effort blob removal. May throw; the sweep tolerates it. */
  deleteBlobs: (pathnames: string[]) => Promise<void>;
};

export type MediaRetentionOutcome = {
  /** Media rows removed from the database (the durable, user-visible effect). */
  removed: number;
  /** Blobs the sweep failed to delete — left for the orphan-blob sweep. */
  blobFailures: number;
};

export async function sweepPublishedMedia(
  olderThan: Date,
  deps: MediaRetentionDeps,
  options: { batchSize?: number; maxBatches?: number } = {}
): Promise<MediaRetentionOutcome> {
  const batchSize = options.batchSize ?? MEDIA_RETENTION_BATCH;
  const maxBatches = options.maxBatches ?? MEDIA_RETENTION_MAX_BATCHES;

  let removed = 0;
  let blobFailures = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const eligible = await deps.findEligible(olderThan, batchSize);
    if (eligible.length === 0) break;

    const ids = eligible.map((row) => row.id);
    const pathnames = eligible.map((row) => row.pathname);

    // DB-first: once the Media row is gone, a failed blob delete only
    // leaves an unregistered (harmless, self-healing) blob behind.
    const deleted = await deps.deleteMediaRows(ids);
    removed += deleted;

    try {
      await deps.deleteBlobs(pathnames);
    } catch (error) {
      blobFailures += pathnames.length;
      logErrorDiagnostic("media-retention", "blob delete failed", error, {
        count: pathnames.length,
      });
    }

    if (eligible.length < batchSize) break;
  }

  if (removed > 0 || blobFailures > 0) {
    logDiagnostic("media-retention", "sweep complete", {
      removed,
      blobFailures,
    });
  }

  return { removed, blobFailures };
}
