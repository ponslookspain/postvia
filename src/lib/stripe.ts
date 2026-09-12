import Stripe from "stripe";
import { toDbPlan, type DbPlan, type DbSubStatus } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";

export { isStripeRedirectUrl } from "@/lib/stripe-redirect";

/**
 * Stripe billing layer (server-only: reads secrets, talks to Stripe).
 *
 * Invariants:
 * - Subscription is the single source of real billing state. Only the
 *   Stripe webhook writes paid state; Checkout/Portal never write plans.
 * - BillingTestOverride is admin-only test state and is never consulted
 *   here — a webhook event can never become, or derive from, an override.
 * - Nothing here logs secrets, emails, amounts, or card data: callers log
 *   only event ids/types, internal user ids, plan ids and statuses.
 */

export const STRIPE_PRICE_GROWTH_DEFAULT = "price_1UEyqHRKEM3xporCj250GMR3";
export const STRIPE_PRICE_SCALE_DEFAULT = "price_1UEyqeRKEM3xporCZv7dEUEc";

export type StripePrices = { growth: string; scale: string };

/** Price ids are operator config (env) with safe production defaults. */
export function getStripePrices(
  env: Record<string, string | undefined> = process.env
): StripePrices {
  return {
    growth: env.STRIPE_PRICE_GROWTH?.trim() || STRIPE_PRICE_GROWTH_DEFAULT,
    scale: env.STRIPE_PRICE_SCALE?.trim() || STRIPE_PRICE_SCALE_DEFAULT,
  };
}

/** Maps a Stripe price id onto a paid plan. Unknown prices grant nothing. */
export function priceIdToPlanId(
  priceId: string | null | undefined,
  prices: StripePrices = getStripePrices()
): Exclude<PlanId, "free"> | null {
  if (!priceId) return null;
  if (priceId === prices.growth) return "growth";
  if (priceId === prices.scale) return "scale";
  return null;
}

export function isStripeConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

let cachedClient: Stripe | null = null;

/** Lazy Stripe client. Throws when billing is not configured. */
export function getStripeClient(
  env: Record<string, string | undefined> = process.env
): Stripe {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Billing is not configured");
  if (!cachedClient) cachedClient = new Stripe(key);
  return cachedClient;
}

/**
 * Maps a Stripe subscription status onto our SubscriptionStatus.
 * Returns null for non-terminal states (incomplete, paused, ...): no write
 * happens, the row waits for a later terminal event.
 */
export function mapSubscriptionStatus(status: string): DbSubStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null;
  }
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
 */
export function snapshotSubscription(sub: unknown): SubscriptionSnapshot | null {
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
};

/** Prisma-backed billing writes, injected so tests run without a database. */
export type BillingSubscriptionStore = {
  findUserByStripeSubId: (stripeSubId: string) => Promise<string | null>;
  findUserByCustomerId: (customerId: string) => Promise<string | null>;
  upsertSubscription: (
    userId: string,
    write: SubscriptionWrite
  ) => Promise<void>;
  /** Sets status on the row holding this Stripe subscription. Returns owner. */
  setStatusByStripeSubId: (
    stripeSubId: string,
    status: DbSubStatus
  ) => Promise<string | null>;
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
      reason: "unknown-price" | "unhandled-status" | "unhandled-type";
    }
  | { outcome: "unresolvable"; reason: "unknown-user" | "unknown-subscription" }
  | { outcome: "duplicate" };

/** Applies one subscription snapshot to the Subscription row. */
export async function processSubscriptionSnapshot(
  snapshot: SubscriptionSnapshot,
  stores: BillingSubscriptionStore
): Promise<WebhookOutcome> {
  const paidPlan = priceIdToPlanId(snapshot.priceId);
  if (!paidPlan) return { outcome: "ignored", reason: "unknown-price" };
  const status = mapSubscriptionStatus(snapshot.status);
  if (!status) return { outcome: "ignored", reason: "unhandled-status" };
  const userId =
    snapshot.userId ??
    (await stores.findUserByStripeSubId(snapshot.subscriptionId)) ??
    (snapshot.customerId
      ? await stores.findUserByCustomerId(snapshot.customerId)
      : null);
  if (!userId) return { outcome: "unresolvable", reason: "unknown-user" };
  await stores.upsertSubscription(userId, {
    plan: toDbPlan(paidPlan),
    status,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    stripeCustomerId: snapshot.customerId,
    stripeSubId: snapshot.subscriptionId,
  });
  return { outcome: "applied", userId };
}

/** Applies one invoice payment result to the Subscription row. */
export async function processInvoiceSnapshot(
  invoice: InvoiceSnapshot,
  stores: BillingSubscriptionStore
): Promise<WebhookOutcome> {
  if (!invoice.subscriptionId) {
    return { outcome: "unresolvable", reason: "unknown-subscription" };
  }
  const owner = await stores.setStatusByStripeSubId(
    invoice.subscriptionId,
    invoice.succeeded ? "ACTIVE" : "PAST_DUE"
  );
  if (!owner) return { outcome: "unresolvable", reason: "unknown-subscription" };
  return { outcome: "applied", userId: owner };
}

export type WebhookPayload =
  | { kind: "subscription"; snapshot: SubscriptionSnapshot }
  | { kind: "invoice"; invoice: InvoiceSnapshot };

/**
 * Idempotent webhook dispatcher: claims the event id first (duplicates are
 * acknowledged without re-applying), then applies the payload. Unknown
 * event types are recorded as seen and ignored.
 */
export async function processWebhookEvent(input: {
  eventId: string;
  type: string;
  payload: WebhookPayload | null;
  stores: BillingSubscriptionStore & WebhookEventStore;
}): Promise<WebhookOutcome> {
  const claimed = await input.stores.claimEvent(input.eventId, input.type);
  if (!claimed) return { outcome: "duplicate" };
  if (!input.payload) return { outcome: "ignored", reason: "unhandled-type" };
  if (input.payload.kind === "subscription") {
    return processSubscriptionSnapshot(input.payload.snapshot, input.stores);
  }
  return processInvoiceSnapshot(input.payload.invoice, input.stores);
}
