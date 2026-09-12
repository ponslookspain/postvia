import {
  logDiagnostic,
  logErrorDiagnostic,
  safePathname,
} from "@/lib/diagnostics";

/**
 * Orphan-blob sweep.
 *
 * A blob becomes an orphan when bytes land in the store but no Media row
 * ever references them: the browser PUT succeeded but the
 * `upload-completed` webhook never arrived (client crash, delivery gap),
 * or validation rejected the upload after the fact. Post and media
 * deletion already remove their blobs eagerly, so anything left behind is
 * garbage by definition.
 *
 * Safety rules:
 * - only blobs under the `media/` scope are ever considered;
 * - only blobs older than `olderThanMs` (default 24h) are eligible — the
 *   webhook + composer polling window is ~20s, registration retries land
 *   within minutes, so 24h cannot collide with a live upload;
 * - removals per run are capped (`maxRemovals`) so the sweep always fits
 *   inside the cron tick budget; leftovers wait for the next invocation.
 */

export const ORPHAN_BLOB_MAX_AGE_MS = 24 * 60 * 60_000;
export const ORPHAN_SWEEP_MAX_REMOVALS = 100;
/** Hard ceiling on scanned blobs per run: the sweep must always fit the tick. */
export const ORPHAN_SWEEP_MAX_SCANNED = 2000;
/** DB round-trips are batched in chunks of this size. */
export const ORPHAN_SWEEP_LOOKUP_CHUNK = 200;

export type SweepBlobListing = {
  pathname: string;
  uploadedAt: Date;
};

export type SweepListPage = {
  blobs: SweepBlobListing[];
  cursor?: string;
  hasMore: boolean;
};

export type SweepDeps = {
  listBlobs: (cursor?: string) => Promise<SweepListPage>;
  findRegistered: (pathnames: string[]) => Promise<Set<string>>;
  removeBlobs: (pathnames: string[]) => Promise<void>;
  now?: () => number;
};

export type SweepOutcome = {
  scanned: number;
  removed: number;
  hasMore: boolean;
};

export async function sweepOrphanBlobs(
  deps: SweepDeps,
  options: { olderThanMs?: number; maxRemovals?: number; maxScanned?: number } = {}
): Promise<SweepOutcome> {
  const olderThanMs = options.olderThanMs ?? ORPHAN_BLOB_MAX_AGE_MS;
  const maxRemovals = options.maxRemovals ?? ORPHAN_SWEEP_MAX_REMOVALS;
  const maxScanned = options.maxScanned ?? ORPHAN_SWEEP_MAX_SCANNED;
  const now = deps.now ?? Date.now;

  let cursor: string | undefined;
  let scanned = 0;
  let removed = 0;
  let exhausted = true;

  outer: for (;;) {
    const page = await deps.listBlobs(cursor);
    const candidates: SweepBlobListing[] = [];
    for (const blob of page.blobs) {
      if (!blob.pathname.startsWith("media/")) continue;
      if (scanned >= maxScanned) {
        exhausted = false;
        break outer;
      }
      scanned++;
      if (now() - blob.uploadedAt.getTime() < olderThanMs) continue;
      candidates.push(blob);
    }
    // One batched lookup per page instead of N round-trips.
    let registered = new Set<string>();
    if (candidates.length > 0) {
      try {
        registered = await deps.findRegistered(
          candidates.map((blob) => blob.pathname)
        );
      } catch {
        // On lookup failure keep every candidate: deleting on uncertain
        // state would risk removing a live upload.
        registered = new Set(candidates.map((blob) => blob.pathname));
      }
    }
    for (const blob of candidates) {
      if (registered.has(blob.pathname)) continue;
      if (removed >= maxRemovals) {
        exhausted = false;
        break outer;
      }
      try {
        await deps.removeBlobs([blob.pathname]);
        removed++;
        logDiagnostic("media", "orphan blob removed", {
          stage: "orphan-sweep",
          pathname: safePathname(blob.pathname),
        });
      } catch (error) {
        logErrorDiagnostic("media", "orphan blob removal failed", error, {
          stage: "orphan-sweep",
          pathname: safePathname(blob.pathname),
        });
      }
    }
    if (!page.hasMore || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }

  return { scanned, removed, hasMore: !exhausted };
}
