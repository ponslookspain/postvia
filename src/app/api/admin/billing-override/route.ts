import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import {
  isAdminEmail,
  isKnownPlanId,
  toDbPlan,
  type TestMode,
} from "@/lib/entitlements";

/**
 * Developer test controls. Every handler re-verifies the server-side
 * admin gate — client-side hiding is presentation only. Test state lives
 * in BillingTestOverride, never inside the real Subscription row.
 */
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function requireAdmin() {
  const user = await getApiUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return forbidden();
  const [subscription, testOverride] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId: user.id } }),
    prisma.billingTestOverride.findUnique({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({ subscription, testOverride });
}

const VALID_MODES = ["BYPASS", "ENFORCEMENT"] as const;
const VALID_STATUSES = ["ACTIVE", "CANCELED", "PAST_DUE"] as const;

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return forbidden();
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("bad body");
    }
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const mode = body.mode;
  if (!VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
    return NextResponse.json(
      { error: "mode must be BYPASS or ENFORCEMENT" },
      { status: 400 }
    );
  }
  const plan = body.plan ?? "GROWTH";
  if (!isKnownPlanId(plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  const subStatus = body.subStatus ?? "ACTIVE";
  if (
    typeof subStatus !== "string" ||
    !(VALID_STATUSES as readonly string[]).includes(subStatus)
  ) {
    return NextResponse.json({ error: "Invalid subStatus" }, { status: 400 });
  }
  const cancelAtPeriodEnd = body.cancelAtPeriodEnd === true;
  let currentPeriodEnd: Date | null = null;
  if (typeof body.currentPeriodEnd === "string" && body.currentPeriodEnd) {
    const parsed = new Date(body.currentPeriodEnd);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid currentPeriodEnd" },
        { status: 400 }
      );
    }
    currentPeriodEnd = parsed;
  } else if (body.currentPeriodEnd !== undefined && body.currentPeriodEnd !== null) {
    return NextResponse.json(
      { error: "Invalid currentPeriodEnd" },
      { status: 400 }
    );
  }

  const testOverride = await prisma.billingTestOverride.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      mode: mode as TestMode,
      plan: toDbPlan(plan),
      subStatus: subStatus as "ACTIVE" | "CANCELED" | "PAST_DUE",
      cancelAtPeriodEnd,
      currentPeriodEnd,
    },
    update: {
      mode: mode as TestMode,
      plan: toDbPlan(plan),
      subStatus: subStatus as "ACTIVE" | "CANCELED" | "PAST_DUE",
      cancelAtPeriodEnd,
      currentPeriodEnd,
    },
  });
  return NextResponse.json({ ok: true, testOverride });
}

export async function DELETE() {
  const user = await requireAdmin();
  if (!user) return forbidden();
  await prisma.billingTestOverride.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
