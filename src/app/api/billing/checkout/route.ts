import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, type AuthUser } from "@/lib/auth";
import {
  getStripeClient,
  getStripePrices,
  isStripeConfigured,
  isStripeRedirectUrl,
  type StripePrices,
} from "@/lib/stripe";
import { toPlanId, type DbPlan } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";
import { reportError } from "@/lib/diagnostics";

export type CheckoutDeps = {
  configured: boolean;
  prices: StripePrices;
  findSubscription: (userId: string) => Promise<{
    plan: PlanId;
    status: string;
    stripeCustomerId: string | null;
    stripeSubId: string | null;
  } | null>;
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
};

const liveDeps: CheckoutDeps = {
  configured: isStripeConfigured(),
  prices: getStripePrices(),
  findSubscription: async (userId) => {
    const row = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        status: true,
        stripeCustomerId: true,
        stripeSubId: true,
      },
    });
    if (!row) return null;
    return {
      plan: toPlanId(row.plan as DbPlan),
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubId: row.stripeSubId,
    };
  },
  linkCustomer: async (userId, customerId) => {
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: "FREE", stripeCustomerId: customerId },
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

/**
 * Starts a Stripe Checkout session for Growth/Scale. Authenticated users
 * only; never writes plan state (the webhook owns Subscription writes).
 * Users with an active Stripe subscription are sent to the Customer Portal
 * instead of stacking a second subscription.
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
  const existing = await input.deps.findSubscription(input.user.id);
  if (existing?.stripeSubId && existing.status === "ACTIVE") {
    return NextResponse.json(
      {
        error:
          "You already have an active subscription. Manage it instead.",
        code: "USE_PORTAL",
      },
      { status: 400 }
    );
  }
  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await input.deps.createCustomer({
      email: input.user.email,
      userId: input.user.id,
    });
    customerId = customer.id;
    await input.deps.linkCustomer(input.user.id, customerId);
  }
  const session = await input.deps.createSession({
    customerId,
    priceId:
      input.plan === "growth"
        ? input.deps.prices.growth
        : input.deps.prices.scale,
    userId: input.user.id,
    successUrl: `${input.origin}/billing?checkout=success`,
    cancelUrl: `${input.origin}/billing?checkout=cancelled`,
  });
  if (!session.url || !isStripeRedirectUrl(session.url)) {
    reportError(
      "billing",
      "checkout returned an untrusted url",
      new Error("untrusted checkout url"),
      {
        userId: input.user.id,
        plan: input.plan,
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
