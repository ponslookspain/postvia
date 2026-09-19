/**
 * Pure Stripe billing rules (domain).
 *
 * Price mapping, key-mode detection, subscription-status mapping, webhook
 * snapshot parsing and ordering guards. No Stripe SDK, no Prisma, no
 * network, no logging, no environment access — the caller supplies `env`
 * explicitly, snapshots arrive as plain data. The guarded writer,
 * idempotency ledger, live Stripe calls and the SDK client stay in
 * `src/lib/stripe.ts`, which re-exports this module for compatibility.
 *
 * DOMAIN RULE: import only `./plans` and `./entitlements` (types only).
 * Never Prisma, Stripe SDK, React, process.env, abuse, Next.js, Blob,
 * fetch or Sentry.
 */
import type { PlanId } from "./plans";
import type { DbPlan, DbSubStatus } from "./entitlements";

export const STRIPE_PRICE_GROWTH_DEFAULT = "price_1UEyqHRKEM3xporCj250GMR3";
export const STRIPE_PRICE_SCALE_DEFAULT = "price_1UEyqeRKEM3xporCZv7dEUEc";

export type StripePrices = { growth: string; scale: string };

/** Price ids are operator config (env) with safe production defaults. Prefer resolveStripeConfig, which refuses live defaults under a test key. */
export function getStripePrices(
  env: Record<string, string | undefined>
): StripePrices {
  return {
    growth: env.STRIPE_PRICE_GROWTH?.trim() || STRIPE_PRICE_GROWTH_DEFAULT,
    scale: env.STRIPE_PRICE_SCALE?.trim() || STRIPE_PRICE_SCALE_DEFAULT,
  };
}

/** Maps a Stripe price id onto a paid plan. Unknown prices grant nothing. */
export function priceIdToPlanId(
  priceId: string | null | undefined,
  prices: StripePrices
): Exclude<PlanId, "free"> | null {
  if (!priceId) return null;
  if (priceId === prices.growth) return "growth";
  if (priceId === prices.scale) return "scale";
  return null;
}

export type StripeKeyMode = "live" | "test" | "unknown";

/**
 * Detects the Stripe account mode from the secret-key prefix
 * (sk_live_/rk_live_ vs sk_test_/rk_test_). Heuristic only: it selects
 * configuration, never authorization — every request is still verified by
 * Stripe itself (API calls, webhook signatures).
 */
export function getStripeKeyMode(
  secret: string | null | undefined
): StripeKeyMode {
  const key = secret?.trim() ?? "";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "unknown";
}

export type ResolvedStripeConfig = {
  configured: boolean;
  /** Null when unconfigured. */
  mode: StripeKeyMode | null;
  /**
   * Null when billing cannot start checkouts: unconfigured, or a test key
   * without explicit test price ids. Test mode never inherits the live
   * price defaults, so Preview can never charge or reference live prices.
   */
  prices: StripePrices | null;
};

/**
 * Resolves billing configuration for the current environment. Vercel scopes
 * STRIPE_* vars per environment (Production = live key/secrets/prices,
 * Preview = test key/secrets/prices), and this resolver reads only the
 * supplied env — environments can never mix clients, subscriptions,
 * webhook secrets or price ids through code.
 */
export function resolveStripeConfig(
  env: Record<string, string | undefined>
): ResolvedStripeConfig {
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return { configured: false, mode: null, prices: null };
  const mode = getStripeKeyMode(secret);
  const growth = env.STRIPE_PRICE_GROWTH?.trim() || null;
  const scale = env.STRIPE_PRICE_SCALE?.trim() || null;
  if (growth && scale) return { configured: true, mode, prices: { growth, scale } };
  if (mode === "test") return { configured: true, mode, prices: null };
  return {
    configured: true,
    mode,
    prices: {
      growth: growth || STRIPE_PRICE_GROWTH_DEFAULT,
      scale: scale || STRIPE_PRICE_SCALE_DEFAULT,
    },
  };
}

/**
 * Maps a Stripe subscription status onto our SubscriptionStatus.
 * Returns null for non-terminal states (incomplete, paused, ...): no write
 * happens, the row waits for a later terminal event.
 *
 * `past_due` keeps the paid plan flagged (transient dunning); `unpaid`
 * revokes paid access while staying lifecycle-distinct from `canceled`.
 */
