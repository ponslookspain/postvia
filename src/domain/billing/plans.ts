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
  /**
   * Max video size per upload, in bytes, for THIS plan. A tighter subset
   * of the absolute platform ceiling (`MEDIA_LIMITS.VIDEO.maxBytes`,
   * `src/domain/media/policy.ts`) — that ceiling never changes per plan,
   * this narrows it further for cheaper tiers. Image size is not
   * plan-gated; only video, because video is what drives storage cost.
   */
  maxVideoBytes: number;
  /**
   * Max media files per post for THIS plan. A tighter subset of the
   * absolute ceiling (`MAX_MEDIA_PER_POST`, `src/domain/media/policy.ts`),
   * same relationship as `maxVideoBytes` above.
   */
  maxMediaPerPost: number;
  /**
   * How long a fully-published post keeps its media before the retention
   * sweep (`src/lib/media-retention.ts`) reclaims it, in milliseconds.
   * Never null in practice today — every plan has a horizon — kept
   * nullable so "no automatic expiry" has a real, self-documenting value
   * if a future plan ever needs one, instead of a magic huge number.
   */
  mediaRetentionMs: number | null;
};

/**
 * Boolean-gated billing features (E3). Quota/count entitlements
 * (maxTotalAccounts, monthlyPosts, maxBulkVideos) stay numeric and keep
 * their dedicated gates; only on/off features live behind FeatureKey.
 * A new paid gate means one key here, one denial line in
 * `entitlements.ts`, one UI row — never a new boolean pair + `can*`.
 */
export type FeatureKey = "calendar" | "bulk" | "retryReschedule";

export const FEATURE_KEYS: readonly FeatureKey[] = [
  "calendar",
  "bulk",
  "retryReschedule",
];

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
      "Videos up to 50 MB, 2 files per post",
      "Media kept for 3 months after publishing",
    ],
    entitlements: {
      maxTotalAccounts: 1,
      monthlyPosts: 15,
      maxBulkVideos: 0,
      calendar: true,
      bulk: false,
      retryReschedule: true,
      maxVideoBytes: 50 * 1024 * 1024,
      maxMediaPerPost: 2,
      mediaRetentionMs: 90 * 86_400_000,
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
      "Videos up to 100 MB, 4 files per post",
      "Media kept for 12 months after publishing",
    ],
    highlighted: true,
    entitlements: {
      maxTotalAccounts: 5,
      monthlyPosts: 300,
      maxBulkVideos: 10,
      calendar: true,
      bulk: true,
      retryReschedule: true,
      maxVideoBytes: 100 * 1024 * 1024,
      maxMediaPerPost: 4,
      mediaRetentionMs: 365 * 86_400_000,
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
      "Videos up to 100 MB, 4 files per post",
      "Media kept for 12 months after publishing",
    ],
    entitlements: {
      maxTotalAccounts: null,
      monthlyPosts: null,
      maxBulkVideos: 10,
      calendar: true,
      bulk: true,
      retryReschedule: true,
      maxVideoBytes: 100 * 1024 * 1024,
      maxMediaPerPost: 4,
      mediaRetentionMs: 365 * 86_400_000,
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
