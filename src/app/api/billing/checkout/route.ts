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
  /** Serializes concurrent checkouts for one user (tabs, double-click). */
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
    // Serializes concurrent checkouts for one user across instances.
    // xact-scoped advisory lock: held for one low-frequency checkout flow.
    // Fail-closed: any transaction failure (lock acquisition or commit)
    // surfaces 500 without ever re-running fn(), so the flow can never
    // execute twice and mint two customers/sessions. The user retries
    // explicitly; Stripe-side guards plus open-session expiry keep the
    // retry safe.
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
 * Double-subscription guards (all server-side, never UI-only):
 * - the whole flow runs under a per-user advisory lock (tabs, double-click,
 *   network retry serialize instead of racing);
 * - a stored live paid stake (active/past-due/unpaid/cancelling, or any
 *   unexpired stripeSubId) routes to the Customer Portal;
 * - a live Stripe stake for the customer routes to the portal even when the
 *   webhook has not landed yet;
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
  return input.deps.withLock(userId, async () => {
    const existing = await input.deps.findSubscription(userId);
    if (hasLivePaidStake(existing)) {
      return portalRedirect();
    }
    let customerId = existing?.stripeCustomerId ?? null;
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
      customerId = customer.id;
      await input.deps.linkCustomer(userId, customerId);
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
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const plan = (body as { plan?: unknown })?.plan;
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
