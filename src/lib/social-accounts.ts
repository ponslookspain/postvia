import { prisma } from "@/lib/prisma";
import {
  canConnectAccount,
  type EffectiveSubscription,
} from "@/lib/entitlements";

/**
 * Race-safe SocialAccount creation shared by all OAuth callbacks.
 *
 * Multi-account model: one user may own many SocialAccount rows across
 * platforms (distinct externalId each), bounded by the GLOBAL total
 * `entitlements.maxTotalAccounts` (COUNT WHERE userId). Reconnects (same
 * userId + platform + externalId) update in place and never consume quota.
 *
 * Two races are folded here so callbacks stay small:
 *  1. Concurrent callbacks for the same externalId: the loser of the
 *     `@@unique` constraint converges onto the winner via UPDATE instead
 *     of surfacing a raw P2002/500. A loser that owns no row maps to
 *     `account_in_use` (another live user owns the pair).
 *  2. Concurrent fresh connects on the last free slot: check-then-create
 *     cannot be atomic without schema changes, so the just-created row is
 *     ranked oldest-first against the GLOBAL total limit and the loser
 *     deletes its own row and reports `account_limit_reached`. Exactly one
 *     winner keeps the slot.
 */

export type SocialAccountData = {
  externalId: string;
  username: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
};

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Pure rank check: freshly created rows keep their slot only when they
 * are within the first `limit` rows oldest-first. Missing rows (deleted
 * concurrently) never keep a slot.
 */
export function createdRowKeepsSlot(
  oldestFirstIds: readonly string[],
  createdId: string,
  limit: number | null
): boolean {
  if (limit === null) return true;
  const rank = oldestFirstIds.indexOf(createdId);
  if (rank === -1) return false;
  return rank < limit;
}

/** Storage surface for account linking; faked in tests. */
export type SocialAccountStore = {
  findOwn: (
    userId: string,
    platform: string,
    externalId: string
  ) => Promise<{ id: string } | null>;
  countTotal: (userId: string) => Promise<number>;
  create: (input: {
    userId: string;
    platform: string;
    data: SocialAccountData;
  }) => Promise<{ id: string }>;
  listIdsOldestFirst: (userId: string) => Promise<string[]>;
  updateAccount: (id: string, data: SocialAccountData) => Promise<void>;
  deleteOwnById: (id: string, userId: string) => Promise<void>;
};

export const liveSocialAccountStore: SocialAccountStore = {
  findOwn: async (userId, platform, externalId) =>
    prisma.socialAccount.findFirst({
      where: {
        userId,
        platform: platform as "X",
        externalId,
      },
      select: { id: true },
    }),
  countTotal: async (userId) =>
    prisma.socialAccount.count({
      where: { userId },
    }),
  create: async ({ userId, platform, data }) =>
    prisma.socialAccount.create({
      data: { userId, platform: platform as "X", ...data },
      select: { id: true },
    }),
  listIdsOldestFirst: async (userId) => {
    const rows = await prisma.socialAccount.findMany({
      where: { userId },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => row.id);
  },
  updateAccount: async (id, data) => {
    await prisma.socialAccount.update({ where: { id }, data });
  },
  deleteOwnById: async (id, userId) => {
    await prisma.socialAccount.deleteMany({ where: { id, userId } });
  },
};

/** Storage surface for disconnect lookup; faked in tests. */
export type DisconnectStore = {
  findOwned: (
    userId: string,
    platform: string,
    accountId: string
  ) => Promise<{
    id: string;
    platform: string;
    externalId: string;
    accessToken: string;
  } | null>;
};

export const liveDisconnectStore: DisconnectStore = {
  findOwned: async (userId, platform, accountId) =>
    prisma.socialAccount.findFirst({
      where: { userId, platform: platform as "X", id: accountId },
      select: { id: true, platform: true, externalId: true, accessToken: true },
    }),
};

export type DisconnectLookupResult =
  | {
      ok: true;
      id: string;
      platform: string;
      externalId: string;
      accessToken: string;
    }
  | { ok: false; code: "accountId_required" | "not_found" };

/**
 * Multi-account-safe disconnect lookup. The concrete accountId is always
 * required: without it the backend would delete an arbitrary first row
 * of the platform. Ownership is enforced atomically in the query.
 */
export async function findDisconnectTarget(input: {
  userId: string;
  platform: string;
  accountId: string | null;
  store?: DisconnectStore;
}): Promise<DisconnectLookupResult> {
  if (!input.accountId) {
    return { ok: false, code: "accountId_required" };
  }
  const store = input.store ?? liveDisconnectStore;
  const account = await store.findOwned(
    input.userId,
    input.platform,
    input.accountId
  );
  if (!account) {
    return { ok: false, code: "not_found" };
  }
  return { ok: true, ...account };
}

export type CreateSocialAccountResult =
  | { ok: true; reconnected: boolean; id: string }
  | {
      ok: false;
      code: "account_limit_reached";
      upgradeTo: string | null;
    }
  | { ok: false; code: "account_in_use" };

/**
 * Creates a fresh SocialAccount row with limit + uniqueness races folded.
 * Callers must have already handled the reconnect fast-path (existing row
 * found before the abuse gate) — this helper re-checks it anyway so a
 * row created concurrently still converges to UPDATE.
 */
export async function createSocialAccountRaceSafe(input: {
  userId: string;
  platform: string;
  externalId: string;
  data: SocialAccountData;
  effective: EffectiveSubscription;
  store?: SocialAccountStore;
}): Promise<CreateSocialAccountResult> {
  const store = input.store ?? liveSocialAccountStore;

  // Converge: a concurrent callback may have created our row already.
  const pre = await store.findOwn(input.userId, input.platform, input.externalId);
  if (pre) {
    await store.updateAccount(pre.id, input.data);
    return { ok: true, reconnected: true, id: pre.id };
  }

  // Fast-path limit check before the insert (global total per user).
  const count = await store.countTotal(input.userId);
  const gate = canConnectAccount(input.effective, count);
  if (!gate.ok) {
    return {
      ok: false,
      code: "account_limit_reached",
      upgradeTo: gate.upgradeTo,
    };
  }

  let id: string;
  try {
    ({ id } = await store.create({
      userId: input.userId,
      platform: input.platform,
      data: input.data,
    }));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const own = await store.findOwn(
      input.userId,
      input.platform,
      input.externalId
    );
    if (own) {
      await store.updateAccount(own.id, input.data);
      return { ok: true, reconnected: true, id: own.id };
    }
    return { ok: false, code: "account_in_use" };
  }

  // Post-create rank enforcement: oldest-first wins the remaining slots
  // of the GLOBAL total, so concurrent inserts on the last slot grant
  // exactly one winner.
  const limit = input.effective.entitlements.maxTotalAccounts;
  if (!input.effective.bypass && limit !== null) {
    const ids = await store.listIdsOldestFirst(input.userId);
    if (!createdRowKeepsSlot(ids, id, limit)) {
      await store.deleteOwnById(id, input.userId);
      const denial = canConnectAccount(input.effective, limit);
      return {
        ok: false,
        code: "account_limit_reached",
        upgradeTo: denial.ok ? null : denial.upgradeTo,
      };
    }
  }

  return { ok: true, reconnected: false, id };
}
