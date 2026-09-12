import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getStripePrices,
  isStripeConfigured,
  mapSubscriptionStatus,
  priceIdToPlanId,
  processInvoiceSnapshot,
  processSubscriptionSnapshot,
  processWebhookEvent,
  snapshotInvoice,
  snapshotSubscription,
  STRIPE_PRICE_GROWTH_DEFAULT,
  STRIPE_PRICE_SCALE_DEFAULT,
  type BillingSubscriptionStore,
  type InvoiceSnapshot,
  type SubscriptionSnapshot,
  type SubscriptionWrite,
  type WebhookEventStore,
} from "../src/lib/stripe";
import { isStripeRedirectUrl } from "../src/lib/stripe-redirect";
import type { PlanId } from "../src/lib/plans";
import {
  handleCheckout,
  type CheckoutDeps,
} from "../src/app/api/billing/checkout/route";
import {
  handlePortal,
  type PortalDeps,
} from "../src/app/api/billing/portal/route";

const GROWTH_PRICE = "price_1UEyqHRKEM3xporCj250GMR3";
const SCALE_PRICE = "price_1UEyqeRKEM3xporCZv7dEUEc";

const savedEnv: Record<string, string | undefined> = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_GROWTH: process.env.STRIPE_PRICE_GROWTH,
  STRIPE_PRICE_SCALE: process.env.STRIPE_PRICE_SCALE,
};

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function user(id = "user-1", email = "user@example.com") {
  return { id, name: "Test User", email, emailVerified: true };
}

describe("stripe price config", () => {
  test("defaults match the production price ids", () => {
    delete process.env.STRIPE_PRICE_GROWTH;
    delete process.env.STRIPE_PRICE_SCALE;
    assert.equal(STRIPE_PRICE_GROWTH_DEFAULT, GROWTH_PRICE);
    assert.equal(STRIPE_PRICE_SCALE_DEFAULT, SCALE_PRICE);
    assert.deepEqual(getStripePrices(), {
      growth: GROWTH_PRICE,
      scale: SCALE_PRICE,
    });
  });
  test("env overrides the defaults", () => {
    process.env.STRIPE_PRICE_GROWTH = "price_custom_growth";
    assert.equal(getStripePrices().growth, "price_custom_growth");
    assert.equal(getStripePrices().scale, SCALE_PRICE);
  });
  test("price ids map to paid plans, unknown prices grant nothing", () => {
    const prices = { growth: GROWTH_PRICE, scale: SCALE_PRICE };
    assert.equal(priceIdToPlanId(GROWTH_PRICE, prices), "growth");
    assert.equal(priceIdToPlanId(SCALE_PRICE, prices), "scale");
    assert.equal(priceIdToPlanId("price_unknown", prices), null);
    assert.equal(priceIdToPlanId(null, prices), null);
    assert.equal(priceIdToPlanId(undefined, prices), null);
  });
  test("configured flag follows the secret key", () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(isStripeConfigured(), false);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    assert.equal(isStripeConfigured(), true);
  });
});

describe("subscription status mapping", () => {
  test("active and trialing stay active", () => {
    assert.equal(mapSubscriptionStatus("active"), "ACTIVE");
    assert.equal(mapSubscriptionStatus("trialing"), "ACTIVE");
  });
  test("past_due and unpaid flag the plan", () => {
    assert.equal(mapSubscriptionStatus("past_due"), "PAST_DUE");
    assert.equal(mapSubscriptionStatus("unpaid"), "PAST_DUE");
  });
  test("canceled and incomplete_expired end access", () => {
    assert.equal(mapSubscriptionStatus("canceled"), "CANCELED");
    assert.equal(mapSubscriptionStatus("incomplete_expired"), "CANCELED");
  });
  test("non-terminal states are ignored, never written", () => {
    assert.equal(mapSubscriptionStatus("incomplete"), null);
    assert.equal(mapSubscriptionStatus("paused"), null);
    assert.equal(mapSubscriptionStatus(""), null);
  });
});

