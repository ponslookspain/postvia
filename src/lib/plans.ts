/**
 * Pricing plans. Stripe checkout/portal/webhook is the billing backend
 * (see /api/billing/* and src/lib/stripe.ts); the BillingTestOverride table
 * is an admin-only sandbox for testing without paying.
 *
 * This module is the single source of truth for plan identity, pricing
 * AND entitlements. UI, API and tests must import limits from here —
 * never duplicate prices or limits elsewhere.
 *
 * Plans are marketing-level until a Subscription row exists; confirming a
 * plan writes it server-side (see /api/billing/*).
 */

export type PlanId = "free" | "growth" | "scale";

export type PlanEntitlements = {
  /** Max connected social accounts in total per user (null = unlimited). */
  maxTotalAccounts: number | null;
  /** Posts creatable per calendar month (null = unlimited). */
  monthlyPosts: number | null;
  /** Max videos per bulk batch (0 = bulk disabled). */
  maxBulkVideos: number;
  calendar: boolean;
  bulk: boolean;
  retryReschedule: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  entitlements: PlanEntitlements;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "month",
    description: "Start publishing right away, no card required.",
    features: [
      "Publish to Instagram, Threads, TikTok and X",
      "Schedule posts ahead",
      "Per-platform previews",
      "1 connected account",
    ],
    entitlements: {
      maxTotalAccounts: 1,
      monthlyPosts: 15,
      maxBulkVideos: 0,
      calendar: true,
      bulk: false,
      retryReschedule: true,
    },
  },
  {
    id: "growth",
    name: "Growth",
    price: 20,
    period: "month",
    description: "For creators publishing every week.",
    features: [
      "Everything in Free",
      "Visual content calendar",
      "Bulk video scheduling up to 10 videos",
      "Up to 5 connected accounts",
      "Retry and reschedule controls",
    ],
    highlighted: true,
    entitlements: {
      maxTotalAccounts: 5,
      monthlyPosts: 300,
      maxBulkVideos: 10,
      calendar: true,
      bulk: true,
      retryReschedule: true,
    },
  },
  {
    id: "scale",
    name: "Scale",
    price: 50,
    period: "month",
    description: "For teams and heavy schedules.",
    features: [
      "Everything in Growth",
      "Unlimited scheduled posts",
      "Priority publishing queue",
      "All current and future platforms",
    ],
    entitlements: {
      maxTotalAccounts: null,
      monthlyPosts: null,
      maxBulkVideos: 10,
      calendar: true,
      bulk: true,
      retryReschedule: true,
    },
  },
];

export function parsePlanParam(raw: unknown): PlanId | null {
  if (raw === "free" || raw === "growth" || raw === "scale") return raw;
  return null;
}

export function getPlan(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[1];
}
