import { prisma } from "@/lib/prisma";
import {
  getPlan,
  PLANS,
  type PlanEntitlements,
  type PlanId,
} from "@/lib/plans";

/**
 * Central entitlement layer. Single source of truth for plan/business
 * logic: pages, API routes and components must use these helpers and
 * never reimplement prices, limits or status rules.
 *
 * No React, no Next.js — pure logic + Prisma reads. UI stays thin.
 */

export type DbPlan = "FREE" | "GROWTH" | "SCALE";
export type DbSubStatus = "ACTIVE" | "CANCELED" | "PAST_DUE";

export type SubscriptionRow = {
  plan: DbPlan;
  status: DbSubStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
} | null;

export type TestMode = "BYPASS" | "ENFORCEMENT";

export type TestOverrideRow = {
  mode: TestMode;
  plan: DbPlan;
  subStatus: DbSubStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
} | null;

/** UI-facing subscription state (superset of the DB status). */
export type EffectiveStatus =
  | "ACTIVE"
  | "CANCELLING"
  | "CANCELED"
  | "PAST_DUE"
  | "EXPIRED";

export type EffectiveSubscription = {
  plan: PlanId;
  status: EffectiveStatus;
  /** True only when the admin bypass is engaged. */
  bypass: boolean;
  /** "subscription" | "default" | "admin-override". */
  source: "subscription" | "default" | "admin-override";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  entitlements: PlanEntitlements;
};

export type Denial = {
  ok: false;
  code: "UPGRADE_REQUIRED";
  reason: string;
  upgradeTo: Exclude<PlanId, "scale"> | null;
};
export type Allowance = { ok: true };
export type Check = Allowance | Denial;

export type Usage = {
  postsThisMonth: number;
  monthStart: Date;
  accountsByPlatform: Record<string, number>;
  totalAccounts: number;
  scheduledPosts: number;
};

const DB_TO_PLAN: Record<DbPlan, PlanId> = {
  FREE: "free",
  GROWTH: "growth",
  SCALE: "scale",
};

const PLAN_TO_DB: Record<PlanId, DbPlan> = {
  free: "FREE",
  growth: "GROWTH",
  scale: "SCALE",
};

export function toPlanId(plan: DbPlan): PlanId {
  return DB_TO_PLAN[plan];
}

export function toDbPlan(plan: PlanId): DbPlan {
  return PLAN_TO_DB[plan];
}

/**
 * Legacy safety net: any unknown or retired plan code (e.g. STARTER rows
 * created before the Free migration) resolves to Free, never to paid.
 */
export function toPlanIdSafe(plan: string): PlanId {
  if (plan === "GROWTH") return "growth";
  if (plan === "SCALE") return "scale";
  return "free";
}

/** Next paid tier, or null when already on top. */
export function getUpgradeTarget(plan: PlanId): Exclude<PlanId, "scale"> | "scale" | null {
  if (plan === "free") return "growth";
  if (plan === "growth") return "scale";
  return null;
}

function upgradeDenial(
  plan: PlanId,
  reason: string
): Denial {
  const upgradeTo = getUpgradeTarget(plan);
  return {
    ok: false,
    code: "UPGRADE_REQUIRED",
    reason,
    upgradeTo: upgradeTo === "scale" ? null : upgradeTo,
  };
}

/** Server-side admin gate. ADMIN_EMAILS is operator config, never code. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** Raw subscription row. Never auto-creates: reading is side-effect free. */
export async function getSubscription(
  userId: string
): Promise<SubscriptionRow> {
  const row = await prisma.subscription.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubId: row.stripeSubId,
  };
}

