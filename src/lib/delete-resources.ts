import { reportError } from "@/lib/diagnostics";

/**
 * Delete orchestration for single posts and media rows (F4).
 *
 * Ordering is DB-first, deliberately: if blob deletion fails after the
 * row is gone, the leftover bytes are plain orphans that the existing
 * capped orphan sweep reclaims. The reverse order (blobs first) fails
 * into rows pointing at missing bytes — user-visible breakage with no
 * recovery path. Quota ledgers are never touched here (deleting never
 * refills monthly quota — fail-closed by design).
 *
 * Pure orchestration over injected steps, unit-testable without a
 * database — same pattern as `runScheduleFlow` in composer-media.
 */

export type ReportFn = (
  scope: string,
  event: string,
  error: unknown,
  extra?: Record<string, unknown>
) => void;

export type PostDeleteOutcome =
  /** Row (and cascaded targets/media rows) deleted, blobs removed. */
  | { outcome: "deleted" }
  /** Row already gone (or never owned): no blob work attempted. */
  | { outcome: "not-found" }
  /** Row deleted but blob removal failed: bytes remain as sweepable orphans. */
  | { outcome: "blobs-failed"; orphanPathnames: string[] }
  /** Row deletion itself failed: nothing was removed. */
  | { outcome: "failed" };

export async function runPostDeleteFlow(input: {
  postId: string;
  userId: string;
  mediaPathnames: readonly string[];
  deletePostRow: (postId: string, userId: string) => Promise<"deleted" | "missing">;
  deleteBlobs: (pathnames: string[]) => Promise<void>;
  report?: ReportFn;
}): Promise<PostDeleteOutcome> {
  const report = input.report ?? reportError;
  let row: "deleted" | "missing";
  try {
    row = await input.deletePostRow(input.postId, input.userId);
  } catch (error) {
    report("media", "post row delete failed", error, {
      postId: input.postId,
    });
    return { outcome: "failed" };
  }
  if (row === "missing") return { outcome: "not-found" };
  if (input.mediaPathnames.length === 0) return { outcome: "deleted" };
  try {
    await input.deleteBlobs([...input.mediaPathnames]);
  } catch (error) {
    report("media", "post blob delete failed after row delete", error, {
      postId: input.postId,
      orphanCount: input.mediaPathnames.length,
    });
    return { outcome: "blobs-failed", orphanPathnames: [...input.mediaPathnames] };
  }
  return { outcome: "deleted" };
}

/**
 * Blob keys removed per `del()` call.
 *
 * Account deletion passes every pathname a user ever stored, which is
 * unbounded — a single call with thousands of keys is both a provider-limit
 * risk and an all-or-nothing failure. Chunking keeps each call small and lets
 * a partial failure still remove most of the bytes.
 */
export const BLOB_DELETE_CHUNK = 100;

export function chunkPathnames(
  pathnames: readonly string[],
  size: number = BLOB_DELETE_CHUNK
): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < pathnames.length; i += size) {
    chunks.push([...pathnames.slice(i, i + size)]);
  }
  return chunks;
}

export type AccountDeleteOutcome =
  /** Rows gone, every blob removed. */
  | { outcome: "deleted" }
  /**
   * Rows gone, some bytes remain. The account IS deleted — the leftovers are
   * plain orphans (no row references them) that the capped 24h sweep
   * reclaims, so this is a SUCCESS for the user, not a failure.
   */
  | { outcome: "deleted-with-orphans"; orphanPathnames: string[] }
  /** The transaction failed: nothing was removed, and no bytes were touched. */
  | { outcome: "failed" };

/**
 * Account deletion, ordered DB-first like every other delete flow here (F4).
 *
 * This used to run blob deletion BEFORE the transaction, which inverted the
 * policy documented at the top of this file: if the transaction then failed
 * (a P2028 timeout is realistic — it deletes targets, media, posts, accounts,
 * sessions and auth rows in one interactive transaction), the user survived
 * with Media rows pointing at bytes that no longer existed. That state is
 * permanently broken with no recovery path, whereas the reverse — bytes with
 * no rows — is exactly what the orphan sweep already reclaims.
 *
 * Storage work deliberately stays OUTSIDE the transaction: holding a pool
 * connection across N network round-trips is the failure mode the billing
 * checkout comment warns about.
 */
export async function runAccountDeleteFlow(input: {
  userId: string;
  mediaPathnames: readonly string[];
  /** The ownership-removal transaction. Must throw to signal failure. */
  deleteAccountRows: () => Promise<void>;
  deleteBlobs: (pathnames: string[]) => Promise<void>;
  chunkSize?: number;
  report?: ReportFn;
}): Promise<AccountDeleteOutcome> {
  const report = input.report ?? reportError;

  try {
    await input.deleteAccountRows();
  } catch (error) {
    // Nothing was removed and no bytes were touched: the user can retry.
    report("account", "account delete transaction failed", error, {
      userId: input.userId,
      mediaCount: input.mediaPathnames.length,
    });
    return { outcome: "failed" };
  }

  if (input.mediaPathnames.length === 0) return { outcome: "deleted" };

  const orphans: string[] = [];
  for (const chunk of chunkPathnames(input.mediaPathnames, input.chunkSize)) {
    try {
      await input.deleteBlobs(chunk);
    } catch (error) {
      // Keep going: one failed chunk must not strand the rest of the bytes.
      orphans.push(...chunk);
      report("account", "account blob delete failed after row delete", error, {
        userId: input.userId,
        orphanCount: chunk.length,
      });
    }
  }

  if (orphans.length > 0) {
    return { outcome: "deleted-with-orphans", orphanPathnames: orphans };
  }
  return { outcome: "deleted" };
}

export type MediaDeleteOutcome = PostDeleteOutcome;

export async function runMediaDeleteFlow(input: {
  mediaId: string;
  userId: string;
  pathname: string | null;
  deleteMediaRow: (mediaId: string, userId: string) => Promise<"deleted" | "missing">;
  deleteBlobs: (pathnames: string[]) => Promise<void>;
  report?: ReportFn;
}): Promise<MediaDeleteOutcome> {
  const report = input.report ?? reportError;
  let row: "deleted" | "missing";
  try {
    row = await input.deleteMediaRow(input.mediaId, input.userId);
  } catch (error) {
    report("media", "media row delete failed", error, {
      mediaId: input.mediaId,
    });
    return { outcome: "failed" };
  }
  if (row === "missing") return { outcome: "not-found" };
  if (!input.pathname) return { outcome: "deleted" };
  try {
    await input.deleteBlobs([input.pathname]);
  } catch (error) {
    report("media", "media blob delete failed after row delete", error, {
      mediaId: input.mediaId,
    });
    return { outcome: "blobs-failed", orphanPathnames: [input.pathname] };
  }
  return { outcome: "deleted" };
}
