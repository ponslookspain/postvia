/**
 * Orphan-blob sweep policy (domain).
 *
 * A blob becomes an orphan when bytes land in the store but no Media row
 * ever references them. Safety rules:
 * - only blobs under the `media/` scope are ever considered;
 * - only blobs older than `ORPHAN_BLOB_MAX_AGE_MS` (default 24h) are
 *   eligible — the webhook + composer polling window is ~20s, registration
 *   retries land within minutes, so 24h cannot collide with a live upload;
 * - removals per run are capped (`ORPHAN_SWEEP_MAX_REMOVALS`) so the sweep
 *   always fits inside the cron tick budget; leftovers wait for the next
 *   invocation.
 *
 * Data + ports only: the sweep runner (listing, lookup, deletion, logging)
 * stays in `src/lib/media-cleanup.ts`, which re-exports this module.
 *
 * DOMAIN RULE: import nothing except standard primitives. Never Prisma,
 * Blob SDK, Next.js, React, fetch, diagnostics, Sentry, or `process.env`.
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
