import type { PublishOutcome } from "@/lib/publish";
import { selectPublishableTargetIds } from "@/lib/publish";
import { reportError } from "@/lib/diagnostics";
import { emitLateSchedule } from "@/lib/publish-observability";
import { recoverStalePublishing } from "./scheduling/recover-stale";

/**
 * Recovery phase + its tunables live in `./scheduling/recover-stale`
 * (that module owns them; this facade re-exports them so the public API
 * of `@/lib/scheduling` is unchanged). The back-edge is `import type`
 * only, so there is no runtime circular dependency.
 */
export {
  recoverStalePublishing,
  SCHEDULE_VALIDITY_MS,
  STALE_PUBLISHING_MS,
  STALE_RECOVERY_BATCH,
} from "./scheduling/recover-stale";

/**
 * Cron authorization boundary lives in `./cron-auth` (Bearer gate +
 * generic 500 envelope). Re-exported here so the public API of
 * `@/lib/scheduling` is unchanged.
 */
export { withCron, isCronAuthorized } from "./cron-auth";

/**
 * The platform's hard wall-clock ceiling for one function invocation.
 *
 * VERIFIED 2026-09-17: this project runs on the Vercel **Hobby** plan, where
 * that ceiling is 60s. `export const maxDuration` cannot raise it — a larger
 * value is clamped to the plan maximum, so the routes declare 60 to keep the
 * source honest about what actually happens at runtime.
 *
 * Everything below derives from this one number. Upgrading the plan is a
 * single env change (`FUNCTION_MAX_DURATION_MS=300`) plus the `maxDuration`
 * declarations, rather than a hunt for hardcoded timeouts.
 */
export const HOBBY_FUNCTION_MAX_DURATION_MS = 60_000;

export function functionMaxDurationMs(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = Number(env.FUNCTION_MAX_DURATION_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return HOBBY_FUNCTION_MAX_DURATION_MS;
}

/**
 * Stop claiming new posts after this much of a tick, so the invocation
 * finishes its in-flight work and returns instead of being killed mid-publish.
 *
 * This was 240_000 — FOUR TIMES the Hobby ceiling, so it could never fire:
 * the function was killed at 60s rather than stopping gracefully, and every
 * post it had already claimed (SCHEDULED -> PUBLISHING) was stranded until a
 * later tick recovered it. Deriving from the real ceiling makes the budget do
 * the job it was written for.
 *
 * The 0.7 factor leaves room for the in-flight publishes to settle and for
 * the retention sweeps the cron route runs after the tick.
 */
export const CRON_TICK_BUDGET_RATIO = 0.7;

export function cronTickBudgetMs(
  env: Record<string, string | undefined> = process.env
): number {
  return Math.floor(functionMaxDurationMs(env) * CRON_TICK_BUDGET_RATIO);
}

/** @deprecated Prefer `cronTickBudgetMs()` — kept for callers reading a constant. */
export const CRON_TICK_BUDGET_MS = Math.floor(
  HOBBY_FUNCTION_MAX_DURATION_MS * CRON_TICK_BUDGET_RATIO
);

/**
 * Hard ceiling on posts claimed per tick.
 *
 * Without it the due-post query loads EVERY due post in the system (with all
 * its targets) into one function's memory, so a global backlog turns a single
 * invocation into an unbounded read. The bound is a batch, not a drop:
 * whatever does not fit stays SCHEDULED and is picked up by the next
 * invocation, in due order.
 *
 * 200 is deliberately far above what one tick can actually publish
 * (CRON_TICK_BUDGET_MS is the real throughput gate — a single video target can
 * hold the tick for minutes), so the batch never becomes the binding limit
 * for normal traffic; it exists to cap the *read*, not the work.
 */
export const SCHEDULE_TICK_BATCH = 200;

/**
 * A scheduled post that starts later than this after its `scheduledAt`
 * emits a `late_schedule` observability event (per target, once per claim).
 * 1h keeps the daily-cron reality (`0 3 * * *`) useful: intraday posts are
 * routinely hours late by design, and flagging every minute of queue delay
 * would be noise. Observability-only — never gates publishing.
 */
export const LATE_THRESHOLD_MS = 60 * 60_000;

/**
 * How many posts one tick publishes at a time.
 *
 * The tick used to publish strictly serially, so one slow target held the
 * whole invocation: a single Threads video polling its container blocked
 * every other user's post behind it until the budget ran out. With a 60s
 * ceiling and one cron per day that made the scheduler's effective
 * throughput roughly "one slow post per day".
 *
 * Bounded, not unbounded: each post still takes its own conditional claim, so
 * concurrency changes only HOW MANY claims are in flight, never whether a
 * post can be claimed twice. The ceiling exists because each post fans out
 * again across its own targets inside `publishPostTargets`
 * (`publishTargetsInParallel`), so the real provider-call concurrency is
 * this number multiplied by the per-post target count.
 *
 * 4 is deliberately conservative — the constraint is function memory (a video
 * publish streams bytes) rather than the pooled database connection.
 */
export const SCHEDULE_TICK_CONCURRENCY = 4;

export function scheduleTickConcurrency(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = Number(env.SCHEDULE_TICK_CONCURRENCY);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return SCHEDULE_TICK_CONCURRENCY;
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
      orderBy?:
        | { createdAt: "asc" }
        | { scheduledAt: "asc" }
        | { updatedAt: "asc" };
      take?: number;
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
  /** Test seam: overrides SCHEDULE_TICK_BATCH / STALE_RECOVERY_BATCH. */
  batchSize?: number;
  /** Posts published simultaneously; defaults to `scheduleTickConcurrency()`. */
  concurrency?: number;
}): Promise<TickStats> {
  const db = deps.db;
  const now = deps.now ?? new Date();
  const clock = deps.clock ?? Date.now;
  const budgetMs = deps.tickBudgetMs ?? cronTickBudgetMs();
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
    ...(deps.batchSize !== undefined ? { batchSize: deps.batchSize } : {}),
  });
  stats.recovered = recovery.recovered;
  stats.finalized = recovery.finalized;
  stats.expired = recovery.expired;

  // Bounded batch, oldest-DUE-first.
  //
  // `orderBy: scheduledAt` (not createdAt) is what makes the bound safe: with
  // a cap, ordering decides who waits, and the only fair rule is "whatever was
  // due first goes first". Ordering by creation time would let a backlog
  // starve a post that was scheduled long ago but created recently.
  //
  // Single sort key on purpose: it matches `@@index([status, scheduledAt])`
  // exactly, so Postgres walks the index and stops at `take` instead of
  // sorting the whole due-set. Ties (same instant) resolve arbitrarily —
  // that is fine, because the claim below is conditional and anything not
  // claimed this tick is simply claimed by the next one.
  const duePosts = await db.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: { targets: true },
    orderBy: { scheduledAt: "asc" },
    take: deps.batchSize ?? SCHEDULE_TICK_BATCH,
  });

  // Bounded-concurrency publishing.
  //
  // The budget is checked per CHUNK, not per post: a chunk that starts inside
  // the budget runs to completion, so the overrun is bounded by one chunk's
  // slowest post rather than by the whole batch. Posts never claimed stay
  // SCHEDULED and the next invocation takes them, still in due order.
  //
  // Nothing about exactly-once changes here. Each post's conditional claim
  // (`SCHEDULED -> PUBLISHING`) is unchanged and independent, so racing
  // workers — inside one chunk, across chunks, or across two overlapping
  // invocations — still produce exactly one winner per post.
  const concurrency = deps.concurrency ?? scheduleTickConcurrency();

  for (let offset = 0; offset < duePosts.length; offset += concurrency) {
    if (clock() - startedAt > budgetMs) {
      // Out of time for this tick; unclaimed posts stay SCHEDULED and are
      // picked up by the next cron invocation.
      break;
    }

    const chunk = duePosts.slice(offset, offset + concurrency);
    stats.checked += chunk.length;

    // allSettled, not all: one post's infrastructure failure must not abort
    // the siblings that are already in flight. This mirrors how
    // `publishTargetsInParallel` already isolates targets within a post.
    const settled = await Promise.allSettled(
      chunk.map((post) => claimAndPublishPost(db, deps.publish, post, now))
    );

    for (const [index, result] of settled.entries()) {
      if (result.status === "fulfilled") {
        stats[result.value]++;
        continue;
      }
      // Only reachable if the claim query itself threw — the publish path is
      // already total. Count it and keep going rather than failing the tick.
      reportError("cron", "tick post worker rejected", result.reason, {
        postId: chunk[index]?.id,
      });
      stats.failed++;
    }
  }

  return stats;
}

