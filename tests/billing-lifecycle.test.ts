import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_STRIPE_SUBSCRIPTION_STATUSES,
  cancelStripeSubscriptionNow,
  hasLivePaidStake,
  mapSubscriptionStatus,
  processInvoiceSnapshot,
  processSubscriptionSnapshot,
  processWebhookEvent,
  reconcileSubscriptionFromStripe,
  snapshotSubscription,
  type BillingSubscriptionStore,
  type InvoiceSnapshot,
  type StoredSubscription,
  type SubscriptionSnapshot,
  type SubscriptionWrite,
  type WebhookEventStore,
} from "../src/lib/stripe";
import {
  applyPeriodRules,
  canCreatePost,
  claimMonthlyQuota,
  getRemainingQuota,
  isCheckoutPending,
  resolveEffectiveFromRows,
  type EffectiveSubscription,
  type QuotaClaimStore,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";
import {
  handleCheckout,
  type CheckoutDeps,
} from "../src/app/api/billing/checkout/route";

const GROWTH_PRICE = "price_1UEyqHRKEM3xporCj250GMR3";
const SCALE_PRICE = "price_1UEyqeRKEM3xporCZv7dEUEc";

const T0 = 1_780_000_000; // fixed Stripe `created` baseline (seconds)
const FUTURE = new Date("2026-10-12T00:00:00Z");
const PAST = new Date("2026-08-12T00:00:00Z");
const NOW = new Date("2026-09-12T12:00:00Z").getTime();

type SubRow = StoredSubscription;

function makeStores(initial: SubRow[] = [], live: Record<string, SubscriptionSnapshot> = {}) {
  const subs = new Map<string, SubRow>(initial.map((row) => [row.userId, row]));
  const events = new Map<string, string>();
  const counters = { upserts: 0 };
  const subStore: BillingSubscriptionStore = {
    findUserByStripeSubId: async (stripeSubId) => {
      for (const row of subs.values()) {
        if (row.stripeSubId === stripeSubId) return row.userId;
      }
      return null;
    },
    findUserByCustomerId: async (customerId) => {
      for (const row of subs.values()) {
        if (row.stripeCustomerId === customerId) return row.userId;
      }
      return null;
    },
    getSubscriptionByUserId: async (userId) => {
      const row = subs.get(userId);
      return row ? { ...row } : null;
    },
    upsertSubscription: async (userId, write: SubscriptionWrite) => {
      counters.upserts += 1;
      subs.set(userId, {
        userId,
        plan: write.plan,
        status: write.status,
        stripeCustomerId: write.stripeCustomerId,
        stripeSubId: write.stripeSubId,
        currentPeriodEnd: write.currentPeriodEnd,
        cancelAtPeriodEnd: write.cancelAtPeriodEnd,
        lastStripeEventCreated: write.lastStripeEventCreated,
      });
    },
    retrieveLiveSnapshot: async (stripeSubId) => {
      const snap = live[stripeSubId];
      return snap ? { ...snap } : null;
    },
  };
  const eventStore: WebhookEventStore = {
    claimEvent: async (eventId, type) => {
      if (events.has(eventId)) return false;
      events.set(eventId, type);
      return true;
    },
    releaseEvent: async (eventId) => {
      events.delete(eventId);
    },
  };
  return { stores: { ...subStore, ...eventStore }, subs, events, counters };
}

function stored(overrides: Partial<SubRow> = {}): SubRow {
  return {
    userId: "user-1",
    plan: "GROWTH",
    status: "ACTIVE",
    stripeCustomerId: "cus_1",
    stripeSubId: "sub_1",
    currentPeriodEnd: FUTURE,
    cancelAtPeriodEnd: false,
    lastStripeEventCreated: T0,
    ...overrides,
  };
}

function snap(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    subscriptionId: "sub_1",
    customerId: "cus_1",
    priceId: GROWTH_PRICE,
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: FUTURE,
    userId: "user-1",
    eventCreated: T0,
    ...overrides,
  };
}

function eff(
  plan: EffectiveSubscription["plan"],
  overrides: Partial<EffectiveSubscription> = {}
): EffectiveSubscription {
  return {
    plan,
    status: "ACTIVE",
    bypass: false,
    source: "subscription",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: getPlan(plan).entitlements,
    ...overrides,
  };
}

