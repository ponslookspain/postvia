import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { isKnownPlanId, toDbPlan } from "@/lib/entitlements";

const PERIOD_MS = 30 * 86_400_000;

/**
 * Test-mode plan change. No Stripe, no payment: writes the subscription
 * row directly (upsert), always ACTIVE with a fresh 30-day period and a
 * cleared cancellation flag. The future Stripe webhook will write these
 * same fields — the UI never learns where they came from.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const plan = (body as { plan?: unknown })?.plan;
    if (!isKnownPlanId(plan)) {
      return NextResponse.json(
        { error: "Unknown plan. Choose Starter, Growth or Scale." },
        { status: 400 }
      );
    }
    const subscription = await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        plan: toDbPlan(plan),
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + PERIOD_MS),
        cancelAtPeriodEnd: false,
      },
      update: {
        plan: toDbPlan(plan),
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + PERIOD_MS),
        cancelAtPeriodEnd: false,
      },
    });
    return NextResponse.json({
      ok: true,
      plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to change plan" },
      { status: 500 }
    );
  }
}
