import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  claimIdentityFree,
  emailSignal,
  initFreeUsageWithClient,
  isAbuseDisabled,
  isFailClosedAbuseError,
  isRaceConflictError,
  isTransientAbuseError,
  linkUserWithClient,
  liveAbuseStores,
  mergeIdentitiesPreservingRisk,
  mergeIdentitiesWithClient,
  rateTakeWithClient,
  recordAbuseEvent,
  resolveAbuseIdentity,
  sumPostUsageWithClient,
  type AbuseStores,
} from "@/lib/abuse";
import {
  createWithMonthlyQuota,
  liveQuotaStore,
  type QuotaClaimStore,
} from "@/lib/entitlements";
import { reportError } from "@/lib/diagnostics";
import { isIdempotencyConflict } from "@/lib/idempotency";

/**
 * Atomic Free post-creation kernel.
 *
 * The old chain (enforceFreeIdentityGate → createWithMonthlyQuota →
 * post.create as three separate steps) could consume identity quota and
 * then fail on the per-user claim or the insert — phantom consumption with
 * no post. This kernel runs resolve → identity claim → per-user claim →
 * insert inside ONE Prisma transaction: any failure rolls every ledger
 * mutation back, so a failed request never consumes quota and a retry
 * never double-consumes. Concurrent last-slot attempts serialize on the
 * conditional increments (`count < limit`) — exactly one winner.
 *
 * Paid plans and the admin bypass never enter this kernel: each paid
 * subscription keeps its own per-user limits (see route).
 */

/** Thrown inside the transaction to signal a quota/risk denial (rolls back). */
export class FreePostDeny extends Error {
  code: "RESTRICTED" | "LIMIT";
  observed?: number;

  constructor(code: "RESTRICTED" | "LIMIT", observed?: number) {
    super(`Free post denied: ${code}`);
    this.code = code;
    this.observed = observed;
  }
}

export type FreePostKernelOk<T> = {
  ok: true;
  value: T;
  identityId: string;
  fallback?: boolean;
};
export type FreePostKernelResult<T> =
  | FreePostKernelOk<T>
  | { ok: false; code: "RESTRICTED" | "LIMIT"; observed?: number };