export function mapSubscriptionStatus(status: string): DbSubStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null;
  }
}

/**
 * Stripe subscription statuses that represent a live billing stake: the
 * customer must manage this through the Customer Portal instead of opening
 * a second Checkout. `incomplete` (initial payment in flight) counts —
 * `incomplete_expired` does not, so a failed first payment can retry.
 */
export const LIVE_STRIPE_SUBSCRIPTION_STATUSES: readonly string[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
];

export function isLiveStripeSubscriptionStatus(status: string): boolean {
  return LIVE_STRIPE_SUBSCRIPTION_STATUSES.includes(status);
}

/** Stored subscription shape as seen by Checkout guards. */
export type ExistingSubscription = {
  plan: PlanId;
  status: string;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * True when the stored row represents a live paid stake: any non-terminal
 * subscription that is not yet expired. CANCELED rows, expired
 * cancel-at-period-end rows and customer-only pending rows may start a
 * fresh checkout; everything else goes to the Customer Portal.
 */
export function hasLivePaidStake(
  existing: ExistingSubscription | null,
  nowMs: number = Date.now()
): boolean {
  if (!existing) return false;
  if (existing.status === "CANCELED") return false;
  if (
    existing.cancelAtPeriodEnd &&
    existing.currentPeriodEnd &&
    existing.currentPeriodEnd.getTime() <= nowMs
  ) {
    return false;
  }
  if (existing.stripeSubId) return true;
  if (existing.plan !== "free") return true;
  return false;
}

/** Minimal subscription facts the webhook needs. Built from the raw event. */
export type SubscriptionSnapshot = {
  subscriptionId: string;
  customerId: string | null;
  priceId: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  /** Internal user id from subscription metadata (set at Checkout). */
  userId: string | null;
  /**
   * Stripe `event.created` (unix seconds) of the delivery carrying this
   * snapshot. The ordering guard ignores deliveries older than the last
   * applied one; null disables the guard (legacy callers, harness).
   */
  eventCreated: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "string") return value;
  const id = asRecord(value)?.id;
  return typeof id === "string" ? id : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  return null;
}

/**
 * Extracts subscription facts from a raw webhook object. Reads defensively
 * across Stripe API versions: period end lives on the subscription in older
 * versions and on the first subscription item in newer ones; unknown shapes
 * yield null instead of throwing.
 *
 * Pass the enclosing Stripe event's `created` timestamp so the ordering
 * guard can reject stale out-of-order deliveries.
 */
export function snapshotSubscription(
  sub: unknown,
  eventCreated?: number | null
): SubscriptionSnapshot | null {
  const rec = asRecord(sub);
  if (!rec || typeof rec.id !== "string") return null;
  const items = asRecord(rec.items);
  const data = items?.data;
  const item = asRecord(Array.isArray(data) ? data[0] ?? null : null);
  const priceId = asId(asRecord(item?.price)?.id) ?? asId(item?.price);
  const currentPeriodEnd =
    asDate(rec.current_period_end) ?? asDate(item?.current_period_end);
  const metaUserId = asRecord(rec.metadata)?.userId;
  return {
    subscriptionId: rec.id,
    customerId: asId(rec.customer),
    priceId,
    status: typeof rec.status === "string" ? rec.status : "",
    cancelAtPeriodEnd: rec.cancel_at_period_end === true,
    currentPeriodEnd,
    userId: typeof metaUserId === "string" && metaUserId ? metaUserId : null,
    eventCreated:
      typeof eventCreated === "number" && Number.isFinite(eventCreated)
        ? Math.floor(eventCreated)
        : null,
  };
}

/** Minimal invoice facts the webhook needs. */
export type InvoiceSnapshot = {
  subscriptionId: string | null;
  customerId: string | null;
  succeeded: boolean;
};

/**
 * Newer API versions nest the subscription id under
 * parent.subscription_details; older payloads carry a top-level
 * subscription field. Both shapes are accepted.
 */
export function snapshotInvoice(
  invoice: unknown,
  succeeded: boolean
): InvoiceSnapshot {
  const rec = asRecord(invoice) ?? {};
  const parent = asRecord(rec.parent);
  const details =
    parent?.type === "subscription_details"
      ? asRecord(parent.subscription_details)
      : null;
  return {
    subscriptionId: asId(details?.subscription) ?? asId(rec.subscription),
    customerId: asId(rec.customer),
    succeeded,
  };
}

