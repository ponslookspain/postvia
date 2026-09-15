/**
 * Idempotent post-creation orchestration: ONE clientOperationId → ONE Post
 * → ONE quota consumption, even under concurrent duplicate delivery.
 *
 * The strict invariant rests on two pillars, both enforced here rather
 * than hoped for:
 *
 * 1. ATOMICITY — claim + insert run inside `runAtomic` (production: a
 *    single Prisma `$transaction`; the unique index serializes simultaneous
 *    same-key inserts into exactly one winner). The loser's transaction
 *    rolls its quota claim back, so the loser consumes nothing.
 * 2. TWIN REPLAY — a denial while carrying a key re-checks the key before
 *    reporting 403: a twin may have consumed the last unit concurrently,
 *    and its claim commits atomically WITH its post, so a denial implies
 *    every twin increment is already committed and its post is visible.
 *    Genuine exhaustion (no twin row) still reports denied.
 *
 * No content-based dedup exists anywhere here by design: identical text +
 * scheduledAt with DIFFERENT keys always creates independent posts.
 *
 * Pure orchestration over injected deps — the race/concurrency contract is
 * unit-tested with a fake ledger that models transaction rollback and row
 * serialization (see tests/quota-idempotency-race.test.ts).
 */

import { isIdempotencyConflict } from "@/lib/idempotency";

/** Thrown inside the atomic body to map a quota refusal without committing. */
export class QuotaDeniedError extends Error {
  observed: number;
  constructor(observed: number) {
    super(`Monthly post quota exceeded (observed ${observed})`);
    this.name = "QuotaDeniedError";
    this.observed = observed;
  }
}

export type QuotaClaimOutcome = { ok: true } | { ok: false; observed: number };

export type IdempotentCreateTx<TPost> = {
  claimQuota: () => Promise<QuotaClaimOutcome>;
  insertPost: (key: string | null) => Promise<TPost>;
};

export type IdempotentCreateDeps<TPost> = {
  findByOperationId: (key: string) => Promise<TPost | null>;
  runAtomic: <R>(fn: (tx: IdempotentCreateTx<TPost>) => Promise<R>) => Promise<R>;
};

export type IdempotentCreateResult<TPost> =
  | { outcome: "created"; post: TPost }
  | { outcome: "replay"; post: TPost }
  | { outcome: "denied"; observed: number };

/**
 * Create exactly one post for `key` (or a legacy keyless post when `key`
 * is null). At most two atomic attempts: the second covers the razor-edge
 * delete gap where the winner's row vanishes between the conflict and the
 * winner lookup (bulk failure cleanup deletes its own draft). The second
 * attempt re-claims cleanly — the first attempt rolled everything back.
 */
export async function createPostIdempotent<TPost>(
  deps: IdempotentCreateDeps<TPost>,
  key: string | null
): Promise<IdempotentCreateResult<TPost>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Sequential replay fast-path (first attempt only): no quota touched,
    // no insert attempted — covers retries after network timeouts and
    // sequential double-submits.
    if (key && attempt === 0) {
      const existing = await deps.findByOperationId(key);
      if (existing) return { outcome: "replay", post: existing };
    }
    try {
      const post = await deps.runAtomic(async (tx) => {
        const claim = await tx.claimQuota();
        if (!claim.ok) throw new QuotaDeniedError(claim.observed);
        return tx.insertPost(key);
      });
      return { outcome: "created", post };
    } catch (error) {
      if (error instanceof QuotaDeniedError) {
        if (key) {
          const twin = await deps.findByOperationId(key);
          if (twin) return { outcome: "replay", post: twin };
        }
        return { outcome: "denied", observed: error.observed };
      }
      if (key && isIdempotencyConflict(error)) {
        const winner = await deps.findByOperationId(key);
        if (winner) return { outcome: "replay", post: winner };
        // Winner vanished (concurrent self-delete): exactly one clean
        // re-attempt with the same key; the key is free again.
        continue;
      }
      throw error;
    }
  }
  // Unreachable: the second attempt either creates, replays, denies, or
  // throws a non-conflict error. Kept for exhaustiveness.
  throw new Error("Idempotent create exhausted without a verdict");
}