describe("stripe redirect url policy", () => {
  test("accepts checkout and portal hosts over https", () => {
    assert.equal(
      isStripeRedirectUrl("https://checkout.stripe.com/c/pay_123"),
      true
    );
    assert.equal(
      isStripeRedirectUrl("https://billing.stripe.com/p/session_123"),
      true
    );
  });
  test("rejects lookalikes, userinfo, ports and http", () => {
    assert.equal(isStripeRedirectUrl("http://checkout.stripe.com/c/x"), false);
    assert.equal(
      isStripeRedirectUrl("https://checkout.stripe.com.evil.test/c/x"),
      false
    );
    assert.equal(
      isStripeRedirectUrl("https://evilcheckout.stripe.com/c/x"),
      false
    );
    assert.equal(
      isStripeRedirectUrl("https://checkout.stripe.com@evil.test/"),
      false
    );
    assert.equal(
      isStripeRedirectUrl("https://checkout.stripe.com:8443/c/x"),
      false
    );
    assert.equal(
      isStripeRedirectUrl("https://example.com/billing"),
      false
    );
    assert.equal(isStripeRedirectUrl("/billing"), false);
    assert.equal(isStripeRedirectUrl(""), false);
    assert.equal(isStripeRedirectUrl(null), false);
    assert.equal(isStripeRedirectUrl(undefined), false);
  });
});

type CheckoutCalls = {
  customers: { email: string; userId: string }[];
  links: { userId: string; customerId: string }[];
  sessions: {
    customerId: string;
    priceId: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }[];
};

function makeCheckoutDeps(
  overrides: {
    subscription?:
      | {
          plan: PlanId;
          status: string;
          stripeCustomerId: string | null;
          stripeSubId: string | null;
        }
      | null;
    sessionUrl?: string;
  } = {}
): { deps: CheckoutDeps; calls: CheckoutCalls } {
  const calls: CheckoutCalls = { customers: [], links: [], sessions: [] };
  const deps: CheckoutDeps = {
    configured: true,
    prices: { growth: GROWTH_PRICE, scale: SCALE_PRICE },
    findSubscription: async () => overrides.subscription ?? null,
    linkCustomer: async (userId, customerId) => {
      calls.links.push({ userId, customerId });
    },
    createCustomer: async ({ email, userId }) => {
      calls.customers.push({ email, userId });
      return { id: "cus_test_123" };
    },
    createSession: async (input) => {
      calls.sessions.push(input);
      return { url: overrides.sessionUrl ?? "https://checkout.stripe.com/c/pay_123" };
    },
  };
  return { deps, calls };
}

