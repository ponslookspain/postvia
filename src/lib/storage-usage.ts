import { logDiagnostic } from "@/lib/diagnostics";
import { traceUserId } from "@/lib/diagnostics-server";

/**
 * Per-user storage usage — measurement and alerting only, no enforcement.
 *
 * There is no quota anywhere in the product: a user can accumulate
 * unlimited media forever, on Free or paid, and nobody would notice until
 * the Blob bill did. Before picking a real byte limit per plan (a pricing
 * decision, not an engineering one), this surfaces who is actually
 * accumulating a lot of storage, so that decision can be made from real
 * usage data instead of a guess.
 *
 * `STORAGE_ALERT_BYTES` is a diagnostic tripwire, not a product limit: it
 * never blocks an upload, never appears in the UI, and exists only to put
 * heavy accounts in the logs. Treat the default as a placeholder to tune
 * once real numbers come in, the same way `MEDIA_MAX_VIDEO_SECONDS` ships
 * implemented-but-unset elsewhere in this codebase.
 */
export const STORAGE_ALERT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

/** Heaviest accounts logged per run, so a bad day can't flood the logs. */
export const STORAGE_ALERT_MAX_USERS = 20;

export type HeavyStorageUser = { userId: string; totalBytes: number };

export type StorageUsageDeps = {
  /** Users whose summed Media.size is at or above `thresholdBytes`, heaviest first. */
  findUsersOverThreshold: (
    thresholdBytes: number,
    limit: number
  ) => Promise<HeavyStorageUser[]>;
};

/**
 * Logs (never blocks) every user currently over the tripwire. Best-effort:
 * a failure here must never affect publishing, so callers wrap this the
 * same way every other cron sweep is wrapped.
 */
export async function reportHeavyStorageUsers(
  deps: StorageUsageDeps,
  options: { thresholdBytes?: number; limit?: number } = {}
): Promise<HeavyStorageUser[]> {
  const thresholdBytes = options.thresholdBytes ?? STORAGE_ALERT_BYTES;
  const limit = options.limit ?? STORAGE_ALERT_MAX_USERS;

  const heavy = await deps.findUsersOverThreshold(thresholdBytes, limit);

  for (const user of heavy) {
    logDiagnostic("storage-usage", "user over storage tripwire", {
      userHash: traceUserId(user.userId),
      totalBytes: user.totalBytes,
      thresholdBytes,
    });
  }

  return heavy;
}
