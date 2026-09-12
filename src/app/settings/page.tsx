import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import {
  getEffectivePlan,
  getUsage,
  isAdminEmail,
} from "@/lib/entitlements";
import { getPlan } from "@/lib/plans";
import type { BillingView } from "@/components/billing/BillingSection";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  const [prefs, authAccounts, effective, usage] = await Promise.all([
    prisma.userPreferences.findUnique({
      where: { userId: user.id },
    }),
    prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true },
    }),
    getEffectivePlan({ userId: user.id, userEmail: user.email }),
    getUsage(user.id),
  ]);

  const providerIds = authAccounts.map((a) => a.providerId);
  const hasPassword = providerIds.includes("credential");
  const hasGoogle = providerIds.includes("google");

  const billing: BillingView = {
    plan: effective.plan,
    status: effective.status,
    price: getPlan(effective.plan).price,
    period: getPlan(effective.plan).period,
    currentPeriodEnd: effective.currentPeriodEnd
      ? effective.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: effective.cancelAtPeriodEnd,
    postsUsed: usage.postsThisMonth,
    postsLimit: effective.entitlements.monthlyPosts,
    totalAccounts: usage.totalAccounts,
  };

  return (
    <AppShell user={user}>
      <SettingsClient
        name={user.name}
        email={user.email}
        emailVerified={user.emailVerified}
        hasPassword={hasPassword}
        hasGoogle={hasGoogle}
        preferences={{
          emailNotifications: prefs?.emailNotifications ?? true,
          productUpdates: prefs?.productUpdates ?? true,
        }}
        billing={billing}
        isAdmin={isAdminEmail(user.email)}
      />
    </AppShell>
  );
}
