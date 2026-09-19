import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getIdentityFreeUsage } from "@/lib/abuse";
import {
  getPlan,
  type PlanId,
} from "@/lib/plans";
import {
  canConnectAccount,
  getDisplayPostsUsed,
  getMonthStart,
  getPeriodKey,
  isCheckoutPending,
  resolveEffectiveFromRows,
  selectPostCount,
  type Check,
  type EffectiveSubscription,
  type QuotaClaimStore,
  type SubscriptionRow,
  type TestOverrideRow,
  type Usage,
} from "@/domain/billing/entitlements";

/**
 * Pure billing entitlement rules live in `@/domain/billing/entitlements`
 * and are re-exported here so existing `@/lib/entitlements` imports keep
 * working. Live reads, quota stores, the admin gate and the billing view
 * model stay in this module. No behavior change.
 */
export * from "@/domain/billing/entitlements";
export type * from "@/domain/billing/entitlements";

/**
 * Central entitlement layer. Single source of truth for plan/business
 * logic: pages, API routes and components must use these helpers and
 * never reimplement prices, limits or status rules.
 *
 * No React components, no Next.js — pure logic + Prisma reads. UI stays thin.
 * Row reads below are request-memoized with React `cache()` (keyed by
 * userId): AppShell and the page/route of the same request share one
 * Subscription/override read instead of two. Request-scoped only — no
 * global mutable cache, no cross-request or cross-user leakage.
 */

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
async function readSubscription(userId: string): Promise<SubscriptionRow> {
  const row = await prisma.subscription.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubId: row.stripeSubId,
    updatedAt: row.updatedAt,
  };
}

/** Request-memoized (see module header). Same signature and values. */
export const getSubscription = cache(readSubscription);

/** Raw admin test override. Only meaningful when the caller is an admin. */
async function readTestOverride(userId: string): Promise<TestOverrideRow> {
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

/** Request-memoized (see module header). Same signature and values. */
export const getTestOverride = cache(readTestOverride);

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
 * Request-memoized usage read (same `cache()` contract as the row
 * readers above). Callers pass only `userId`, so duplicate calls in one
 * request share a single fan-out. `nowMs` stays injectable for tests.
 */
export const getUsage = cache(
  async (userId: string, nowMs: number = Date.now()): Promise<Usage> => {
  const monthStart = getMonthStart(nowMs);
  const period = getPeriodKey(nowMs);
  const [postCount, usageRow, accountGroups, scheduledCount, identity] =
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
      // Read-only: never creates an identity or touches the ledger.
      // Failures degrade to per-user display instead of breaking the page.
      getIdentityFreeUsage({ userId, period, monthStart }).catch(() => ({
        identityId: null as string | null,
        used: 0,
      })),
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
    identityPostsUsed: identity.identityId === null ? null : identity.used,
  };
  }
);

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

/**
 * Billing page view model (E3). Assembled in exactly one place from the
 * same effective/usage/subscription inputs — pages never hand-roll it.
 * No plan/status writes here: read-only projection for display.
 */
export type BillingView = {
  plan: PlanId;
  status: string;
  price: number;
  period: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  postsUsed: number;
  postsLimit: number | null;
  totalAccounts: number;
  accountsLimit: number | null;
  /** Checkout started, no authoritative subscription state yet — no paid grant. */
  checkoutPending: boolean;
  checkoutResult: "success" | "cancelled" | null;
  /** A Stripe customer exists: upgrades/fixes go through the portal, not a new checkout. */
  hasBillingCustomer: boolean;
};

export function buildBillingView(input: {
  effective: EffectiveSubscription;
  usage: Usage;
  subscription: SubscriptionRow;
  checkoutResult: "success" | "cancelled" | null;
}): BillingView {
  const { effective, usage, subscription, checkoutResult } = input;
  return {
    plan: effective.plan,
    status: effective.status,
    price: getPlan(effective.plan).price,
    period: getPlan(effective.plan).period,
    currentPeriodEnd: effective.currentPeriodEnd
      ? effective.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: effective.cancelAtPeriodEnd,
    postsUsed: getDisplayPostsUsed(effective, usage),
    postsLimit: effective.entitlements.monthlyPosts,
    totalAccounts: usage.totalAccounts,
    accountsLimit: effective.entitlements.maxTotalAccounts,
    checkoutPending: isCheckoutPending(subscription),
    checkoutResult,
    hasBillingCustomer: !!subscription?.stripeCustomerId,
  };
}

/**
 * Server gate for OAuth connect callbacks. Counts all connected accounts
 * of the user (global total) and checks the entitlement — reconnects
 * (existing row found by the caller) skip this entirely and never consume
 * quota.
 */
export async function assertCanConnectAccount(input: {
  userId: string;
  userEmail?: string | null;
}): Promise<Check> {
  const [effective, count] = await Promise.all([
    getEffectivePlan({ userId: input.userId, userEmail: input.userEmail }),
    prisma.socialAccount.count({
      where: {
        userId: input.userId,
      },
    }),
  ]);
  return canConnectAccount(effective, count);
}
