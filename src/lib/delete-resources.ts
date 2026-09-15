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
