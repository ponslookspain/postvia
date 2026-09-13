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
 * - Live/Test separation is enforced by environment-scoped config
 *   (resolveStripeConfig): a test key never falls back to the live price
 *   defaults, and webhook secrets are verified per environment.
 * - Nothing here logs secrets, emails, amounts, or card data: callers log
 *   only event ids/types, internal user ids, plan ids and statuses.
 */

export const STRIPE_PRICE_GROWTH_DEFAULT = "price_1UEyqHRKEM3xporCj250GMR3";
export const STRIPE_PRICE_SCALE_DEFAULT = "price_1UEyqeRKEM3xporCZv7dEUEc";

export type StripePrices = { growth: string; scale: string };

/** Price ids are operator config (env) with safe production defaults. Prefer resolveStripeConfig, which refuses live defaults under a test key. */
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
 * current process env — environments can never mix clients, subscriptions,
 * webhook secrets or price ids through code.
 */
export function resolveStripeConfig(
  env: Record<string, string | undefined> = process.env
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
function isStaleDelivery(
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

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b;
  return a.getTime() === b.getTime();
}

/** True when the delivery restates the stored row exactly (no regression). */
function snapshotMatchesStored(input: {
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

/**
 * Applies a live-verified snapshot for the stored subscription id. The live
 * Stripe object is authoritative: the delivery only triggered the check.
 */
async function applyLiveSnapshot(
  userId: string,
  live: SubscriptionSnapshot,
  plan: Exclude<PlanId, "free">,
  status: DbSubStatus,
  stores: BillingSubscriptionStore,
  cursorFallback: number | null
): Promise<void> {
  await stores.upsertSubscription(userId, {
    plan: toDbPlan(plan),
    status,
    currentPeriodEnd: live.currentPeriodEnd,
    cancelAtPeriodEnd: live.cancelAtPeriodEnd,
    stripeCustomerId: live.customerId,
    stripeSubId: live.subscriptionId,
    lastStripeEventCreated: live.eventCreated ?? cursorFallback,
  });
}

async function safeRetrieve(
  stores: BillingSubscriptionStore,
  stripeSubId: string
): Promise<SubscriptionSnapshot | null> {
  try {
    return await stores.retrieveLiveSnapshot(stripeSubId);
  } catch {
    return null;
  }
}

/**
 * Applies one subscription snapshot to the Subscription row.
 *
 * Guarded writer — the ONLY authoritative path for plan/status/period/
 * cancel state:
 * - unknown prices/statuses/users grant nothing and write nothing;
 * - a strictly older delivery restating the stored row is applied as a
 *   no-op (cursor preserved); an older delivery that would regress state is
 *   verified against the live Stripe object, else ignored (stale-event);
 * - same-timestamp deliveries from different Event IDs are deterministic:
 *   identical state applies, regressing state requires live verification,
 *   and without Stripe reachability the writer throws StaleWebhookRetryError
 *   (route → 500 + claim release → Stripe redelivers) instead of guessing;
 * - a delivery for a different Stripe subscription than the stored one is
 *   verified against the live Stripe object: a genuine replacement
 *   (canceled → new purchase) applies the live-verified state, anything
 *   else is ignored (subscription-mismatch);
 * - metadata.userId never silently hijacks a subscription already bound to
 *   another user, and a confused customer id never rebinds a row
 *   (customer-mismatch) — conflicts fail closed with no grant.
 */
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
  // Ownership pinning: the delivery must not rebind a subscription (or a
  // customer) that is already bound to a different user.
  const ownerBySub = await stores.findUserByStripeSubId(
    snapshot.subscriptionId
  );
  if (ownerBySub && ownerBySub !== userId) {
    return { outcome: "ignored", reason: "subscription-mismatch" };
  }
  if (snapshot.customerId) {
    const ownerByCustomer = await stores.findUserByCustomerId(
      snapshot.customerId
    );
    if (ownerByCustomer && ownerByCustomer !== userId) {
      return { outcome: "ignored", reason: "customer-mismatch" };
    }
  }
  const current = await stores.getSubscriptionByUserId(userId);
  if (
    current?.stripeCustomerId &&
    snapshot.customerId &&
    current.stripeCustomerId !== snapshot.customerId
  ) {
    // Confused customer on a bound row. When the live object confirms the
    // stored binding, the delivery is stale/confused; otherwise fail closed
    // without granting anything.
    const liveStored = current.stripeSubId
      ? await safeRetrieve(stores, current.stripeSubId)
      : null;
    if (liveStored && liveStored.customerId === current.stripeCustomerId) {
      return { outcome: "ignored", reason: "customer-mismatch" };
    }
    return { outcome: "ignored", reason: "customer-mismatch" };
  }
  if (current?.stripeSubId && current.stripeSubId !== snapshot.subscriptionId) {
    // A different Stripe subscription than the stored one: either a genuine
    // replacement (canceled → new purchase) or a stale/confused delivery.
    const live = await safeRetrieve(stores, snapshot.subscriptionId);
    if (live) {
      const livePlan = priceIdToPlanId(live.priceId);
      const liveStatus = mapSubscriptionStatus(live.status);
      const liveUserOk = !live.userId || live.userId === userId;
      const liveCustomerOk =
        !live.customerId ||
        !snapshot.customerId ||
        live.customerId === snapshot.customerId;
      if (livePlan && liveStatus && liveUserOk && liveCustomerOk) {
        // The live Stripe object is authoritative: apply it, not the
        // possibly outdated delivery.
        await stores.upsertSubscription(userId, {
          plan: toDbPlan(livePlan),
          status: liveStatus,
          currentPeriodEnd: live.currentPeriodEnd,
          cancelAtPeriodEnd: live.cancelAtPeriodEnd,
          stripeCustomerId: live.customerId,
          stripeSubId: live.subscriptionId,
          lastStripeEventCreated:
            live.eventCreated ?? snapshot.eventCreated ?? null,
        });
        return { outcome: "applied", userId };
      }
      return { outcome: "ignored", reason: "subscription-mismatch" };
    }
    // Stripe unreachable (harness/offline): order by event time. A canceled
    // row replaced by a newer delivery converges; a stale delivery is dropped.
    if (isStaleDelivery(snapshot.eventCreated, current.lastStripeEventCreated)) {
      return { outcome: "ignored", reason: "stale-event" };
    }
    if (current.status === "CANCELED" || current.stripeSubId == null) {
      await stores.upsertSubscription(userId, {
        plan: toDbPlan(paidPlan),
        status,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        stripeCustomerId: snapshot.customerId,
        stripeSubId: snapshot.subscriptionId,
        lastStripeEventCreated: snapshot.eventCreated,
      });
      return { outcome: "applied", userId };
    }
    return { outcome: "ignored", reason: "subscription-mismatch" };
  }
  // Same object (or first write): order by event time. A same-timestamp
  // delivery from another Event ID that restates the row is a harmless
  // no-op; one that would regress state is decided by the live object, and
  // throws for redelivery when Stripe cannot be reached — never a guess.
  const last = current?.lastStripeEventCreated ?? null;
  if (
    current?.stripeSubId &&
    snapshot.eventCreated !== null &&
    last !== null &&
    snapshot.eventCreated <= last
  ) {
    if (
      snapshotMatchesStored({
        plan: toDbPlan(paidPlan),
        status,
        snapshot,
        current,
      })
    ) {
      await stores.upsertSubscription(userId, {
        plan: toDbPlan(paidPlan),
        status,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        stripeCustomerId: snapshot.customerId,
        stripeSubId: snapshot.subscriptionId,
        lastStripeEventCreated: last,
      });
      return { outcome: "applied", userId };
    }
    const live = await safeRetrieve(stores, current.stripeSubId);
    if (live) {
      const livePlan = priceIdToPlanId(live.priceId);
      const liveStatus = mapSubscriptionStatus(live.status);
      if (!livePlan || !liveStatus) {
        return { outcome: "ignored", reason: "stale-event" };
      }
      await applyLiveSnapshot(userId, live, livePlan, liveStatus, stores, last);
      return { outcome: "applied", userId };
    }
    throw new StaleWebhookRetryError(
      `cannot order ${snapshot.subscriptionId} event ${snapshot.eventCreated} against cursor ${last} without Stripe`
    );
  }
  if (isStaleDelivery(snapshot.eventCreated, last)) {
    return { outcome: "ignored", reason: "stale-event" };
  }
  await stores.upsertSubscription(userId, {
    plan: toDbPlan(paidPlan),
    status,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    stripeCustomerId: snapshot.customerId,
    stripeSubId: snapshot.subscriptionId,
    lastStripeEventCreated: snapshot.eventCreated ?? last,
  });
  return { outcome: "applied", userId };
}

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

/**
 * On-demand reconciliation (no polling): reads the live Stripe subscription
 * bound to the user and applies it through the same guarded writer. Used
 * after `checkout=success` (webhook may be delayed) and from support flows.
 * Never grants from local data alone; stale/confused live objects are
 * dropped by the guards.
 */
export async function reconcileSubscriptionFromStripe(input: {
  userId: string;
  nowSec?: number;
  stores: BillingSubscriptionStore;
}): Promise<WebhookOutcome | { outcome: "skipped"; reason: "no-stripe-sub" }> {
  const current = await input.stores.getSubscriptionByUserId(input.userId);
  if (!current?.stripeSubId) return { outcome: "skipped", reason: "no-stripe-sub" };
  const live = await safeRetrieve(input.stores, current.stripeSubId);
  if (!live) return { outcome: "skipped", reason: "no-stripe-sub" };
  const nowSec =
    input.nowSec ?? Math.floor(Date.now() / 1000);
  return processSubscriptionSnapshot(
    { ...live, eventCreated: live.eventCreated ?? nowSec },
    input.stores
  );
}

/**
 * Immediate cancellation for account deletion: stops future Stripe billing
 * for the user's subscription. Never throws; the caller decides durability.
 *
 * Tolerance: when `cancel` fails because the object is already terminal
 * (canceled on Stripe's side) or verifiably gone (404-style absence),
 * `getStatus` confirms it and the outcome is still `canceled`. Any other
 * failure — including an unreachable Stripe — is `failed`: the
 * account-deletion route blocks the wipe on `failed` and surfaces 500, so
 * a Stripe outage may delay deletion but can never orphan billing.
 */
export async function cancelStripeSubscriptionNow(input: {
  stripeSubId: string;
  cancel: (stripeSubId: string) => Promise<unknown>;
  /**
   * Raw Stripe status; null only for positively-verified absence (the
   * wrapper maps 404/resource_missing to null and rethrows anything else).
   */
  getStatus?: (stripeSubId: string) => Promise<string | null>;
}): Promise<{ outcome: "canceled" | "failed"; error?: unknown }> {
  try {
    await input.cancel(input.stripeSubId);
    return { outcome: "canceled" };
  } catch (error) {
    if (input.getStatus) {
      let status: string | null;
      try {
        status = await input.getStatus(input.stripeSubId);
      } catch {
        return { outcome: "failed", error };
      }
      if (status === null) return { outcome: "canceled" };
      const mapped = mapSubscriptionStatus(status);
      if (mapped === "CANCELED") return { outcome: "canceled" };
    }
    return { outcome: "failed", error };
  }
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