export type SubscriptionWrite = {
  plan: DbPlan;
  status: DbSubStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubId: string;
  lastStripeEventCreated: number | null;
};

/** Stored subscription row as seen by the webhook guards. */
export type StoredSubscription = {
  userId: string;
  plan: DbPlan;
  status: DbSubStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  lastStripeEventCreated: number | null;
};

/** Prisma-backed billing writes, injected so tests run without a database. */
export type BillingSubscriptionStore = {
  findUserByStripeSubId: (stripeSubId: string) => Promise<string | null>;
  findUserByCustomerId: (customerId: string) => Promise<string | null>;
  getSubscriptionByUserId: (
    userId: string
  ) => Promise<StoredSubscription | null>;
  upsertSubscription: (
    userId: string,
    write: SubscriptionWrite
  ) => Promise<void>;
  /**
   * Retrieves the live Stripe subscription for conflict resolution
   * (stale-suspect or subscription-mismatch deliveries only — never on the
   * hot path). Returns null when Stripe is unreachable or the object is
   * gone; callers fall back to timestamp ordering and fail closed.
   */
  retrieveLiveSnapshot: (
    stripeSubId: string
  ) => Promise<SubscriptionSnapshot | null>;
};

/** Idempotency ledger, injected so tests run without a database. */
export type WebhookEventStore = {
  /** Atomically claims the event. False means already seen (duplicate). */
  claimEvent: (eventId: string, type: string) => Promise<boolean>;
  /** Releases a claim so a failed delivery can be retried by Stripe. */
  releaseEvent: (eventId: string) => Promise<void>;
};

export type WebhookOutcome =
  | { outcome: "applied"; userId: string }
  | {
      outcome: "ignored";
      reason:
        | "unknown-price"
        | "unhandled-status"
        | "unhandled-type"
        | "stale-event"
        | "subscription-mismatch"
        | "customer-mismatch"
        | "invoice-telemetry";
    }
  | { outcome: "unresolvable"; reason: "unknown-user" | "unknown-subscription" }
  | { outcome: "duplicate" };

/**
 * True when the incoming delivery is older than the last applied event for
 * this row. Unknown timestamps (null on either side) disable the guard so
 * legacy rows and harness snapshots keep applying.
 */
export function isStaleDelivery(
  eventCreated: number | null,
  lastApplied: number | null
): boolean {
  if (eventCreated === null || lastApplied === null) return false;
  return eventCreated < lastApplied;
}

/**
 * Thrown when a same-or-older delivery would change subscription state but
 * the live Stripe object cannot be reached to decide. The webhook route maps
 * this to 500 and releases the idempotency claim, so Stripe redelivers
 * later instead of the writer guessing between two orderings.
 */
export class StaleWebhookRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleWebhookRetryError";
  }
}

export function sameInstant(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b;
  return a.getTime() === b.getTime();
}

/** True when the delivery restates the stored row exactly (no regression). */
export function snapshotMatchesStored(input: {
  plan: DbPlan;
  status: DbSubStatus;
  snapshot: SubscriptionSnapshot;
  current: StoredSubscription;
}): boolean {
  return (
    input.plan === input.current.plan &&
    input.status === input.current.status &&
    sameInstant(input.snapshot.currentPeriodEnd, input.current.currentPeriodEnd) &&
    input.snapshot.cancelAtPeriodEnd === input.current.cancelAtPeriodEnd
  );
}

export type WebhookPayload =
  | { kind: "subscription"; snapshot: SubscriptionSnapshot }
  | { kind: "invoice"; invoice: InvoiceSnapshot };

/**
 * Invoice events are telemetry only — they NEVER write subscription state.
 * Plan/status/period/cancel access derives exclusively from subscription
 * events (which Stripe emits for every lifecycle transition, including
 * renewals, failures and recoveries). Claimed upstream for idempotency.
 */
export async function processInvoiceSnapshot(
  _invoice: InvoiceSnapshot,
  _stores: BillingSubscriptionStore
): Promise<WebhookOutcome> {
  void _invoice;
  void _stores;
  return { outcome: "ignored", reason: "invoice-telemetry" };
}
