import type { PublishOutcome } from "@/lib/publish";
import { selectPublishableTargetIds } from "@/lib/publish";
import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/diagnostics";

const AUTH_PREFIX = "Bearer ";

/**
 * A post still in PUBLISHING cannot have a running publish function:
 * functions are capped at maxDuration 300s, so anything older than this
 * is considered crashed/killed and eligible for recovery.
 */
export const STALE_PUBLISHING_MS = 6 * 60_000;

/** A stale post that was scheduled longer ago than this is not re-queued. */
export const SCHEDULE_VALIDITY_MS = 24 * 60 * 60_000;

/** Stop claiming new posts after this much of a tick so the function
 *  finishes inside maxDuration; leftovers wait for the next invocation. */
export const CRON_TICK_BUDGET_MS = 240_000;

/**
 * Timing-safe comparison of the `Authorization: Bearer <CRON_SECRET>`
 * header. Missing/empty secret always rejects, so there is no
 * unauthenticated execution path.
 */
export function isCronAuthorized(authHeader: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) return false;
  if (!authHeader || !authHeader.startsWith(AUTH_PREFIX)) return false;

  const provided = authHeader.slice(AUTH_PREFIX.length);
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Shared cron route wrapper (E5): Bearer auth gate + generic 500 envelope
 * with diagnostics. Route handlers pass only their work function; GET and
 * POST share it (Vercel Cron uses GET, manual triggers use POST). A
 * handler failure can never leak internals — the raw cause stays in
 * diagnostics.
 */
