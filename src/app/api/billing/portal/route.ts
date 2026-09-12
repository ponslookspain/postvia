import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, type AuthUser } from "@/lib/auth";
import {
  getStripeClient,
  isStripeConfigured,
  isStripeRedirectUrl,
} from "@/lib/stripe";
import { reportError } from "@/lib/diagnostics";

export type PortalDeps = {
  configured: boolean;
  findCustomerId: (userId: string) => Promise<string | null>;
  createPortalSession: (
    customerId: string,
    returnUrl: string
  ) => Promise<{ url: string | null }>;
};

const liveDeps: PortalDeps = {
  configured: isStripeConfigured(),
  findCustomerId: async (userId) => {
    const row = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    return row?.stripeCustomerId ?? null;
  },
  createPortalSession: async (customerId, returnUrl) => {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  },
};

/**
 * Opens the Stripe Customer Portal (plan change / cancellation / payment
 * method). The portal is the only user-facing path that alters paid state;
 * direct plan mutations stay admin-only. Never writes Subscription rows.
 */
export async function handlePortal(input: {
  user: Pick<AuthUser, "id" | "email"> | null;
  origin: string;
  deps: PortalDeps;
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
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }
  const customerId = await input.deps.findCustomerId(input.user.id);
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing customer yet. Upgrade first." },
      { status: 400 }
    );
  }
  const session = await input.deps.createPortalSession(
    customerId,
    `${origin.origin}/billing`
  );
  if (!session.url || !isStripeRedirectUrl(session.url)) {
    reportError(
      "billing",
      "portal returned an untrusted url",
      new Error("untrusted portal url"),
      {
        userId: input.user.id,
      }
    );
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 502 }
    );
  }
  return NextResponse.json({ url: session.url });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    return await handlePortal({
      user,
      origin: new URL(request.url).origin,
      deps: liveDeps,
    });
  } catch (error) {
    reportError("billing", "portal failed", error);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 }
    );
  }
}
