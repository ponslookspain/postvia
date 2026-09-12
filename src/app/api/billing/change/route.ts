import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, type AuthUser } from "@/lib/auth";
import {
  isAdminEmail,
  isKnownPlanId,
  toDbPlan,
  type DbPlan,
} from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";
import { reportError } from "@/lib/diagnostics";

const PERIOD_MS = 30 * 86_400_000;

export type PlanChangeStore = {
  upsertSubscription: (input: {
    userId: string;
    plan: DbPlan;
    periodEnd: Date;
  }) => Promise<{
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }>;
};

const liveStore: PlanChangeStore = {
  upsertSubscription: ({ userId, plan, periodEnd }) =>
    prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {
        plan,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    }),
};

/**
 * Admin-only plan change (no Stripe yet, no payment).
 *
 * Ordinary users always resolve their real plan from the Subscription row
 * (or Free by default) and can never gain Growth/Scale through this
 * endpoint: non-admin callers get 403 before any plan validation or write.
 * Admins keep the ability to set Free/Growth/Scale for testing; the future
 * Stripe webhook will write these same Subscription fields.
 */
export async function handlePlanChange(input: {
  user: Pick<AuthUser, "id" | "email"> | null;
  plan: unknown;
  store: PlanChangeStore;
}): Promise<NextResponse> {
  if (!input.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminEmail(input.user.email)) {
    return NextResponse.json(
      { error: "Plan changes are not available. Contact support." },
      { status: 403 }
    );
  }
  if (!isKnownPlanId(input.plan)) {
    return NextResponse.json(
      { error: "Unknown plan. Choose Free, Growth or Scale." },
      { status: 400 }
    );
  }
  const plan: PlanId = input.plan;
  const subscription = await input.store.upsertSubscription({
    userId: input.user.id,
    plan: toDbPlan(plan),
    periodEnd: new Date(Date.now() + PERIOD_MS),
  });
  return NextResponse.json({
    ok: true,
    plan,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
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
    return await handlePlanChange({ user, plan, store: liveStore });
  } catch (error) {
    reportError("billing", "plan change failed", error);
    return NextResponse.json(
      { error: "Failed to change plan" },
      { status: 500 }
    );
  }
}