function usage(postsThisMonth: number) {
  return {
    postsThisMonth,
    monthStart: new Date("2026-09-01T00:00:00Z"),
    accountsByPlatform: {},
    totalAccounts: 0,
    scheduledPosts: 2,
    identityPostsUsed: null,
  };
}

describe("A. stale/out-of-order webhooks cannot regress state", () => {
  test("Growth→Scale→stale Growth keeps Scale (live confirms current)", async () => {
    const liveScale = snap({
      priceId: SCALE_PRICE,
      status: "active",
      currentPeriodEnd: FUTURE,
      eventCreated: T0 + 100,
    });
    const { stores, subs } = makeStores(
      [
        stored({
          plan: "SCALE",
          status: "ACTIVE",
          stripeSubId: "sub_1",
          lastStripeEventCreated: T0 + 100,
        }),
      ],
      { sub_1: liveScale }
    );
    const outcome = await processSubscriptionSnapshot(
      snap({ priceId: GROWTH_PRICE, eventCreated: T0 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.plan, "SCALE");
  });

  test("same subscription, different Event IDs: older period end is decided by live", async () => {
    const liveCurrent = snap({ currentPeriodEnd: FUTURE, eventCreated: T0 + 50 });
    const { stores, subs } = makeStores(
      [stored({ currentPeriodEnd: FUTURE, lastStripeEventCreated: T0 + 50 })],
      { sub_1: liveCurrent }
    );
    const outcome = await processSubscriptionSnapshot(
      snap({ currentPeriodEnd: new Date("2026-09-12T00:00:00Z"), eventCreated: T0 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.deepEqual(subs.get("user-1")?.currentPeriodEnd, FUTURE);
  });

  test("same-second tie restating the row applies as a harmless no-op", async () => {
    const { stores, subs, counters } = makeStores([
      stored({ plan: "GROWTH", lastStripeEventCreated: T0 }),
    ]);
    const outcome = await processSubscriptionSnapshot(
      snap({ priceId: GROWTH_PRICE, eventCreated: T0 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.plan, "GROWTH");
    assert.equal(subs.get("user-1")?.lastStripeEventCreated, T0);
    assert.equal(counters.upserts, 1);
  });

  test("same-second tie regressing state without live verification throws for redelivery", async () => {
    const { stores, subs } = makeStores([
      stored({ plan: "SCALE", lastStripeEventCreated: T0 }),
    ]);
    await assert.rejects(
      processSubscriptionSnapshot(
        snap({ priceId: GROWTH_PRICE, eventCreated: T0 }),
        stores
      ),
      /cannot order sub_1/
    );
    assert.equal(subs.get("user-1")?.plan, "SCALE");
  });

  test("same-second tie regressing state is resolved by the live object", async () => {
    const liveScale = snap({ priceId: SCALE_PRICE, eventCreated: T0 });
    const { stores, subs } = makeStores(
      [stored({ plan: "SCALE", lastStripeEventCreated: T0 })],
      { sub_1: liveScale }
    );
    const outcome = await processSubscriptionSnapshot(
      snap({ priceId: GROWTH_PRICE, eventCreated: T0 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.plan, "SCALE");
  });

  test("newer event still applies after an older restatement", async () => {
    const { stores, subs } = makeStores([
      stored({ plan: "GROWTH", lastStripeEventCreated: T0 }),
    ]);
    await processSubscriptionSnapshot(snap({ priceId: GROWTH_PRICE, eventCreated: T0 - 10 }), stores);
    const outcome = await processSubscriptionSnapshot(
      snap({ priceId: SCALE_PRICE, status: "active", eventCreated: T0 + 10 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.plan, "SCALE");
  });

  test("stale canceled event for the old subscription cannot kill the new purchase", async () => {
    const { stores, subs } = makeStores([
      stored({
        plan: "SCALE",
        status: "ACTIVE",
        stripeSubId: "sub_new",
        lastStripeEventCreated: T0 + 200,
      }),
    ]);
    const outcome = await processSubscriptionSnapshot(
      snap({
        subscriptionId: "sub_old",
        priceId: SCALE_PRICE,
        status: "canceled",
        eventCreated: T0,
      }),
      stores
    );
    assert.equal(outcome.outcome, "ignored");
    assert.equal(subs.get("user-1")?.status, "ACTIVE");
    assert.equal(subs.get("user-1")?.stripeSubId, "sub_new");
  });

  test("snapshot carries the Stripe event time", () => {
    assert.equal(snapshotSubscription({ id: "sub_1" }, 123)?.eventCreated, 123);
    assert.equal(snapshotSubscription({ id: "sub_1" })?.eventCreated, null);
  });
});

describe("B. unpaid has no paid access but stays distinct from canceled", () => {
  test("unpaid maps to UNPAID, not PAST_DUE", () => {
    assert.equal(mapSubscriptionStatus("unpaid"), "UNPAID");
    assert.equal(mapSubscriptionStatus("past_due"), "PAST_DUE");
  });

  test("UNPAID resolves to free entitlements with an UNPAID status", () => {
    const resolved = applyPeriodRules(
      { plan: "GROWTH", status: "UNPAID", cancelAtPeriodEnd: false, currentPeriodEnd: FUTURE },
      NOW
    );
    assert.deepEqual(resolved, { plan: "free", status: "UNPAID", expired: true });
    const effective = resolveEffectiveFromRows({
      subscription: {
        plan: "GROWTH",
        status: "UNPAID",
        currentPeriodEnd: FUTURE,
        cancelAtPeriodEnd: false,
        stripeCustomerId: "cus_1",
        stripeSubId: "sub_1",
      },
      testOverride: null,
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(effective.plan, "free");
    assert.equal(effective.status, "UNPAID");
    assert.equal(effective.entitlements.monthlyPosts, 15);
    assert.equal(canCreatePost(effective, usage(15)).ok, false);
  });

  test("webhook unpaid snapshot stores UNPAID without paid entitlements", async () => {
    const { stores, subs } = makeStores([stored()]);
    const outcome = await processSubscriptionSnapshot(
      snap({ status: "unpaid", eventCreated: T0 + 5 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "UNPAID");
  });
});

describe("C. invoice events are telemetry, never authoritative", () => {
  test("invoice success cannot reactivate a canceled subscription", async () => {
    const { stores, subs } = makeStores([stored({ status: "CANCELED", plan: "GROWTH" })]);
    const outcome = await processInvoiceSnapshot(
      { subscriptionId: "sub_1", customerId: "cus_1", succeeded: true },
      stores
    );
    assert.deepEqual(outcome, { outcome: "ignored", reason: "invoice-telemetry" });
    assert.equal(subs.get("user-1")?.status, "CANCELED");
  });

  test("invoice failure never writes PAST_DUE by itself", async () => {
    const { stores, subs } = makeStores([stored({ status: "ACTIVE" })]);
    const outcome = await processInvoiceSnapshot(
      { subscriptionId: "sub_1", customerId: "cus_1", succeeded: false },
      stores
    );
    assert.deepEqual(outcome, { outcome: "ignored", reason: "invoice-telemetry" });
    assert.equal(subs.get("user-1")?.status, "ACTIVE");
  });

  test("invoice events stay idempotent", async () => {
    const { stores, counters } = makeStores([stored()]);
    const invoice: InvoiceSnapshot = { subscriptionId: "sub_1", customerId: "cus_1", succeeded: true };
    const input = {
      eventId: "evt_invoice_1",
      type: "invoice.payment_succeeded",
      payload: { kind: "invoice" as const, invoice },
      stores,
    };
    assert.deepEqual(await processWebhookEvent(input), {
      outcome: "ignored",
      reason: "invoice-telemetry",
    });
    assert.deepEqual(await processWebhookEvent(input), { outcome: "duplicate" });
    assert.equal(counters.upserts, 0);
  });

  test("renewal and failure travel via subscription events", async () => {
    const { stores, subs } = makeStores([stored({ status: "PAST_DUE" })]);
    const renewed = await processSubscriptionSnapshot(
      snap({ status: "active", eventCreated: T0 + 5 }),
      stores
    );
    assert.deepEqual(renewed, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "ACTIVE");
    const failed = await processSubscriptionSnapshot(
      snap({ status: "past_due", eventCreated: T0 + 9 }),
      stores
    );
    assert.deepEqual(failed, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "PAST_DUE");
    assert.equal(subs.get("user-1")?.plan, "GROWTH");
  });
});

describe("E. user/customer/subscription consistency", () => {
  test("metadata for another user cannot hijack a stored subscription", async () => {
    const { stores, subs, counters } = makeStores([stored({ userId: "user-1" })]);
    const outcome = await processSubscriptionSnapshot(
      snap({ userId: "user-2", eventCreated: T0 + 5 }),
      stores
    );
    assert.equal(outcome.outcome, "ignored");
    assert.equal(subs.get("user-1")?.stripeSubId, "sub_1");
    assert.equal(subs.has("user-2"), false);
    assert.equal(counters.upserts, 0);
  });

  test("confused customer id is rejected without granting access", async () => {
    const { stores, counters } = makeStores([stored()]);
    const outcome = await processSubscriptionSnapshot(
      snap({ customerId: "cus_evil", eventCreated: T0 + 5 }),
      stores
    );
    assert.equal(outcome.outcome, "ignored");
    assert.equal(counters.upserts, 0);
  });

  test("canceled then new purchase replaces the subscription id", async () => {
    const { stores, subs } = makeStores([
      stored({ status: "CANCELED", plan: "GROWTH", stripeSubId: "sub_old", lastStripeEventCreated: T0 }),
    ]);
    const outcome = await processSubscriptionSnapshot(
      snap({
        subscriptionId: "sub_new",
        priceId: SCALE_PRICE,
        status: "active",
        eventCreated: T0 + 100,
      }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.stripeSubId, "sub_new");
    assert.equal(subs.get("user-1")?.plan, "SCALE");
    assert.equal(subs.get("user-1")?.status, "ACTIVE");
  });

  test("live Stripe object confirms a genuine replacement on mismatch", async () => {
    const liveNew = snap({
      subscriptionId: "sub_new",
      priceId: SCALE_PRICE,
      status: "active",
      eventCreated: T0 + 100,
    });
    const { stores, subs } = makeStores(
      [stored({ status: "CANCELED", stripeSubId: "sub_old", lastStripeEventCreated: T0 })],
      { sub_new: liveNew }
    );
    const outcome = await processSubscriptionSnapshot(
      snap({
        subscriptionId: "sub_new",
        priceId: SCALE_PRICE,
        status: "active",
        eventCreated: T0 + 100,
      }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.stripeSubId, "sub_new");
  });

  test("incomplete and paused never write", async () => {
    const { stores, counters } = makeStores();
    for (const status of ["incomplete", "paused", ""]) {
      const outcome = await processSubscriptionSnapshot(snap({ status }), stores);
      assert.deepEqual(outcome, { outcome: "ignored", reason: "unhandled-status" });
    }
    assert.equal(counters.upserts, 0);
  });

  test("incomplete_expired ends access", async () => {
    const { stores, subs } = makeStores([stored()]);
    const outcome = await processSubscriptionSnapshot(
      snap({ status: "incomplete_expired", eventCreated: T0 + 5 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "CANCELED");
  });
});

describe("F. cancellation keeps access until period end, then expires", () => {
  test("cancel_at_period_end with a future end stays CANCELLING on the paid plan", async () => {
    const { stores, subs } = makeStores([stored()]);
    const outcome = await processSubscriptionSnapshot(
      snap({ cancelAtPeriodEnd: true, eventCreated: T0 + 5 }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    const row = subs.get("user-1");
    assert.equal(row?.cancelAtPeriodEnd, true);
    const effective = resolveEffectiveFromRows({
      subscription: {
        plan: row?.plan ?? "GROWTH",
        status: row?.status ?? "ACTIVE",
        currentPeriodEnd: row?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
        stripeCustomerId: row?.stripeCustomerId ?? null,
        stripeSubId: row?.stripeSubId ?? null,
      },
      testOverride: null,
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(effective.status, "CANCELLING");
    assert.equal(effective.plan, "growth");
    assert.deepEqual(canCreatePost(effective, usage(100)), { ok: true });
  });

  test("past period end with cancel_at_period_end expires to Free", () => {
    const resolved = applyPeriodRules(
      {
        plan: "GROWTH",
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: PAST,
      },
      NOW
    );
    assert.deepEqual(resolved, { plan: "free", status: "EXPIRED", expired: true });
  });

  test("cancel_at_period_end without any period end fails closed", () => {
    const resolved = applyPeriodRules(
      { plan: "SCALE", status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: null },
      NOW
    );
    assert.deepEqual(resolved, { plan: "free", status: "EXPIRED", expired: true });
  });
});

function makeCheckoutDeps(
  overrides: {
    subscription?: {
      plan: "free" | "growth" | "scale";
      status: string;
      stripeCustomerId: string | null;
      stripeSubId: string | null;
      currentPeriodEnd?: Date | null;
      cancelAtPeriodEnd?: boolean;
    } | null;
    liveSubs?: { id: string; status: string }[];
  } = {}
) {
  const calls = { customers: 0, links: 0, sessions: 0, expired: 0, listed: 0 };
  const deps: CheckoutDeps = {
    configured: true,
    prices: { growth: GROWTH_PRICE, scale: SCALE_PRICE },
    findSubscription: async () => {
      const sub = overrides.subscription ?? null;
      if (!sub) return null;
      return {
        ...sub,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
      };
    },
    linkCustomer: async () => {
      calls.links += 1;
    },
    createCustomer: async () => {
      calls.customers += 1;
      return { id: "cus_new" };
    },
    createSession: async () => {
      calls.sessions += 1;
      return { url: "https://checkout.stripe.com/c/pay_123" };
    },
    listSubscriptionsByCustomer: async () => {
      calls.listed += 1;
      return overrides.liveSubs ?? [];
    },
    expireOpenSessions: async () => {
      calls.expired += 1;
    },
    withLock: async (_userId, fn) => fn(),
  };
  return { deps, calls };
}

function checkoutUser(id = "user-1") {
  return { id, name: "Test User", email: "user@example.com", emailVerified: true };
}

describe("D. double checkout is blocked server-side", () => {
  test("PAST_DUE, UNPAID and CANCELLING subscriptions go to the portal", async () => {
    for (const status of ["PAST_DUE", "UNPAID", "ACTIVE"]) {
      const { deps, calls } = makeCheckoutDeps({
        subscription: {
          plan: "growth",
          status,
          stripeCustomerId: "cus_1",
          stripeSubId: "sub_1",
        },
      });
      const res = await handleCheckout({
        user: checkoutUser(),
        plan: "scale",
        origin: "https://postvia.online",
        deps,
      });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, "USE_PORTAL");
      assert.equal(calls.sessions, 0);
    }
  });

  test("live Stripe subscription blocks a second checkout before the webhook lands", async () => {
    const { deps, calls } = makeCheckoutDeps({
      subscription: {
        plan: "free",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubId: null,
      },
      liveSubs: [{ id: "sub_pending", status: "active" }],
    });
    const res = await handleCheckout({
      user: checkoutUser(),
      plan: "growth",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "USE_PORTAL");
    assert.equal(calls.sessions, 0);
    assert.equal(calls.listed, 1);
  });

  test("pending checkout (customer, no subscription) expires stale sessions and continues", async () => {
    const { deps, calls } = makeCheckoutDeps({
      subscription: {
        plan: "free",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubId: null,
      },
      liveSubs: [],
    });
    const res = await handleCheckout({
      user: checkoutUser(),
      plan: "growth",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.customers, 0);
    assert.equal(calls.sessions, 1);
    assert.equal(calls.expired, 1);
  });

  test("concurrent double checkout converges on one linked customer", async () => {
    let linked: string | null = null;
    let customers = 0;
    const sessions: string[] = [];
    const order: string[] = [];
    // Mutex-shaped lock like the production advisory lock: each short
    // phase serializes, while Stripe work between phases runs
    // concurrently. Both flows must converge on the first linked row —
    // a loser adopts the winner instead of stacking a second link, so
    // both sessions target the same customer and both callers get 200.
    let tail: Promise<void> = Promise.resolve();
    const deps: CheckoutDeps = {
      ...makeCheckoutDeps().deps,
      findSubscription: async () =>
        linked
          ? {
              plan: "free",
              status: "ACTIVE",
              stripeCustomerId: linked,
              stripeSubId: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
            }
          : null,
      createCustomer: async () => {
        customers += 1;
        return { id: `cus_new_${customers}` };
      },
      createSession: async (input) => {
        sessions.push(input.customerId);
        return { url: "https://checkout.stripe.com/c/pay_123" };
      },
      linkCustomer: async (_userId, customerId) => {
        linked = customerId;
      },
      withLock: async (_userId, fn) => {
        const prev = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await prev;
        order.push("enter");
        try {
          return await fn();
        } finally {
          order.push("exit");
          release();
        }
      },
    };
    const input = {
      user: checkoutUser(),
      plan: "growth" as const,
      origin: "https://postvia.online",
      deps,
    };
    const [first, second] = await Promise.all([handleCheckout(input), handleCheckout(input)]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    // Two short phases per flow, each serialized: balanced enter/exit pairs.
    assert.equal(
      order.filter((entry) => entry === "enter").length,
      order.filter((entry) => entry === "exit").length
    );
    assert.equal(order.length, 8);
    // Exactly one linked row wins; every session targets it. Extra fresh
    // Stripe customers are empty benign orphans (no card, no subscription).
    assert.ok(linked !== null);
    assert.ok(sessions.length >= 1);
    assert.ok(sessions.every((customerId) => customerId === linked));
    assert.ok(customers <= 2);
  });

  test("expired and canceled rows may start a fresh checkout", async () => {
    for (const subscription of [
      {
        plan: "growth" as const,
        status: "CANCELED",
        stripeCustomerId: "cus_1",
        stripeSubId: "sub_old",
      },
      {
        plan: "growth" as const,
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubId: "sub_old",
        currentPeriodEnd: PAST,
        cancelAtPeriodEnd: true,
      },
    ]) {
      const { deps, calls } = makeCheckoutDeps({ subscription, liveSubs: [] });
      const res = await handleCheckout({
        user: checkoutUser(),
        plan: "scale",
        origin: "https://postvia.online",
        deps,
      });
      assert.equal(res.status, 200);
      assert.equal(calls.sessions, 1);
      assert.equal(calls.customers, 0);
    }
  });

  test("LIVE_STRIPE_SUBSCRIPTION_STATUSES covers pending and delinquent states", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete"]) {
      assert.ok(LIVE_STRIPE_SUBSCRIPTION_STATUSES.includes(status), status);
    }
  });

  test("hasLivePaidStake matches portal routing", () => {
    const base = {
      plan: "growth" as const,
      status: "ACTIVE",
      stripeCustomerId: "cus_1",
      stripeSubId: "sub_1",
      currentPeriodEnd: FUTURE,
      cancelAtPeriodEnd: false,
    };
    assert.equal(hasLivePaidStake(base, NOW), true);
    assert.equal(hasLivePaidStake({ ...base, status: "CANCELED" }, NOW), false);
    assert.equal(
      hasLivePaidStake({ ...base, cancelAtPeriodEnd: true, currentPeriodEnd: PAST }, NOW),
      false
    );
    assert.equal(
      hasLivePaidStake({
        plan: "free",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }, NOW),
      false
    );
  });
});

describe("H+I. reconciliation and pending checkout", () => {
  test("reconcile applies the live newer state through the guards", async () => {
    const liveScale = snap({
      priceId: SCALE_PRICE,
      status: "active",
      eventCreated: T0 + 100,
    });
    const { stores, subs } = makeStores(
      [stored({ plan: "GROWTH", lastStripeEventCreated: T0 })],
      { sub_1: liveScale }
    );
    const outcome = await reconcileSubscriptionFromStripe({
      userId: "user-1",
      stores,
    });
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.plan, "SCALE");
  });

  test("reconcile skips without a bound Stripe subscription", async () => {
    const { stores } = makeStores([
      stored({ stripeSubId: null, stripeCustomerId: "cus_1" }),
    ]);
    const outcome = await reconcileSubscriptionFromStripe({
      userId: "user-1",
      stores,
    });
    assert.deepEqual(outcome, { outcome: "skipped", reason: "no-stripe-sub" });
  });

  test("reconcile drops a live object with an unknown price", async () => {
    const { stores, subs, counters } = makeStores(
      [stored({ plan: "SCALE", lastStripeEventCreated: T0 + 100 })],
      {
        sub_1: snap({
          priceId: "price_unknown",
          status: "active",
          eventCreated: T0 + 200,
        }),
      }
    );
    const outcome = await reconcileSubscriptionFromStripe({
      userId: "user-1",
      stores,
      nowSec: T0 + 200,
    });
    assert.deepEqual(outcome, { outcome: "ignored", reason: "unknown-price" });
    assert.equal(subs.get("user-1")?.plan, "SCALE");
    assert.equal(counters.upserts, 0);
  });

  test("reconcile drops a live object bound to another user", async () => {
    const { stores, subs, counters } = makeStores(
      [stored({ plan: "SCALE", lastStripeEventCreated: T0 + 100 })],
      {
        sub_1: snap({
          priceId: SCALE_PRICE,
          status: "active",
          userId: "user-2",
          eventCreated: T0 + 200,
        }),
      }
    );
    const outcome = await reconcileSubscriptionFromStripe({
      userId: "user-1",
      stores,
      nowSec: T0 + 200,
    });
    assert.equal(outcome.outcome, "ignored");
    assert.equal(subs.get("user-1")?.plan, "SCALE");
    assert.equal(counters.upserts, 0);
  });

  test("checkout pending only for recent customer-without-subscription rows", () => {
    const row = {
      plan: "FREE" as const,
      status: "ACTIVE" as const,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: "cus_1",
      stripeSubId: null,
      updatedAt: new Date(NOW),
    };
    assert.equal(isCheckoutPending(row, NOW + 60_000), true);
    assert.equal(isCheckoutPending(row, NOW + 25 * 3_600_000), false);
    assert.equal(
      isCheckoutPending({ ...row, plan: "GROWTH", stripeSubId: "sub_1" }, NOW),
      false
    );
    assert.equal(isCheckoutPending(null, NOW), false);
  });

  test("account-delete cancel helper never throws", async () => {
    assert.deepEqual(
      await cancelStripeSubscriptionNow({
        stripeSubId: "sub_1",
        cancel: async () => ({ id: "sub_1" }),
      }),
      { outcome: "canceled" }
    );
    const failed = await cancelStripeSubscriptionNow({
      stripeSubId: "sub_1",
      cancel: async () => {
        throw new Error("stripe down");
      },
    });
    assert.equal(failed.outcome, "failed");
    assert.ok(failed.error instanceof Error);
  });

  test("cancel tolerates an already-terminal subscription, fails closed otherwise", async () => {
    const bomb = async () => {
      throw new Error("already canceled");
    };
    assert.deepEqual(
      await cancelStripeSubscriptionNow({
        stripeSubId: "sub_1",
        cancel: bomb,
        getStatus: async () => "canceled",
      }),
      { outcome: "canceled" }
    );
    assert.deepEqual(
      await cancelStripeSubscriptionNow({
        stripeSubId: "sub_1",
        cancel: bomb,
        getStatus: async () => null,
      }),
      { outcome: "canceled" }
    );
    const stillLive = await cancelStripeSubscriptionNow({
      stripeSubId: "sub_1",
      cancel: bomb,
      getStatus: async () => "active",
    });
    assert.equal(stillLive.outcome, "failed");
    const unknown = await cancelStripeSubscriptionNow({
      stripeSubId: "sub_1",
      cancel: bomb,
      getStatus: async () => {
        throw new Error("stripe down");
      },
    });
    assert.equal(unknown.outcome, "failed");
  });
});

describe("quota: Growth 300, upgrade, downgrade, races", () => {
  test("299/300 allowed, 300/300 denied", () => {
    assert.deepEqual(canCreatePost(eff("growth"), usage(299)), { ok: true });
    assert.equal(canCreatePost(eff("growth"), usage(300)).ok, false);
  });

  test("concurrent claims on the last Growth slot grant one winner", async () => {
    let count = 299;
    const store: QuotaClaimStore = {
      findUsage: async () => ({ id: "row-1", count }),
      createUsage: async () => ({ id: "row-1", count }),
      incrementIfBelowLimit: async (_id, limit) => {
        if (count >= limit) return false;
        count += 1;
        return true;
      },
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        claimMonthlyQuota({ userId: "u1", period: "2026-09", limit: 300, liveCount: 299, store })
      )
    );
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(count, 300);
  });

  test("Growth→Scale after quota exhaustion grants unlimited without touching history", () => {
    assert.equal(canCreatePost(eff("scale"), usage(10_000)).ok, true);
    assert.equal(getRemainingQuota(eff("scale"), usage(300)).postsLeft, null);
  });

  test("Scale→Growth with usage above 300 keeps data, blocks new creations", () => {
    const denied = canCreatePost(eff("growth"), usage(450));
    assert.equal(denied.ok, false);
    assert.equal(getRemainingQuota(eff("growth"), usage(450)).postsLeft, 0);
  });

  test("scheduled posts are counted in usage, never auto-deleted by plan logic", () => {
    const u = usage(300);
    assert.equal(u.scheduledPosts, 2);
    assert.equal(canCreatePost(eff("growth"), u).ok, false);
    assert.deepEqual(canCreatePost(eff("scale"), u), { ok: true });
  });
});
