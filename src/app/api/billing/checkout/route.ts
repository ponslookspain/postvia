import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, type AuthUser } from "@/lib/auth";
import {
  getStripeClient,
  hasLivePaidStake,
  isLiveStripeSubscriptionStatus,
  isStripeRedirectUrl,
  resolveStripeConfig,
  type ExistingSubscription,
  type StripePrices,
} from "@/lib/stripe";
import { toPlanId, type DbPlan } from "@/lib/entitlements";
import { gateWriteRequest, WRITE_LIMIT_CHECKOUT } from "@/lib/abuse";
import type { PlanId } from "@/lib/plans";
import { reportError } from "@/lib/diagnostics";

export type { ExistingSubscription };

export type CheckoutDeps = {
  configured: boolean;
  /** Null when the environment cannot start checkouts (test key, no prices). */
  prices: StripePrices | null;
  findSubscription: (userId: string) => Promise<ExistingSubscription | null>;
  /** Persists the Stripe customer id without touching plan or status. */
  linkCustomer: (userId: string, customerId: string) => Promise<void>;
  createCustomer: (input: {
    email: string;
    userId: string;
  }) => Promise<{ id: string }>;
  createSession: (input: {
    customerId: string;
    priceId: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }) => Promise<{ url: string | null }>;
  /**
   * Live Stripe subscriptions for the customer (authoritative when the
   * webhook has not landed yet). A live stake routes to the portal.
   */
  listSubscriptionsByCustomer: (
    customerId: string
  ) => Promise<{ id: string; status: string }[]>;
  /**
   * Expires prior open Checkout Sessions for the customer (best-effort):
   * a retried/double checkout replaces the pending session instead of
   * stacking a second completable one.
   */
  expireOpenSessions: (customerId: string) => Promise<void>;
  /** Serializes one short DB-critical section per user (tabs, double-click). */
  withLock: <T>(userId: string, fn: () => Promise<T>) => Promise<T>;
};

const billingConfig = resolveStripeConfig();

const liveDeps: CheckoutDeps = {
  configured: billingConfig.configured,
  prices: billingConfig.prices,
  findSubscription: async (userId) => {
    const row = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        status: true,
        stripeCustomerId: true,
        stripeSubId: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
    if (!row) return null;
    return {
      plan: toPlanId(row.plan as DbPlan),
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubId: row.stripeSubId,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    };
  },
  linkCustomer: async (userId, customerId) => {
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: "FREE", stripeCustomerId: customerId },
      // Never touch plan/status here: only the webhook writes paid state,
      // and a pending checkout must not clobber an existing subscription.
      update: { stripeCustomerId: customerId },
    });
  },
  createCustomer: async ({ email, userId }) => {
    const customer = await getStripeClient().customers.create({
      email,
      metadata: { userId },
    });
    return { id: customer.id };
  },
  createSession: async ({
    customerId,
    priceId,
    userId,
    successUrl,
    cancelUrl,
  }) => {
    const session = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId },
      subscription_data: { metadata: { userId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return { url: session.url };
  },
  listSubscriptionsByCustomer: async (customerId) => {
    const subs = await getStripeClient().subscriptions.list({
      customer: customerId,
      limit: 20,
    });
    return subs.data.map((sub) => ({ id: sub.id, status: sub.status }));
  },
  expireOpenSessions: async (customerId) => {
    try {
      const open = await getStripeClient().checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 20,
      });
      for (const session of open.data) {
        try {
          await getStripeClient().checkout.sessions.expire(session.id);
        } catch {
          // One unexpirable session must not block the fresh checkout.
        }
      }
    } catch (error) {
      reportError("billing", "expire open checkout sessions failed", error);
    }
  },
  withLock: async (userId, fn) => {
    // Per-phase serialisation across instances: one short transaction
    // holding a transaction-scoped advisory lock. The lock is held only
    // for DB reads/writes inside fn — never across Stripe network calls
    // (which run between phases), so pool connections are never parked
    // on third-party latency. Cross-phase races converge by re-check
    // (see handleCheckout): fail-closed, never double-granting.
    // Fail-closed: any transaction failure (lock acquisition or commit)
    // surfaces 500 without ever re-running fn(), so a phase can never
    // execute twice and mint two rows. The user retries explicitly;
    // Stripe-side guards plus open-session expiry keep the retry safe.
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        userId
      );
      return await fn();
    });
  },
};

