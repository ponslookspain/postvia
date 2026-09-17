import type { PublishOutcome } from "@/lib/publish";
import { selectPublishableTargetIds } from "@/lib/publish";
import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/diagnostics";

const AUTH_PREFIX = "Bearer ";

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
 * Same bound for the recovery pass. Stale rows are rare (they only appear
 * after a crashed/killed function), so this ceiling is lower — but it must
 * exist for the same reason: a bad deploy can strand many posts at once.
 */
export const STALE_RECOVERY_BATCH = 100;

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
      chunk.map((post) => claimAndPublishPost(db, deps.publish, post))
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
  post: StoredPost
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
