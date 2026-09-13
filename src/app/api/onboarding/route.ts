import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logErrorDiagnostic } from "@/lib/diagnostics";

/**
 * POST /api/onboarding { name, plan: "free" | "growth" | "scale" }
 *
 * Completes onboarding for the session user: sets the display name,
 * persists the server-side plan intent (authoritative; never localStorage
 * or ?plan=), and marks onboardingCompleted. Returns the next step so the
 * client trusts no local state: free -> /dashboard, paid -> /billing.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const plan = body?.plan;

    if (!name || name.length > 50) {
      return NextResponse.json(
        { error: "Please enter your name (up to 50 characters)" },
        { status: 400 }
      );
    }
    if (plan !== "free" && plan !== "growth" && plan !== "scale") {
      return NextResponse.json(
        { error: "Unknown plan. Choose Free, Growth or Scale." },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        onboardingCompleted: true,
        selectedPlan:
          plan === "growth" ? "GROWTH" : plan === "scale" ? "SCALE" : "FREE",
      },
    });

    return NextResponse.json({
      ok: true,
      next: plan === "free" ? "/dashboard" : "/billing",
    });
  } catch (err) {
    logErrorDiagnostic("auth", "onboarding completion failed", err);
    return NextResponse.json(
      { error: "Failed to save. Please try again." },
      { status: 500 }
    );
  }
}
