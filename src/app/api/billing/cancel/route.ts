import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";

/**
 * Test-mode cancellation. Never deletes the subscription and never cuts
 * access immediately: flags cancelAtPeriodEnd so the current plan runs to
 * the end of the period, then the effective plan drops to Starter.
 */
export async function POST() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const existing = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { id: true, plan: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "No subscription to cancel" },
        { status: 400 }
      );
    }
    // Free is permanent and needs no cancellation.
    if (existing.plan === "FREE") {
      return NextResponse.json(
        { error: "The Free plan cannot be cancelled" },
        { status: 400 }
      );
    }
    const subscription = await prisma.subscription.update({
      where: { userId: user.id },
      data: { cancelAtPeriodEnd: true },
    });
    return NextResponse.json({
      ok: true,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