export function withCron(
  handler: (request: NextRequest) => Promise<NextResponse>
): {
  GET: (request: NextRequest) => Promise<NextResponse>;
  POST: (request: NextRequest) => Promise<NextResponse>;
} {
  const wrapped = async (request: NextRequest): Promise<NextResponse> => {
    if (!isCronAuthorized(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      return await handler(request);
    } catch (error) {
      reportError("cron", "cron handler failed", error);
      return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
    }
  };
  return { GET: wrapped, POST: wrapped };
}

export type StoredPostTarget = {
  id: string;
  status: string;
  platform: string;
  /** Bound account for this target; resolution is always by this id. */
  socialAccountId?: string | null;
  externalPostId: string | null;
  publishedAt: Date | null;
  externalJobId?: string | null;
  errorMessage?: string | null;
};

export type StaleJobResumeResult = "complete" | "failed" | "pending" | "skip";

export type StoredPost = {
  id: string;
  userId: string;
  status: string;
  text: string;
  scheduledAt: Date | null;
  targets: StoredPostTarget[];
};

export type SocialAccountRow = {
  accessToken: string;
  externalId: string;
  username: string;
};

/**
 * Coarse structural view of the Prisma pieces the scheduler uses, so the
 * tick logic can be unit-tested with an in-memory fake.
 */
export type SchedulingDb = {
  post: {
    findMany(args: {
      where: Record<string, unknown>;
      include: { targets: true };
      orderBy?: { createdAt: "asc" };
    }): Promise<StoredPost[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  postTarget: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
};

export type TickStats = {
  recovered: number;
  finalized: number;
  expired: number;
  checked: number;
  published: number;
  failed: number;
  skipped: number;
};

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
  } = {}
): Promise<Pick<TickStats, "recovered" | "finalized" | "expired">> {
  const stats = { recovered: 0, finalized: 0, expired: 0 };
  const cutoff = new Date(now.getTime() - STALE_PUBLISHING_MS);

  const stale = await db.post.findMany({
    where: { status: "PUBLISHING", updatedAt: { lt: cutoff } },
    include: { targets: true },
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
      if (claimed.count > 0) stats.expired++;
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
    if (claimed.count > 0) stats.recovered++;
  }

  return stats;
}

/**
 * A full scheduler tick: recovery pass first, then atomically claim and
 * publish due posts. The claim (`SCHEDULED -> PUBLISHING` conditional
 * update) makes concurrent/overlapping invocations safe: only one of
 * them can ever win it for a given post.
 */
export async function runScheduledPublishTick(deps: {
  db: SchedulingDb;
  publish: (
    post: { id: string; text: string },
    account?: SocialAccountRow,
    target?: { id: string; platform: string }
  ) => Promise<PublishOutcome>;
  resumeJob?: (target: StoredPostTarget) => Promise<StaleJobResumeResult>;
  now?: Date;
  clock?: () => number;
  tickBudgetMs?: number;
}): Promise<TickStats> {
  const db = deps.db;
  const now = deps.now ?? new Date();
  const clock = deps.clock ?? Date.now;
  const budgetMs = deps.tickBudgetMs ?? CRON_TICK_BUDGET_MS;
  const startedAt = clock();

  const stats: TickStats = {
    recovered: 0,
    finalized: 0,
    expired: 0,
    checked: 0,
    published: 0,
    failed: 0,
    skipped: 0,
  };

  const recovery = await recoverStalePublishing(db, now, {
    resumeJob: deps.resumeJob,
  });
  stats.recovered = recovery.recovered;
  stats.finalized = recovery.finalized;
  stats.expired = recovery.expired;

  const duePosts = await db.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: { targets: true },
    orderBy: { createdAt: "asc" },
  });

  for (const post of duePosts) {
    if (clock() - startedAt > budgetMs) {
      // Out of time for this tick; unclaimed posts stay SCHEDULED and are
      // picked up by the next cron invocation.
      break;
    }

    stats.checked++;

    const claim = await db.post.updateMany({
      where: { id: post.id, status: "SCHEDULED" },
      data: { status: "PUBLISHING" },
    });
    if (claim.count === 0) {
      stats.skipped++;
      continue;
    }

    const publishableIds = selectPublishableTargetIds(post.targets);
    const target = post.targets.find((candidate) =>
      publishableIds.includes(candidate.id)
    );

    try {
      const outcome = await deps.publish(
        { id: post.id, text: post.text },
        undefined,
        target ? { id: target.id, platform: target.platform } : undefined
      );
      if (outcome.ok) {
        stats.published++;
      } else {
        stats.failed++;
      }
    } catch (error) {
      // The publish function threw outside the per-target flow: never blindly
      // mark the post FAILED — sibling targets may already be PUBLISHED.
      // Re-read and derive the truthful aggregate status instead.
      const message =
        error instanceof Error ? error.message : "Publication failed";
      const fresh =
        (await db.post.findMany({ where: { id: post.id }, include: { targets: true } }))[0] ?? post;
      const publishedCount = fresh.targets.filter((t) => t.status === "PUBLISHED").length;
      const failedTargets = fresh.targets.filter((t) => t.status === "FAILED");
      if (publishedCount > 0 && failedTargets.length > 0) {
        await db.post.updateMany({
          where: { id: post.id, status: "PUBLISHING" },
          data: {
            status: "PARTIALLY_PUBLISHED",
            errorMessage:
              failedTargets
                .filter((t) => t.errorMessage)
                .map((t) => `${t.platform}: ${t.errorMessage}`)
                .join("; ") || message,
          },
        });
      } else if (publishedCount === 0) {
        await db.post.updateMany({
          where: { id: post.id, status: "PUBLISHING" },
          data: { status: "FAILED", errorMessage: message },
        });
        // Every target the failed run had claimed is stuck in PUBLISHING
        // (the claim happened inside publish, the finalize never ran).
        await db.postTarget.updateMany({
          where: { postId: post.id, status: "PUBLISHING" },
          data: { status: "FAILED", errorMessage: message },
        });
        // The target handed to the failed worker is marked FAILED
        // unconditionally: it was given to publish, so from the user's
        // perspective this attempt failed and stays manually retryable.
        if (target) {
          await db.postTarget.update({
            where: { id: target.id },
            data: { status: "FAILED", errorMessage: message },
          });
        }
      }
      // If everything is already PUBLISHED, there is nothing to repair.
      stats.failed++;
    }
  }

  return stats;
}