describe("POST /api/billing/checkout", () => {
  test("unauthenticated caller gets 401", async () => {
    const { deps } = makeCheckoutDeps();
    const res = await handleCheckout({
      user: null,
      plan: "growth",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 401);
  });
  test("unconfigured billing gets 503", async () => {
    const { deps } = makeCheckoutDeps();
    deps.configured = false;
    const res = await handleCheckout({
      user: user(),
      plan: "growth",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 503);
  });
  test("free and unknown plans are rejected", async () => {
    const { deps, calls } = makeCheckoutDeps();
    for (const plan of ["free", "starter", null]) {
      const res = await handleCheckout({
        user: user(),
        plan,
        origin: "https://postvia.online",
        deps,
      });
      assert.equal(res.status, 400);
    }
    assert.deepEqual(calls.sessions, []);
  });
  test("forged origins are rejected", async () => {
    const { deps } = makeCheckoutDeps();
    for (const origin of ["not a url", "ftp://files.example", ""]) {
      const res = await handleCheckout({
        user: user(),
        plan: "growth",
        origin,
        deps,
      });
      assert.equal(res.status, 400);
    }
  });
  test("active subscribers are sent to the portal, not a second checkout", async () => {
    const { deps, calls } = makeCheckoutDeps({
      subscription: {
        plan: "growth",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubId: "sub_1",
      },
    });
    const res = await handleCheckout({
      user: user(),
      plan: "scale",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code?: unknown };
    assert.equal(body.code, "USE_PORTAL");
    assert.deepEqual(calls.sessions, []);
  });
  test("new customer is created, linked and checked out with user metadata", async () => {
    const { deps, calls } = makeCheckoutDeps();
    const res = await handleCheckout({
      user: user("user-9", "buyer@example.com"),
      plan: "growth",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls.customers, [
      { email: "buyer@example.com", userId: "user-9" },
    ]);
    assert.deepEqual(calls.links, [
      { userId: "user-9", customerId: "cus_test_123" },
    ]);
    assert.equal(calls.sessions.length, 1);
    assert.equal(calls.sessions[0]?.priceId, GROWTH_PRICE);
    assert.equal(calls.sessions[0]?.userId, "user-9");
    assert.match(calls.sessions[0]?.successUrl ?? "", /billing\?checkout=success/);
    const body = (await res.json()) as { url?: unknown };
    assert.equal(body.url, "https://checkout.stripe.com/c/pay_123");
  });
  test("existing customer reuses its id without relinking", async () => {
    const { deps, calls } = makeCheckoutDeps({
      subscription: {
        plan: "free",
        status: "ACTIVE",
        stripeCustomerId: "cus_existing",
        stripeSubId: null,
      },
    });
    const res = await handleCheckout({
      user: user(),
      plan: "scale",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls.customers, []);
    assert.deepEqual(calls.links, []);
    assert.equal(calls.sessions[0]?.customerId, "cus_existing");
    assert.equal(calls.sessions[0]?.priceId, SCALE_PRICE);
  });
  test("untrusted provider url becomes 502, never a redirect", async () => {
    const { deps } = makeCheckoutDeps({
      sessionUrl: "https://evil.test/checkout",
    });
    const res = await handleCheckout({
      user: user(),
      plan: "growth",
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 502);
  });
});

function makePortalDeps(
  overrides: Partial<{
    customerId: string | null;
    sessionUrl: string | null;
  }> = {}
): { deps: PortalDeps; calls: { sessions: { customerId: string; returnUrl: string }[] } } {
  const calls: { sessions: { customerId: string; returnUrl: string }[] } = {
    sessions: [],
  };
  const deps: PortalDeps = {
    configured: true,
    findCustomerId: async () =>
      overrides.customerId === undefined ? "cus_test_123" : overrides.customerId,
    createPortalSession: async (customerId, returnUrl) => {
      calls.sessions.push({ customerId, returnUrl });
      return {
        url: overrides.sessionUrl ?? "https://billing.stripe.com/p/session_123",
      };
    },
  };
  return { deps, calls };
}

describe("POST /api/billing/portal", () => {
  test("unauthenticated caller gets 401", async () => {
    const { deps } = makePortalDeps();
    const res = await handlePortal({
      user: null,
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 401);
  });
  test("unconfigured billing gets 503", async () => {
    const { deps } = makePortalDeps();
    deps.configured = false;
    const res = await handlePortal({
      user: user(),
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 503);
  });
  test("user without a customer cannot open the portal", async () => {
    const { deps, calls } = makePortalDeps({ customerId: null });
    const res = await handlePortal({
      user: user(),
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(calls.sessions, []);
  });
  test("portal returns a validated session url", async () => {
    const { deps, calls } = makePortalDeps();
    const res = await handlePortal({
      user: user("user-7"),
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.sessions[0]?.returnUrl, "https://postvia.online/billing");
    const body = (await res.json()) as { url?: unknown };
    assert.equal(body.url, "https://billing.stripe.com/p/session_123");
  });
  test("untrusted provider url becomes 502", async () => {
    const { deps } = makePortalDeps({ sessionUrl: "https://evil.test/p/x" });
    const res = await handlePortal({
      user: user(),
      origin: "https://postvia.online",
      deps,
    });
    assert.equal(res.status, 502);
  });
});

type SubRow = {
  userId: string;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

function makeStores(initial: SubRow[] = []) {
  const subs = new Map<string, SubRow>(initial.map((row) => [row.userId, row]));
  const events = new Map<string, string>();
  const counters = { upserts: 0, statusWrites: 0 };
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
      });
    },
    setStatusByStripeSubId: async (stripeSubId, status) => {
      for (const row of subs.values()) {
        if (row.stripeSubId === stripeSubId) {
          counters.statusWrites += 1;
          row.status = status;
          return row.userId;
        }
      }
      return null;
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
  return {
    stores: { ...subStore, ...eventStore },
    subs,
    events,
    counters,
  };
}

function subSnapshot(
  overrides: Partial<SubscriptionSnapshot> = {}
): SubscriptionSnapshot {
  return {
    subscriptionId: "sub_test_1",
    customerId: "cus_test_1",
    priceId: GROWTH_PRICE,
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-10-12T00:00:00Z"),
    userId: "user-1",
    ...overrides,
  };
}

function invoiceSnapshot(
  overrides: Partial<InvoiceSnapshot> = {}
): InvoiceSnapshot {
  return {
    subscriptionId: "sub_test_1",
    customerId: "cus_test_1",
    succeeded: false,
    ...overrides,
  };
}

describe("webhook payload snapshots", () => {
  test("subscription snapshot reads the modern item-level period end", () => {
    const snapshot = snapshotSubscription({
      id: "sub_1",
      customer: { id: "cus_1" },
      status: "active",
      cancel_at_period_end: true,
      metadata: { userId: "user-1" },
      items: {
        data: [
          { price: { id: GROWTH_PRICE }, current_period_end: 1791763200 },
        ],
      },
    });
    assert.deepEqual(snapshot, {
      subscriptionId: "sub_1",
      customerId: "cus_1",
      priceId: GROWTH_PRICE,
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1791763200 * 1000),
      userId: "user-1",
    });
  });
  test("subscription snapshot falls back to the legacy period end", () => {
    const snapshot = snapshotSubscription({
      id: "sub_1",
      customer: "cus_1",
      status: "past_due",
      current_period_end: 1791763200,
      metadata: {},
      items: { data: [{ price: SCALE_PRICE }] },
    });
    assert.equal(snapshot?.priceId, SCALE_PRICE);
    assert.equal(snapshot?.userId, null);
    assert.deepEqual(snapshot?.currentPeriodEnd, new Date(1791763200 * 1000));
  });
  test("subscription snapshot rejects garbage", () => {
    assert.equal(snapshotSubscription(null), null);
    assert.equal(snapshotSubscription({}), null);
    assert.equal(snapshotSubscription("sub_1"), null);
  });
  test("invoice snapshot reads nested and legacy subscription ids", () => {
    assert.deepEqual(
      snapshotInvoice(
        {
          customer: "cus_1",
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_9" },
          },
        },
        false
      ),
      { subscriptionId: "sub_9", customerId: "cus_1", succeeded: false }
    );
    assert.deepEqual(
      snapshotInvoice(
        { customer: { id: "cus_2" }, subscription: "sub_8" },
        true
      ),
      { subscriptionId: "sub_8", customerId: "cus_2", succeeded: true }
    );
    assert.deepEqual(snapshotInvoice({}, false), {
      subscriptionId: null,
      customerId: null,
      succeeded: false,
    });
  });
});

describe("webhook subscription events", () => {
  test("created subscription writes the paid plan", async () => {
    const { stores, subs } = makeStores();
    const outcome = await processSubscriptionSnapshot(subSnapshot(), stores);
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.deepEqual(subs.get("user-1"), {
      userId: "user-1",
      plan: "GROWTH",
      status: "ACTIVE",
      stripeCustomerId: "cus_test_1",
      stripeSubId: "sub_test_1",
      currentPeriodEnd: new Date("2026-10-12T00:00:00Z"),
      cancelAtPeriodEnd: false,
    });
  });
  test("unknown price never grants access and writes nothing", async () => {
    const { stores, subs, counters } = makeStores();
    const outcome = await processSubscriptionSnapshot(
      subSnapshot({ priceId: "price_unknown" }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "ignored", reason: "unknown-price" });
    assert.equal(counters.upserts, 0);
    assert.equal(subs.size, 0);
  });
  test("non-terminal status writes nothing", async () => {
    const { stores, counters } = makeStores();
    const outcome = await processSubscriptionSnapshot(
      subSnapshot({ status: "incomplete" }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "ignored", reason: "unhandled-status" });
    assert.equal(counters.upserts, 0);
  });
  test("canceled subscription ends access", async () => {
    const { stores, subs } = makeStores();
    const outcome = await processSubscriptionSnapshot(
      subSnapshot({ status: "canceled" }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "CANCELED");
  });
  test("user resolves via stored stripe ids when metadata is missing", async () => {
    const { stores } = makeStores([
      {
        userId: "user-9",
        plan: "FREE",
        status: "ACTIVE",
        stripeCustomerId: "cus_test_1",
        stripeSubId: "sub_test_1",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    ]);
    const outcome = await processSubscriptionSnapshot(
      subSnapshot({ userId: null }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-9" });
  });
  test("unresolvable subscription writes nothing", async () => {
    const { stores, counters } = makeStores();
    const outcome = await processSubscriptionSnapshot(
      subSnapshot({ userId: null, customerId: null }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "unresolvable", reason: "unknown-user" });
    assert.equal(counters.upserts, 0);
  });
});

describe("webhook invoice events", () => {
  test("payment failure flags past due", async () => {
    const { stores, subs } = makeStores([
      {
        userId: "user-1",
        plan: "GROWTH",
        status: "ACTIVE",
        stripeCustomerId: "cus_test_1",
        stripeSubId: "sub_test_1",
        currentPeriodEnd: new Date("2026-10-12T00:00:00Z"),
        cancelAtPeriodEnd: false,
      },
    ]);
    const outcome = await processInvoiceSnapshot(
      invoiceSnapshot({ succeeded: false }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "PAST_DUE");
    assert.equal(subs.get("user-1")?.plan, "GROWTH");
  });
  test("payment success restores active", async () => {
    const { stores, subs } = makeStores([
      {
        userId: "user-1",
        plan: "SCALE",
        status: "PAST_DUE",
        stripeCustomerId: "cus_test_1",
        stripeSubId: "sub_test_1",
        currentPeriodEnd: new Date("2026-10-12T00:00:00Z"),
        cancelAtPeriodEnd: false,
      },
    ]);
    const outcome = await processInvoiceSnapshot(
      invoiceSnapshot({ succeeded: true }),
      stores
    );
    assert.deepEqual(outcome, { outcome: "applied", userId: "user-1" });
    assert.equal(subs.get("user-1")?.status, "ACTIVE");
  });
  test("invoice for an unknown subscription writes nothing", async () => {
    const { stores, counters } = makeStores();
    const outcome = await processInvoiceSnapshot(
      invoiceSnapshot({ subscriptionId: "sub_ghost" }),
      stores
    );
    assert.deepEqual(outcome, {
      outcome: "unresolvable",
      reason: "unknown-subscription",
    });
    assert.equal(counters.statusWrites, 0);
  });
});

describe("webhook idempotency", () => {
  test("duplicate delivery is acknowledged without re-applying", async () => {
    const { stores, counters } = makeStores();
    const input = {
      eventId: "evt_123",
      type: "customer.subscription.created",
      payload: {
        kind: "subscription" as const,
        snapshot: subSnapshot(),
      },
      stores,
    };
    assert.deepEqual(await processWebhookEvent(input), {
      outcome: "applied",
      userId: "user-1",
    });
    assert.deepEqual(await processWebhookEvent(input), {
      outcome: "duplicate",
    });
    assert.equal(counters.upserts, 1);
  });
  test("unhandled types are recorded once, then seen as duplicates", async () => {
    const { stores, events } = makeStores();
    const input = {
      eventId: "evt_unknown",
      type: "coupon.created",
      payload: null,
      stores,
    };
    assert.deepEqual(await processWebhookEvent(input), {
      outcome: "ignored",
      reason: "unhandled-type",
    });
    assert.equal(events.get("evt_unknown"), "coupon.created");
    assert.deepEqual(await processWebhookEvent(input), {
      outcome: "duplicate",
    });
  });
});