function isPaidPlanId(plan: unknown): plan is Exclude<PlanId, "free"> {
  return plan === "growth" || plan === "scale";
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function portalRedirect() {
  return NextResponse.json(
    {
      error: "You already have an active subscription. Manage it instead.",
      code: "USE_PORTAL",
    },
    { status: 400 }
  );
}

/**
 * Starts a Stripe Checkout session for Growth/Scale. Authenticated users
 * only; never writes plan state (the webhook owns Subscription writes).
 *
 * DB serialization stays in short transactions; Stripe network calls run
 * OUTSIDE any transaction so pool connections are never parked on
 * third-party latency. Cross-phase races converge by re-check:
 * - the whole flow never runs under one lock (tabs, double-click and
 *   network retries pass through the same phase gates instead);
 * - a stored live paid stake (active/past-due/unpaid/cancelling, or any
 *   unexpired stripeSubId) routes to the Customer Portal, re-checked
 *   after customer creation and before session creation;
 * - a live Stripe stake for the customer routes to the portal even when
 *   the webhook has not landed yet;
 * - concurrent customer creation converges: the first linked row wins and
 *   the loser adopts it (its own fresh Stripe customer stays an empty,
 *   benign orphan — no card, no subscription);
 * - prior open Checkout Sessions are expired before a fresh one is created,
 *   so a retried checkout replaces the pending session instead of stacking
 *   a second completable one.
 */
export async function handleCheckout(input: {
  user: Pick<AuthUser, "id" | "email"> | null;
  plan: unknown;
  origin: string;
  deps: CheckoutDeps;
}): Promise<NextResponse> {
  if (!input.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!input.deps.configured) {
    return NextResponse.json(
      { error: "Billing is not configured yet. Contact support." },
      { status: 503 }
    );
  }
  const prices = input.deps.prices;
  if (!prices) {
    return NextResponse.json(
      {
        error:
          "Billing test configuration is incomplete. Set STRIPE_PRICE_GROWTH and STRIPE_PRICE_SCALE.",
      },
      { status: 503 }
    );
  }
  if (!isHttpOrigin(input.origin)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }
  if (input.plan === "free") {
    return NextResponse.json(
      { error: "The Free plan needs no checkout." },
      { status: 400 }
    );
  }
  if (!isPaidPlanId(input.plan)) {
    return NextResponse.json(
      { error: "Unknown plan. Choose Growth or Scale." },
      { status: 400 }
    );
  }
  const userId = input.user.id;
  const email = input.user.email;
  const plan = input.plan;
  const origin = input.origin;
  // Phase 1 — serialized read in a short transaction. No Stripe calls:
  // decides portal vs proceed and whether a customer exists yet.
  const pre = await input.deps.withLock(userId, async () => {
    const existing = await input.deps.findSubscription(userId);
    if (hasLivePaidStake(existing)) {
      return { verdict: "portal" as const };
    }
    return {
      verdict: "proceed" as const,
      customerId: existing?.stripeCustomerId ?? null,
    };
  });
  if (pre.verdict === "portal") {
    return portalRedirect();
  }
  let customerId = pre.customerId;
  if (customerId) {
    const live = await input.deps.listSubscriptionsByCustomer(customerId);
    if (live.some((sub) => isLiveStripeSubscriptionStatus(sub.status))) {
      return portalRedirect();
    }
  } else {
    const customer = await input.deps.createCustomer({
      email,
      userId,
    });
    // Phase 2 — serialized re-check in a short transaction before
    // anything is linked. A concurrent flow that linked first wins and
    // this flow adopts the winner instead of stacking a second row.
    const linked = await input.deps.withLock(userId, async () => {
      const fresh = await input.deps.findSubscription(userId);
      if (hasLivePaidStake(fresh)) {
        return { verdict: "portal" as const };
      }
      if (fresh?.stripeCustomerId && fresh.stripeCustomerId !== customer.id) {
        return { verdict: "proceed" as const, customerId: fresh.stripeCustomerId };
      }
      await input.deps.linkCustomer(userId, customer.id);
      return { verdict: "proceed" as const, customerId: customer.id };
    });
    if (linked.verdict === "portal") {
      return portalRedirect();
    }
    customerId = linked.customerId;
  }
  await input.deps.expireOpenSessions(customerId);
  const session = await input.deps.createSession({
    customerId,
    priceId: plan === "growth" ? prices.growth : prices.scale,
    userId,
    successUrl: `${origin}/billing?checkout=success`,
    cancelUrl: `${origin}/billing?checkout=cancelled`,
  });
  if (!session.url || !isStripeRedirectUrl(session.url)) {
    reportError(
      "billing",
      "checkout returned an untrusted url",
      new Error("untrusted checkout url"),
      {
        userId,
        plan,
      }
    );
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 502 }
    );
  }
  return NextResponse.json({ url: session.url });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    // Flood gate before Stripe work starts. Generous: human-initiated
    // checkouts and double-click retries stay far below it.
    if (
      user &&
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "billing-checkout",
        userMax: WRITE_LIMIT_CHECKOUT,
      }))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const plan = (body as { plan?: unknown })?.plan;
    // Authoritative intent follows this server action (never ?plan= or
    // localStorage): record which paid plan the user started checking out.
    // Entitlements still come only from the Subscription row (webhook).
    if (user && (plan === "growth" || plan === "scale")) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { selectedPlan: plan === "growth" ? "GROWTH" : "SCALE" },
        });
      } catch (error) {
        reportError("billing", "checkout plan intent persist failed", error, {
          userId: user.id,
        });
      }
    }
    return await handleCheckout({
      user,
      plan,
      origin: new URL(request.url).origin,
      deps: liveDeps,
    });
  } catch (error) {
    reportError("billing", "checkout failed", error);
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 500 }
    );
  }
}
