import Stripe from "stripe";
import { toDbPlan, type DbSubStatus } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";

export { isStripeRedirectUrl } from "@/lib/stripe-redirect";
import {
  priceIdToPlanId as priceIdToPlanIdInDomain,
  getStripePrices as getStripePricesInDomain,
  resolveStripeConfig as resolveStripeConfigInDomain,
  isStaleDelivery,
  mapSubscriptionStatus,
  processInvoiceSnapshot,
  snapshotMatchesStored,
  StaleWebhookRetryError,
  type BillingSubscriptionStore,
  type ResolvedStripeConfig,
  type StripePrices,
  type SubscriptionSnapshot,
  type WebhookEventStore,
  type WebhookOutcome,
  type WebhookPayload,
} from "@/domain/billing/stripe-rules";

/**
 * Pure Stripe billing rules live in `@/domain/billing/stripe-rules` and are
 * re-exported here so existing `@/lib/stripe` imports keep working. The SDK
 * client, env-gated wrappers, guarded writer, dispatcher and live calls stay
 * in this module. No behavior change.
 */
export * from "@/domain/billing/stripe-rules";
export type * from "@/domain/billing/stripe-rules";

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

/**
 * Ambient-env wrapper: reads `process.env` and delegates to the pure domain
 * function. Price ids are operator config with safe production defaults.
 */
export function getStripePrices(
  env: Record<string, string | undefined> = process.env
): StripePrices {
  return getStripePricesInDomain(env);
}

/**
 * Ambient-env wrapper: resolves prices from `process.env` unless overridden
 * and delegates to the pure domain function. Unknown prices grant nothing.
 */
export function priceIdToPlanId(
  priceId: string | null | undefined,
  prices: StripePrices = getStripePrices()
): Exclude<PlanId, "free"> | null {
  return priceIdToPlanIdInDomain(priceId, prices);
}

export function isStripeConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

/**
 * Ambient-env wrapper: reads `process.env` and delegates to the pure domain
 * function, which enforces Live/Test separation (a test key never falls back
 * to the live price defaults).
 */
export function resolveStripeConfig(
  env: Record<string, string | undefined> = process.env
): ResolvedStripeConfig {
  return resolveStripeConfigInDomain(env);
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