/** Raw admin test override. Only meaningful when the caller is an admin. */
export async function getTestOverride(
  userId: string
): Promise<TestOverrideRow> {
  const row = await prisma.billingTestOverride.findUnique({
    where: { userId },
  });
  if (!row) return null;
  return {
    mode: row.mode,
    plan: row.plan,
    subStatus: row.subStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}

type ResolvedBase = {
  plan: DbPlan;
  status: DbSubStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
};

/** Applies expiry/cancellation rules to a stored (real or test) state. */
export function applyPeriodRules(
  base: ResolvedBase | null,
  nowMs: number
): { plan: PlanId; status: EffectiveStatus; expired: boolean } {
  if (!base) return { plan: "free", status: "ACTIVE", expired: false };
  const plan = toPlanIdSafe(base.plan);
  if (base.status === "CANCELED") {
    return { plan: "free", status: "CANCELED", expired: true };
  }
  if (
    base.cancelAtPeriodEnd &&
    base.currentPeriodEnd &&
    base.currentPeriodEnd.getTime() <= nowMs
  ) {
    return { plan: "free", status: "EXPIRED", expired: true };
  }
  if (base.status === "PAST_DUE") {
    return { plan, status: "PAST_DUE", expired: false };
  }
  if (base.cancelAtPeriodEnd && base.currentPeriodEnd) {
    return { plan, status: "CANCELLING", expired: false };
  }
  return { plan, status: "ACTIVE", expired: false };
}

/**
 * Central effective-plan computation:
 *   real subscription + admin test override -> effective subscription.
 * The override is consulted ONLY when isAdmin is true, and test state
 * lives in its own table, never inside the real subscription row.
 */
export function resolveEffectiveFromRows(input: {
  subscription: SubscriptionRow;
  testOverride: TestOverrideRow;
  isAdmin: boolean;
  nowMs?: number;
}): EffectiveSubscription {
  const nowMs = input.nowMs ?? Date.now();

  if (input.isAdmin && input.testOverride) {
    const override = input.testOverride;
    if (override.mode === "BYPASS") {
      return {
        plan: "scale",
        status: "ACTIVE",
        bypass: true,
        source: "admin-override",
        currentPeriodEnd: override.currentPeriodEnd,
        cancelAtPeriodEnd: override.cancelAtPeriodEnd,
        entitlements: unlimitedEntitlements(),
      };
    }
    const resolved = applyPeriodRules(
      {
        plan: override.plan,
        status: override.subStatus,
        cancelAtPeriodEnd: override.cancelAtPeriodEnd,
        currentPeriodEnd: override.currentPeriodEnd,
      },
      nowMs
    );
    return {
      plan: resolved.plan,
      status: resolved.status,
      bypass: false,
      source: "admin-override",
      currentPeriodEnd: override.currentPeriodEnd,
      cancelAtPeriodEnd: override.cancelAtPeriodEnd,
      entitlements: getPlan(resolved.plan).entitlements,
    };
  }

  if (!input.subscription) {
    return {
      plan: "free",
      status: "ACTIVE",
      bypass: false,
      source: "default",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      entitlements: getPlan("free").entitlements,
    };
  }
  const resolved = applyPeriodRules(
    {
      plan: input.subscription.plan,
      status: input.subscription.status,
      cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
      currentPeriodEnd: input.subscription.currentPeriodEnd,
    },
    nowMs
  );
  return {
    plan: resolved.plan,
    status: resolved.status,
    bypass: false,
    source: "subscription",
    currentPeriodEnd: input.subscription.currentPeriodEnd,
    cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
    entitlements: getPlan(resolved.plan).entitlements,
  };
}

/** Bypass grants everything without touching any plan row. */
function unlimitedEntitlements(): PlanEntitlements {
  return {
    maxAccountsPerPlatform: null,
    monthlyPosts: null,
    maxBulkVideos: Number.MAX_SAFE_INTEGER,
    calendar: true,
    bulk: true,
    retryReschedule: true,
  };
}

export async function getEffectivePlan(input: {
  userId: string;
  userEmail?: string | null;
  nowMs?: number;
}): Promise<EffectiveSubscription> {
  const isAdmin = isAdminEmail(input.userEmail);
  const [subscription, testOverride] = await Promise.all([
    getSubscription(input.userId),
    isAdmin ? getTestOverride(input.userId) : Promise.resolve(null),
  ]);
  return resolveEffectiveFromRows({
    subscription,
    testOverride,
    isAdmin,
    nowMs: input.nowMs,
  });
}

/**
 * Centralized usage rules.
 * - Month = UTC calendar month containing `now` (period key "YYYY-MM").
 * - Every successful Post creation consumes one unit of the monthly quota,
 *   recorded in PostUsage. The counter only grows: deleting a post never
 *   refills it, so create/delete loops cannot mint quota.
 * - An account counts once per SocialAccount row on that platform.
 */
export function getPeriodKey(nowMs: number = Date.now()): string {
  const now = new Date(nowMs);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}`;
}

export function getMonthStart(nowMs: number = Date.now()): Date {
  const now = new Date(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Resolves the creation count for the month: the persistent counter wins
 * whenever a row exists (deletions after that point cannot refill quota);
 * otherwise the live row count is the baseline.
 */
export function selectPostCount(
  counter: number | null,
  liveCount: number
): number {
  return counter ?? liveCount;
}

export async function getUsage(
  userId: string,
  nowMs: number = Date.now()
): Promise<Usage> {
  const monthStart = getMonthStart(nowMs);
  const period = getPeriodKey(nowMs);
  const [postCount, usageRow, accountGroups, scheduledCount] =
    await Promise.all([
      prisma.post.count({
        where: { userId, createdAt: { gte: monthStart } },
      }),
      prisma.postUsage
        .findUnique({
          where: { userId_period: { userId, period } },
          select: { count: true },
        })
        // Pre-migration databases have no PostUsage table yet: reads stay
        // available on the live count while writes fail closed.
        .catch(() => null),
      prisma.socialAccount.groupBy({
        by: ["platform"],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.post.count({ where: { userId, status: "SCHEDULED" } }),
    ]);
  const accountsByPlatform: Record<string, number> = {};
  for (const group of accountGroups) {
    accountsByPlatform[group.platform] = group._count._all;
  }
  return {
    postsThisMonth: selectPostCount(usageRow?.count ?? null, postCount),
    monthStart,
    accountsByPlatform,
    totalAccounts: Object.values(accountsByPlatform).reduce((a, b) => a + b, 0),
    scheduledPosts: scheduledCount,
  };
}

export function canCreatePost(
  eff: EffectiveSubscription,
  usage: Usage
): Check {
  if (eff.bypass) return { ok: true };
  const limit = eff.entitlements.monthlyPosts;
  if (limit === null) return { ok: true };
  if (usage.postsThisMonth < limit) return { ok: true };
  return upgradeDenial(
    eff.plan,
    `Monthly post limit reached (${usage.postsThisMonth}/${limit}).`
  );
}

/** Quota-ledger access, injected so tests run without a database. */
export type QuotaClaimStore = {
  findUsage: (
    userId: string,
    period: string
  ) => Promise<{ id: string; count: number } | null>;
  /** Creates the row backfilled from the live count; tolerates races. */
  createUsage: (
    userId: string,
    period: string,
    count: number
  ) => Promise<{ id: string; count: number }>;
  /**
   * Atomically increments only while below the limit. Serialized by the
   * row lock with the predicate re-evaluated after locking, so concurrent
   * claims on the last slot grant exactly one winner.
   */
  incrementIfBelowLimit: (id: string, limit: number) => Promise<boolean>;
};

export type QuotaClaim = { ok: true } | { ok: false; observed: number };

/**
 * Claims one unit of the monthly post quota. Creates the ledger row lazily,
 * backfilled from the live creation count so usage accrued before the
 * first claim keeps counting. Never decrements: deletions cannot refill.
 */
export async function claimMonthlyQuota(input: {
  userId: string;
  period: string;
  limit: number;
  liveCount: number;
  store: QuotaClaimStore;
}): Promise<QuotaClaim> {
  let row = await input.store.findUsage(input.userId, input.period);
  if (!row) {
    row = await input.store.createUsage(
      input.userId,
      input.period,
      input.liveCount
    );
  }
  const granted = await input.store.incrementIfBelowLimit(row.id, input.limit);
  if (!granted) {
    const current = await input.store.findUsage(input.userId, input.period);
    return { ok: false, observed: current?.count ?? input.limit };
  }
  return { ok: true };
}

/**
 * Creation path with quota enforcement. Unlimited plans and the admin
 * bypass skip the ledger entirely. When the claim is denied nothing is
 * inserted. When the insert throws after a granted claim the unit stays
 * consumed — fail-closed, never an over-grant.
 */
export async function createWithMonthlyQuota<T>(input: {
  userId: string;
  limit: number | null;
  bypass: boolean;
  nowMs?: number;
  liveCount: () => Promise<number>;
  quota: QuotaClaimStore;
  insert: () => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false; observed: number }> {
  if (input.bypass || input.limit === null) {
    return { ok: true, value: await input.insert() };
  }
  const claim = await claimMonthlyQuota({
    userId: input.userId,
    period: getPeriodKey(input.nowMs ?? Date.now()),
    limit: input.limit,
    liveCount: await input.liveCount(),
    store: input.quota,
  });
  if (!claim.ok) return { ok: false, observed: claim.observed };
  return { ok: true, value: await input.insert() };
}

/** Prisma-backed quota ledger. */
export const liveQuotaStore: QuotaClaimStore = {
  findUsage: async (userId, period) => {
    const row = await prisma.postUsage.findUnique({
      where: { userId_period: { userId, period } },
      select: { id: true, count: true },
    });
    return row;
  },
  createUsage: async (userId, period, count) => {
    try {
      return await prisma.postUsage.create({
        data: { userId, period, count },
        select: { id: true, count: true },
      });
    } catch {
      // A concurrent first claim won the unique key: use its row.
      const row = await prisma.postUsage.findUnique({
        where: { userId_period: { userId, period } },
        select: { id: true, count: true },
      });
      if (!row) throw new Error("PostUsage row vanished after conflict");
      return row;
    }
  },
  incrementIfBelowLimit: async (id, limit) => {
    const updated = await prisma.postUsage.updateMany({
      where: { id, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    return updated.count > 0;
  },
};

export function canConnectAccount(
  eff: EffectiveSubscription,
  platform: string,
  currentCountForPlatform: number
): Check {
  if (eff.bypass) return { ok: true };
  const limit = eff.entitlements.maxAccountsPerPlatform;
  if (limit === null) return { ok: true };
  if (currentCountForPlatform < limit) return { ok: true };
  return upgradeDenial(
    eff.plan,
    `Account limit reached for this platform (${currentCountForPlatform}/${limit}).`
  );
}

export function canBulkSchedule(
  eff: EffectiveSubscription,
  videoCount: number
): Check {
  if (eff.bypass) return { ok: true };
  if (!eff.entitlements.bulk) {
    return upgradeDenial(eff.plan, "Bulk video scheduling is not included in this plan.");
  }
  if (videoCount > eff.entitlements.maxBulkVideos) {
    return upgradeDenial(
      eff.plan,
      `A batch holds at most ${eff.entitlements.maxBulkVideos} videos on this plan.`
    );
  }
  return { ok: true };
}

/**
 * Parses the client-attested bulk batch size on post creation. Absent means
 * an ordinary (non-bulk) create gated only by the monthly quota. Anything
 * that is not a positive integer is rejected before any entitlement check.
 */
export function parseBulkBatchSize(
  value: unknown
): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return "invalid";
  }
  return value;
}

export type BulkBatchGate =
  | { ok: true }
  | { ok: false; denial: Denial }
  | { ok: false; invalid: true };

/**
 * Server-side bulk gate for POST /api/posts: an attested batch must fit
 * the plan (Free has no bulk, paid plans cap videos per batch). Undeclared
 * sequential creates stay bounded by the monthly quota backstop.
 */
export function checkBulkBatch(
  eff: EffectiveSubscription,
  rawSize: unknown
): BulkBatchGate {
  const parsed = parseBulkBatchSize(rawSize);
  if (parsed === null) return { ok: true };
  if (parsed === "invalid") return { ok: false, invalid: true };
  const allowed = canBulkSchedule(eff, parsed);
  if (!allowed.ok) return { ok: false, denial: allowed };
  return { ok: true };
}

export function canUseCalendar(eff: EffectiveSubscription): Check {
  if (eff.bypass || eff.entitlements.calendar) return { ok: true };
  return upgradeDenial(eff.plan, "The content calendar is not included in this plan.");
}

export function canRetry(eff: EffectiveSubscription): Check {
  if (eff.bypass || eff.entitlements.retryReschedule) return { ok: true };
  return upgradeDenial(eff.plan, "Retry and reschedule are not included in this plan.");
}

export function getRemainingQuota(
  eff: EffectiveSubscription,
  usage: Usage
): { postsLeft: number | null; scheduledPosts: number; totalAccounts: number } {
  const limit = eff.entitlements.monthlyPosts;
  return {
    postsLeft:
      eff.bypass || limit === null ? null : Math.max(0, limit - usage.postsThisMonth),
    scheduledPosts: usage.scheduledPosts,
    totalAccounts: usage.totalAccounts,
  };
}

/** All plan ids, for validation of incoming change requests. */
export function isKnownPlanId(value: unknown): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

/**
 * Server gate for OAuth connect callbacks. Counts existing accounts on the
 * platform and checks the entitlement — reconnects (existing row found by
 * the caller) skip this entirely and never consume quota.
 */
export async function assertCanConnectAccount(input: {
  userId: string;
  userEmail?: string | null;
  platform: string;
}): Promise<Check> {
  const [effective, count] = await Promise.all([
    getEffectivePlan({ userId: input.userId, userEmail: input.userEmail }),
    prisma.socialAccount.count({
      where: {
        userId: input.userId,
        platform: input.platform as "X",
      },
    }),
  ]);
  return canConnectAccount(effective, input.platform, count);
}