/** Tx-bound AbuseStores: every query joins the caller's transaction. */
export function makeTxAbuseStores(
  tx: Prisma.TransactionClient
): AbuseStores {
  return {
    ...liveAbuseStores,
    findSignalOwners: async (signals) => {
      if (signals.length === 0) return [];
      const rows = await tx.abuseSignal.findMany({
        where: {
          OR: signals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
        },
        select: {
          identityId: true,
          identity: { select: { firstSeenAt: true } },
        },
      });
      return rows.map((row) => ({
        identityId: row.identityId,
        firstSeenAt: row.identity.firstSeenAt,
      }));
    },
    createIdentity: async () => {
      const row = await tx.abuseIdentity.create({
        data: {},
        select: { id: true, firstSeenAt: true },
      });
      return row;
    },
    linkUser: async (identityId, userId) =>
      linkUserWithClient(tx, identityId, userId),
    findIdentityIdByUser: async (userId) => {
      const row = await tx.abuseIdentityLink.findUnique({
        where: { userId },
        select: { identityId: true },
      });
      return row?.identityId ?? null;
    },
    findUserIdsByIdentity: async (identityId) => {
      const rows = await tx.abuseIdentityLink.findMany({
        where: { identityId },
        select: { userId: true },
      });
      return rows.map((row) => row.userId);
    },
    attachSignals: async (identityId, signals) => {
      if (signals.length === 0) return;
      await tx.abuseSignal.createMany({
        data: signals.map((s) => ({
          identityId,
          kind: s.kind,
          valueHash: s.valueHash,
          pepperVersion: 1,
        })),
        skipDuplicates: true,
      });
    },
    removeSignals: async (signals) => {
      if (signals.length === 0) return;
      await tx.abuseSignal.deleteMany({
        where: {
          OR: signals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
        },
      });
    },
    // Already inside the kernel transaction — never nests.
    mergeIdentities: async (winnerId, loserIds) =>
      mergeIdentitiesWithClient(tx, winnerId, loserIds),
    getIdentity: async (identityId) => {
      const row = await tx.abuseIdentity.findUnique({
        where: { id: identityId },
        select: {
          id: true,
          riskLevel: true,
          riskReason: true,
          lastLinkedAt: true,
          firstSeenAt: true,
        },
      });
      return row;
    },
    setRisk: async (identityId, level, reason) => {
      await tx.abuseIdentity.update({
        where: { id: identityId },
        data: { riskLevel: level, riskReason: reason },
      });
    },
    escalateRisk: async (identityId, level, reason) => {
      await tx.abuseIdentity.updateMany({
        where: {
          id: identityId,
          ...(level === "ABUSE"
            ? { riskLevel: { not: "ABUSE" } }
            : level === "HIGH"
              ? { riskLevel: { in: ["LOW", "MEDIUM"] } }
              : { riskLevel: "LOW" }),
        },
        data: { riskLevel: level, riskReason: reason },
      });
    },
    touchLinked: async (identityId, now) => {
      await tx.abuseIdentity.updateMany({
        where: { id: identityId },
        data: { lastSeenAt: now, lastLinkedAt: now },
      });
    },
    touchSeen: async (identityId, now) => {
      await tx.abuseIdentity.updateMany({
        where: { id: identityId },
        data: { lastSeenAt: now },
      });
    },
    findTombstones: async (signals) => {
      if (signals.length === 0) return [];
      const rows = await tx.abuseTombstone.findMany({
        where: {
          OR: signals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
        },
        select: {
          kind: true,
          valueHash: true,
          identityId: true,
          deletedAt: true,
        },
      });
      return rows;
    },
    writeTombstones: async (rows) => {
      if (rows.length === 0) return;
      await tx.abuseTombstone.createMany({
        data: rows.map((row) => ({
          kind: row.kind,
          valueHash: row.valueHash,
          identityId: row.identityId ?? null,
        })),
        skipDuplicates: true,
      });
    },
    sweepTombstones: async (olderThan) => {
      const deleted = await tx.abuseTombstone.deleteMany({
        where: { deletedAt: { lt: olderThan } },
      });
      return deleted.count;
    },
    getFreeUsage: async (identityId, period) => {
      const row = await tx.abuseFreeUsage.findUnique({
        where: { identityId_period: { identityId, period } },
        select: { count: true },
      });
      return row?.count ?? null;
    },
    initFreeUsage: async (identityId, period, count) =>
      initFreeUsageWithClient(tx, identityId, period, count),
    incrementFreeIfBelow: async (identityId, period, limit) => {
      const updated = await tx.abuseFreeUsage.updateMany({
        where: { identityId, period, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
      return updated.count > 0;
    },
    raiseFreeFloor: async (identityId, period, floor) => {
      await tx.abuseFreeUsage.updateMany({
        where: { identityId, period, count: { lt: floor } },
        data: { count: floor },
      });
    },
    sumPostUsage: async (userIds, period, monthStart) =>
      sumPostUsageWithClient(tx, userIds, period, monthStart),
    rateTake: async (scope, keyHash, max, windowMs, nowMs) =>
      rateTakeWithClient(tx, scope, keyHash, max, windowMs, nowMs),
  };
}

/** Tx-bound per-user quota ledger: joins the kernel transaction. */
export function makeTxQuotaStore(tx: Prisma.TransactionClient): QuotaClaimStore {
  return {
    findUsage: async (userId, period) => {
      const row = await tx.postUsage.findUnique({
        where: { userId_period: { userId, period } },
        select: { id: true, count: true },
      });
      return row;
    },
    createUsage: async (userId, period, count) => {
      await tx.postUsage.createMany({
        data: [{ userId, period, count }],
        skipDuplicates: true,
      });
      const row = await tx.postUsage.findUnique({
        where: { userId_period: { userId, period } },
        select: { id: true, count: true },
      });
      if (!row) throw new Error("PostUsage row vanished after conflict");
      return row;
    },
    incrementIfBelowLimit: async (id, limit) => {
      const updated = await tx.postUsage.updateMany({
        where: { id, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
      return updated.count > 0;
    },
  };
}

/**
 * Shared orchestration body. MUST run inside a transaction (Prisma
 * $transaction in production, snapshot transaction in tests): every
 * mutation below is rolled back when insert (or any claim) throws, so a
 * failed request consumes nothing and a retry consumes exactly once.
 * Denials throw FreePostDeny — the caller maps them without committing
 * partial quota (the transaction rolls back by propagation).
 */
export async function runFreePostBody<T>(input: {
  userId: string;
  email: string | null;
  limit: number;
  period: string;
  monthStart: Date;
  pepper: string;
  enforce: boolean;
  stores: AbuseStores;
  quota: QuotaClaimStore;
  liveCount: () => Promise<number>;
  insert: () => Promise<T>;
  nowMs?: number;
}): Promise<{ value: T; identityId: string }> {
  const resolution = await resolveAbuseIdentity({
    userId: input.userId,
    signals:
      input.email != null ? [emailSignal(input.email, input.pepper)] : [],
    stores: input.stores,
    nowMs: input.nowMs,
  });
  if (input.enforce && resolution.risk === "ABUSE") {
    void recordAbuseEvent({
      identityId: resolution.identityId,
      kind: "POST_DENY",
    });
    throw new FreePostDeny("RESTRICTED");
  }
  const linked = await input.stores.findUserIdsByIdentity(
    resolution.identityId
  );
  // Identity claim first (authoritative against multi-account abuse),
  // then the per-user mirror — both roll back together on any throw.
  const claim = await claimIdentityFree({
    identityId: resolution.identityId,
    userIds: linked,
    period: input.period,
    monthStart: input.monthStart,
    limit: input.limit,
    stores: input.stores,
  });
  if (!claim.ok) {
    if (!input.enforce) {
      // Observe mode: allow without consuming the per-user ledger either.
      const value = await input.insert();
      return { value, identityId: resolution.identityId };
    }
    void recordAbuseEvent({
      identityId: resolution.identityId,
      kind: "POST_DENY",
    });
    throw new FreePostDeny("LIMIT", claim.observed);
  }
  const period = input.period;
  let row = await input.quota.findUsage(input.userId, period);
  if (!row) {
    row = await input.quota.createUsage(
      input.userId,
      period,
      await input.liveCount()
    );
  }
  const granted = await input.quota.incrementIfBelowLimit(row.id, input.limit);
  if (!granted) {
    const current = await input.quota.findUsage(input.userId, period);
    void recordAbuseEvent({
      identityId: resolution.identityId,
      kind: "POST_DENY",
    });
    // Thrown (not returned) so the identity +1 above rolls back too.
    throw new FreePostDeny("LIMIT", current?.count ?? input.limit);
  }
  // Insert throw propagates: both ledger claims roll back. No phantom.
  const value = await input.insert();
  return { value, identityId: resolution.identityId };
}

/**
 * Production entry point. Free plans only — paid/bypass callers never reach
 * here (their route branch skips the identity ledger entirely).
 *
 * - Denials (RESTRICTED/LIMIT) return normally (no partial consumption:
 *   the transaction rolled back).
 * - Misconfiguration (missing pepper/tables) throws loud — fail closed.
 * - Business/insert failures throw (the transaction already rolled back —
 *   nothing was consumed, so a retry is safe).
 * - A transaction aborted by a concurrent merge/link race (P2002/P2003/
 *   P2025) is retried exactly once: the body is idempotent (conditional
 *   claims, unique-guarded resolve) and an aborted tx committed nothing.
 * - Transient store failure degrades to the legacy PostUsage-only path
 *   (still per-user gated) so an abuse-store blip never blocks legitimate
 *   users; that path itself claims + inserts without the identity ledger.
 *   The fallback runs ONLY for transient errors: running it on insert
 *   failures would consume PostUsage outside any transaction (phantom).
 */
export async function createFreePostAtomic<T>(input: {
  userId: string;
  email: string | null;
  limit: number;
  period: string;
  monthStart: Date;
  pepper: string;
  enforce: boolean;
  buildInsert: (tx: Prisma.TransactionClient) => Promise<T>;
  liveCountForBackfill: () => Promise<number>;
  legacyInsert: () => Promise<T>;
  nowMs?: number;
  disabled?: boolean;
}): Promise<FreePostKernelResult<T>> {
  if (input.disabled ?? isAbuseDisabled()) {
    return {
      ok: true,
      value: await input.legacyInsert(),
      identityId: `disabled:${input.userId}`,
    };
  }
  if (!input.pepper || !input.pepper.trim()) {
    const error = new Error("ABUSE_HASH_PEPPER is required in production");
    reportError("abuse", "post kernel misconfigured", error, {
      userId: input.userId,
    });
    throw error;
  }
  const runOnce = () =>
    prisma.$transaction(async (tx) => {
      const stores = makeTxAbuseStores(tx);
      const quota = makeTxQuotaStore(tx);
      try {
        const { value, identityId } = await runFreePostBody({
          userId: input.userId,
          email: input.email,
          limit: input.limit,
          period: input.period,
          monthStart: input.monthStart,
          pepper: input.pepper,
          enforce: input.enforce,
          stores,
          quota,
          liveCount: () =>
            tx.post.count({
              where: {
                userId: input.userId,
                createdAt: { gte: input.monthStart },
              },
            }),
          insert: () => input.buildInsert(tx),
          nowMs: input.nowMs,
        });
        return { ok: true as const, value, identityId };
      } catch (error) {
        if (error instanceof FreePostDeny) {
          // Deny, not failure: rethrow so the (empty) quota mutations roll
          // back, then map outside the transaction.
          throw error;
        }
        throw error;
      }
    });
  try {
    return await runOnce();
  } catch (txError) {
    let error: unknown = txError;
    // A unique violation on the idempotency key is NOT a merge/link race:
    // it proves a twin request with the same clientOperationId already
    // committed its post (unique checks only fail against committed rows —
    // an uncommitted twin would block, then proceed-or-fail on its own
    // fate). Retrying would re-run the whole resolve+claim body just to
    // fail the insert again, so skip straight to the route-level winner
    // lookup. Every other race conflict keeps the single optimistic retry.
    if (isRaceConflictError(txError) && !isIdempotencyConflict(txError)) {
      // Optimistic-concurrency retry: a concurrent merge/link aborted our
      // transaction (never a partial commit). The body is idempotent, so
      // exactly one retry is safe and converts a razor-edge 500 into a
      // transparent success.
      try {
        return await runOnce();
      } catch (retryError) {
        error = retryError;
      }
    }
    if (error instanceof FreePostDeny) {
      return { ok: false, code: error.code, observed: error.observed };
    }
    if (isFailClosedAbuseError(error)) throw error;
    // Fallback ONLY on transient connectivity errors. Anything else
    // (validation, FK, insert failures) propagates: the transaction already
    // rolled back with nothing consumed, and a fallback claim here would
    // burn PostUsage outside any transaction.
    if (!isTransientAbuseError(error)) throw error;
    // Transient: PostUsage-only fallback (per-user gate still enforced).
    // Deliberately no identity-ledger touch here: the failed transaction
    // already rolled back, and an extra observe-claim would consume phantom
    // quota outside any transaction.
    reportError("abuse", "post kernel failed, PostUsage-only fallback", error, {
      userId: input.userId,
    });
    const legacy = await createWithMonthlyQuota({
      userId: input.userId,
      limit: input.limit,
      bypass: false,
      liveCount: input.liveCountForBackfill,
      quota: liveQuotaStore,
      insert: input.legacyInsert,
    });
    if (!legacy.ok) {
      return { ok: false, code: "LIMIT", observed: legacy.observed };
    }
    return {
      ok: true,
      value: legacy.value,
      identityId: `fallback:${input.userId}`,
      fallback: true,
    };
  }
}

// Re-exported for callers that merge outside the kernel (keeps one import).
export { mergeIdentitiesPreservingRisk };
