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

export type DbPlan = "STARTER" | "GROWTH" | "SCALE";
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
  STARTER: "starter",
  GROWTH: "growth",
  SCALE: "scale",
};

const PLAN_TO_DB: Record<PlanId, DbPlan> = {
  starter: "STARTER",
  growth: "GROWTH",
  scale: "SCALE",
};

export function toPlanId(plan: DbPlan): PlanId {
  return DB_TO_PLAN[plan];
}

export function toDbPlan(plan: PlanId): DbPlan {
  return PLAN_TO_DB[plan];
}

/** Next paid tier, or null when already on top. */
export function getUpgradeTarget(plan: PlanId): Exclude<PlanId, "scale"> | "scale" | null {
  if (plan === "starter") return "growth";
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
  if (!base) return { plan: "starter", status: "ACTIVE", expired: false };
  const plan = toPlanId(base.plan);
  if (base.status === "CANCELED") {
    return { plan: "starter", status: "CANCELED", expired: true };
  }
  if (
    base.cancelAtPeriodEnd &&
    base.currentPeriodEnd &&
    base.currentPeriodEnd.getTime() <= nowMs
  ) {
    return { plan: "starter", status: "EXPIRED", expired: true };
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
      plan: "starter",
      status: "ACTIVE",
      bypass: false,
      source: "default",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      entitlements: getPlan("starter").entitlements,
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
 * - Month = UTC calendar month containing `now`.
 * - Every Post row created in the month counts (draft/scheduled/
 *   published/failed...). Deleted posts vanish with their rows and stop
 *   counting — no destructive cleanup, ever.
 * - An account counts once per SocialAccount row on that platform.
 */
export async function getUsage(
  userId: string,
  nowMs: number = Date.now()
): Promise<Usage> {
  const now = new Date(nowMs);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const [postCount, accountGroups, scheduledCount] = await Promise.all([
    prisma.post.count({
      where: { userId, createdAt: { gte: monthStart } },
    }),
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
    postsThisMonth: postCount,
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
