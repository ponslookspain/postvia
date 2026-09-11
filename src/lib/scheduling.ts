import type { PublishOutcome } from "@/lib/publish";

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

export type StoredPostTarget = {
  id: string;
  status: string;
  platform: string;
  externalPostId: string | null;
  publishedAt: Date | null;
};

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
  socialAccount?: {
    findFirst(args: {
      where: { userId: string; platform: string };
    }): Promise<SocialAccountRow | null>;
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
  now: Date
): Promise<Pick<TickStats, "recovered" | "finalized" | "expired">> {
  const stats = { recovered: 0, finalized: 0, expired: 0 };
  const cutoff = new Date(now.getTime() - STALE_PUBLISHING_MS);

  const stale = await db.post.findMany({
    where: { status: "PUBLISHING", updatedAt: { lt: cutoff } },
    include: { targets: true },
  });

  for (const post of stale) {
    const done = post.targets.find(
      (t) => t.status === "PUBLISHED" && Boolean(t.externalPostId)
    );
    if (done) {
      const allPublished = post.targets.every(
        (target) => target.status === "PUBLISHED" && Boolean(target.externalPostId)
      );
      await db.post.update({
        where: { id: post.id },
        data: {
          status: allPublished ? "PUBLISHED" : "PARTIALLY_PUBLISHED",
          publishedAt: allPublished ? done.publishedAt ?? now : null,
          errorMessage: null,
        },
      });
      stats.finalized++;
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
      await db.post.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMessage: TIMEOUT_MESSAGE },
      });
      stats.expired++;
      continue;
    }

    await db.postTarget.updateMany({
      where: { postId: post.id, status: "PUBLISHING" },
      data: { status: "PENDING", errorMessage: null },
    });
    await db.post.update({
      where: { id: post.id },
      data: { status: "SCHEDULED", errorMessage: null },
    });
    stats.recovered++;
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

  const recovery = await recoverStalePublishing(db, now);
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

    const target = post.targets.find(
      (candidate) => candidate.status === "PENDING" || candidate.status === "FAILED"
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
      const message =
        error instanceof Error ? error.message : "Publication failed";
      await db.post.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMessage: message },
      });
      if (target) {
        await db.postTarget.update({
          where: { id: target.id },
          data: { status: "FAILED", errorMessage: message },
        });
      }
      stats.failed++;
    }
  }

  return stats;
}
