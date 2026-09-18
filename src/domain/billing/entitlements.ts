/**
 * Pure billing entitlement rules (domain).
 *
 * Single source of truth for plan/business logic: pages, API routes and
 * components must use these helpers and never reimplement prices, limits
 * or status rules.
 *
 * No React, no Next.js, no Prisma, no Stripe, no environment access, no
 * abuse lookups — pure logic over injected snapshots. Live reads
 * (subscription/override/usage rows), quota stores, the admin gate and the
 * billing view model stay in `src/lib/entitlements.ts`, which re-exports
 * this module for compatibility.
 *
 * DOMAIN RULE: import only `../plans` (pure). Never Prisma, Stripe,
 * React, process.env, abuse, Next.js, Blob, fetch or Sentry.
 */
import {
  getPlan,
  PLANS,
  type FeatureKey,
  type PlanEntitlements,
  type PlanId,
} from "./plans";

export type DbPlan = "FREE" | "GROWTH" | "SCALE";
export type DbSubStatus = "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID";

export type SubscriptionRow = {
  plan: DbPlan;
  status: DbSubStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  /** Present on live rows; absent in test fixtures. Drives pending-checkout aging. */
  updatedAt?: Date;
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
  | "UNPAID"
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
  /**
   * Identity-level Free usage (AbuseFreeUsage) for the current period.
   * Null when the user has no abuse identity link (nothing shared yet) —
   * callers fall back to the per-user `postsThisMonth`. Never computed on
   * the client; always resolved server-side next to `getUsage`.
   */
  identityPostsUsed: number | null;
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

/**
 * How long a customer-without-subscription row reads as a pending checkout
 * (Stripe Checkout Sessions expire after 24h; older rows are abandoned and
 * may start over — stale open sessions are expired server-side on retry).
 */
export const CHECKOUT_PENDING_MS = 24 * 60 * 60 * 1000;

/**
 * True while a FREE row holds a Stripe customer but no authoritative
 * subscription state yet. Never grants access — the billing page shows a
 * processing state until the webhook (or reconciliation) lands.
 */
export function isCheckoutPending(
  subscription: SubscriptionRow,
  nowMs: number = Date.now()
): boolean {
  if (
    !subscription ||
    subscription.plan !== "FREE" ||
    !subscription.stripeCustomerId ||
    subscription.stripeSubId ||
    !subscription.updatedAt
  ) {
    return false;
  }
  return nowMs - subscription.updatedAt.getTime() < CHECKOUT_PENDING_MS;
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
  // UNPAID keeps no paid entitlements but stays lifecycle-distinct from
  // CANCELED: recovery (subscription.updated → active) can still reactivate
  // the same subscription, while CANCELED is terminal for that object.
  if (base.status === "UNPAID") {
    return { plan: "free", status: "UNPAID", expired: true };
  }
  // Fail closed: a scheduled cancellation without any period end must never
  // read as an indefinite paid plan.
  if (base.cancelAtPeriodEnd && !base.currentPeriodEnd) {
    return { plan: "free", status: "EXPIRED", expired: true };
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
    maxTotalAccounts: null,
    monthlyPosts: null,
    maxBulkVideos: Number.MAX_SAFE_INTEGER,
    calendar: true,
    bulk: true,
    retryReschedule: true,
  };
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
  currentTotalAccounts: number
): Check {
  if (eff.bypass) return { ok: true };
  const limit = eff.entitlements.maxTotalAccounts;
  if (limit === null) return { ok: true };
  if (currentTotalAccounts < limit) return { ok: true };
  return upgradeDenial(
    eff.plan,
    `Account limit reached (${currentTotalAccounts}/${limit} connected accounts).`
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
  return canUseFeature(eff, "calendar");
}

export function canRetry(eff: EffectiveSubscription): Check {
  return canUseFeature(eff, "retryReschedule");
}

/**
 * Single gate for boolean billing features (E3). Bypass and the plan
 * flag decide; denial messages are the historical per-feature strings,
 * verbatim. Bulk *count* caps stay in canBulkSchedule — this answers
 * availability only.
 */
const FEATURE_DENIALS: Record<FeatureKey, string> = {
  calendar: "The content calendar is not included in this plan.",
  bulk: "Bulk video scheduling is not included in this plan.",
  retryReschedule: "Retry and reschedule are not included in this plan.",
};

export function canUseFeature(
  eff: EffectiveSubscription,
  key: FeatureKey
): Check {
  if (eff.bypass || eff.entitlements[key]) return { ok: true };
  return upgradeDenial(eff.plan, FEATURE_DENIALS[key]);
}

/**
 * Posts-used number for progress display. Free plans share one
 * identity-level monthly allowance across all users of an AbuseIdentity
 * (enforced from AbuseFreeUsage), so Free progress shows the shared
 * `identityPostsUsed` whenever it is known. Paid plans and the admin
 * bypass keep the per-user counter. Server-side enforcement always stays
 * authoritative — this only selects the displayed snapshot.
 */
export function getDisplayPostsUsed(
  eff: EffectiveSubscription,
  usage: Usage
): number {
  if (
    eff.plan === "free" &&
    !eff.bypass &&
    usage.identityPostsUsed !== null
  ) {
    return usage.identityPostsUsed;
  }
  return usage.postsThisMonth;
}

export function getRemainingQuota(
  eff: EffectiveSubscription,
  usage: Usage
): { postsLeft: number | null; scheduledPosts: number; totalAccounts: number } {
  const limit = eff.entitlements.monthlyPosts;
  return {
    postsLeft:
      eff.bypass || limit === null
        ? null
        : Math.max(0, limit - getDisplayPostsUsed(eff, usage)),
    scheduledPosts: usage.scheduledPosts,
    totalAccounts: usage.totalAccounts,
  };
}

/** All plan ids, for validation of incoming change requests. */
export function isKnownPlanId(value: unknown): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}
