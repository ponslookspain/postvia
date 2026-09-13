/**
 * Onboarding gate (server-only).
 *
 * Every authenticated page that requires a finished onboarding calls
 * `requireOnboardedUser()`. Users with `onboardingCompleted=false` are sent
 * to /onboarding — this covers refresh, logout/login, billing-return and
 * direct-URL cases. The admin always passes (backfilled + explicit bypass).
 */

import { redirect } from "next/navigation";
import { getSessionUser, type AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/entitlements";

export type OnboardingState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export function toOnboardingState(
  onboardingCompleted: boolean,
  hasName: boolean
): OnboardingState {
  if (onboardingCompleted) return "COMPLETED";
  return hasName ? "IN_PROGRESS" : "NOT_STARTED";
}

/** Raw DB state for the current session user (null when signed out). */
export async function getOnboardingState(
  userId: string
): Promise<{ onboardingCompleted: boolean; name: string } | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true, name: true },
  });
  return row;
}

/**
 * Like requireUser(), but incomplete onboardings are bounced to
 * /onboarding first. Call at the top of gated server pages.
 */
export async function requireOnboardedUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (isAdminEmail(user.email)) return user;
  const state = await getOnboardingState(user.id);
  if (!state?.onboardingCompleted) redirect("/onboarding");
  return user;
}

/**
 * Post-auth router target for a user id. Used by /post-auth and OTP
 * clients as a single decision point (no client-side state trusted).
 */
export async function postAuthTarget(
  userId: string,
  userEmail: string
): Promise<"/onboarding" | "/billing" | "/dashboard"> {
  if (isAdminEmail(userEmail)) return "/dashboard";
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true, selectedPlan: true },
  });
  if (!row?.onboardingCompleted) return "/onboarding";
  if (row.selectedPlan === "GROWTH" || row.selectedPlan === "SCALE") {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true, stripeSubId: true },
    });
    const hasPaid =
      sub != null &&
      (sub.plan === "GROWTH" || sub.plan === "SCALE") &&
      sub.status !== "CANCELED" &&
      sub.status !== "UNPAID";
    if (!hasPaid) return "/billing";
  }
  return "/dashboard";
}
