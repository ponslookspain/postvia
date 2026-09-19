import type {
  SchedulingDb,
  StaleJobResumeResult,
  StoredPostTarget,
  TickStats,
} from "../scheduling";
import {
  emitPublishFailure,
  emitPublishRetry,
  emitPublishTimeout,
} from "@/lib/publish-observability";

/**
 * A post still in PUBLISHING cannot have a running publish function behind
 * it: an invocation dies at the platform ceiling, so anything older than this
 * is crashed/killed and eligible for recovery.
 *
 * Must stay comfortably ABOVE the function ceiling — that margin is the whole
 * reason recovery can never reset a live publish and double-post. At the
 * Hobby ceiling (60s) the margin is 6x; `tests/cron-schedule.test.ts` pins the
 * relationship so a plan upgrade cannot silently erase it.
 */
export const STALE_PUBLISHING_MS = 6 * 60_000;

/** A stale post that was scheduled longer ago than this is not re-queued. */
export const SCHEDULE_VALIDITY_MS = 24 * 60 * 60_000;

/**
 * Same bound for the recovery pass. Stale rows are rare (they only appear
 * after a crashed/killed function), so this ceiling is lower — but it must
 * exist for the same reason: a bad deploy can strand many posts at once.
 */
export const STALE_RECOVERY_BATCH = 100;

const TIMEOUT_MESSAGE =
  "Scheduled publication timed out while processing. Open the post and publish it manually.";

/**
 * Phase 1 of a tick: heal posts stuck in PUBLISHING (crash / killed
 * function). Order matters: a target that already holds an
 * externalPostId is only FINALIZED, never re-published, so recovery can
 * never double-post on Threads.
 */
export async function recoverStalePublishing(
  db: SchedulingDb,
  now: Date,
  options: {
    resumeJob?: (target: StoredPostTarget) => Promise<StaleJobResumeResult>;
    batchSize?: number;
  } = {}
): Promise<Pick<TickStats, "recovered" | "finalized" | "expired">> {
  const stats = { recovered: 0, finalized: 0, expired: 0 };
  const cutoff = new Date(now.getTime() - STALE_PUBLISHING_MS);

  // Bounded + oldest-stuck-first, matching `@@index([status, updatedAt])`:
  // a bad deploy can strand many posts at once, and the recovery pass must
  // stay a batch instead of loading every stranded row into memory.
  const stale = await db.post.findMany({
    where: { status: "PUBLISHING", updatedAt: { lt: cutoff } },
    include: { targets: true },
    orderBy: { updatedAt: "asc" },
    take: options.batchSize ?? STALE_RECOVERY_BATCH,
  });

  for (const post of stale) {
    // Resume-first for targets with an external job id (TikTok publish id,
    // Instagram/Threads container id, X attempt marker): their publish may
    // already be running platform-side — or its outcome may be unknowable
    // (X). Never blind-reset such a target.
    let pendingJob = false;
    let jobsResolved = false;
    for (const target of post.targets) {
      if (target.status !== "PUBLISHING" || !target.externalJobId) continue;
      const result = options.resumeJob
        ? await options.resumeJob(target)
        : "pending";
      if (result === "pending") {
        pendingJob = true;
      } else if (result === "complete" || result === "failed") {
        jobsResolved = true;
      }
    }
    if (pendingJob) continue; // leave PUBLISHING; re-checked next tick

    const current = jobsResolved
      ? ((await db.post.findMany({ where: { id: post.id }, include: { targets: true } }))[0] ?? post)
      : post;

    const published = current.targets.filter((t) => t.status === "PUBLISHED");
    const failed = current.targets.filter((t) => t.status === "FAILED");
    const total = current.targets.length;
    const targetErrors = current.targets
      .filter((t) => t.status === "FAILED" && t.errorMessage)
      .map((t) => `${t.platform}: ${t.errorMessage}`)
      .join("; ");

    // All writes below are conditional on the post still being PUBLISHING:
    // a slow publish may have completed concurrently since the snapshot.
    if (total > 0 && published.length === total) {
      const latest = Math.max(
        ...published.map((t) => (t.publishedAt ?? now).getTime())
      );
      const claimed = await db.post.updateMany({
        where: { id: post.id, status: "PUBLISHING" },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(latest),
          errorMessage: null,
        },
      });
      if (claimed.count > 0) stats.finalized++;
      continue;
    }

    if (total > 0 && published.length > 0 && failed.length === total - published.length) {
      const claimed = await db.post.updateMany({
        where: { id: post.id, status: "PUBLISHING" },
        data: {
          status: "PARTIALLY_PUBLISHED",
          publishedAt: null,
          errorMessage: targetErrors || null,
        },
      });
      if (claimed.count > 0) stats.finalized++;
      continue;
    }

    if (total > 0 && failed.length === total) {
      const claimed = await db.post.updateMany({
        where: { id: post.id, status: "PUBLISHING" },
        data: { status: "FAILED", errorMessage: targetErrors || "All publish attempts failed." },
      });
      if (claimed.count > 0) stats.finalized++;
      continue;
    }

    const tooOld =
      post.scheduledAt !== null &&
      now.getTime() - post.scheduledAt.getTime() > SCHEDULE_VALIDITY_MS;

    if (tooOld) {
      await db.postTarget.updateMany({
        where: { postId: post.id, status: "PUBLISHING" },
        data: { status: "FAILED", errorMessage: TIMEOUT_MESSAGE },
      });
      const claimed = await db.post.updateMany({
        where: { id: post.id, status: "PUBLISHING" },
        data: { status: "FAILED", errorMessage: TIMEOUT_MESSAGE },
      });
      if (claimed.count > 0) {
        stats.expired++;
        // Observability-only: stuck past the validity window is a real
        // timeout, then a terminal failure — per target, allowlisted.
        for (const target of current.targets) {
          if (target.status !== "PUBLISHING") continue;
          emitPublishTimeout({
            provider: target.platform,
            postId: post.id,
            targetId: target.id,
            attempt: 2,
            duration: 0,
          });
          emitPublishFailure({
            provider: target.platform,
            postId: post.id,
            targetId: target.id,
            attempt: 2,
            duration: 0,
          });
        }
      }
      continue;
    }

    await db.postTarget.updateMany({
      where: { postId: post.id, status: "PUBLISHING" },
      data: { status: "PENDING", errorMessage: null },
    });
    // A manually published (never scheduled) post has no due date to be
    // re-queued on — resetting it to SCHEDULED would strand it forever.
    const resetStatus = post.scheduledAt === null ? "DRAFT" : "SCHEDULED";
    const claimed = await db.post.updateMany({
      where: { id: post.id, status: "PUBLISHING" },
      data: { status: resetStatus, errorMessage: null },
    });
    if (claimed.count > 0) {
      stats.recovered++;
      // Observability-only: crashed-attempt re-queue is a real retry
      // re-entry (the next tick/claim emits the following attempt).
      for (const target of current.targets) {
        if (target.status !== "PUBLISHING") continue;
        emitPublishRetry({
          provider: target.platform,
          postId: post.id,
          targetId: target.id,
          attempt: 2,
        });
      }
    }
  }

  return stats;
}