/**
 * One post's slice of a tick: claim it, publish it, and repair its status if
 * publishing throws. Total by construction — it resolves to a stat bucket
 * instead of throwing — so a sibling post in the same chunk is never affected.
 *
 * Extracted verbatim from the previous serial loop body; the claim, the
 * target selection and the aggregate-repair logic are unchanged.
 */
async function claimAndPublishPost(
  db: SchedulingDb,
  publish: (
    post: { id: string; text: string },
    account?: SocialAccountRow,
    target?: { id: string; platform: string }
  ) => Promise<PublishOutcome>,
  post: StoredPost,
  now: Date
): Promise<"published" | "failed" | "skipped"> {
  const claim = await db.post.updateMany({
    where: { id: post.id, status: "SCHEDULED" },
    data: { status: "PUBLISHING" },
  });
  if (claim.count === 0) return "skipped";

  const publishableIds = selectPublishableTargetIds(post.targets);
  const target = post.targets.find((candidate) =>
    publishableIds.includes(candidate.id)
  );

  // Late-schedule detection (observability-only): per first publishable
  // target, once per claim. No target yet → no event (never magic ids).
  if (target && post.scheduledAt) {
    const latenessMs = now.getTime() - post.scheduledAt.getTime();
    if (latenessMs > LATE_THRESHOLD_MS) {
      emitLateSchedule({
        provider: target.platform,
        postId: post.id,
        targetId: target.id,
        // Best-effort: re-published overdue targets are repeats.
        attempt: target.status === "FAILED" ? 2 : 1,
        duration: latenessMs,
      });
    }
  }

  try {
    const outcome = await publish(
      { id: post.id, text: post.text },
      undefined,
      target ? { id: target.id, platform: target.platform } : undefined
    );
    return outcome.ok ? "published" : "failed";
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
    return "failed";
  }
}
