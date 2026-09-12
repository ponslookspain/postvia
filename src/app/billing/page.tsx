import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  getEffectivePlan,
  getUsage,
  isAdminEmail,
} from "@/lib/entitlements";
import { getPlan } from "@/lib/plans";
import type { BillingView } from "@/components/billing/BillingSection";
import { BillingSection } from "@/components/billing/BillingSection";
import { AdminBillingPanel } from "@/components/billing/AdminBillingPanel";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-sm text-center">
          <p className="mb-8 text-lg font-semibold tracking-tight">postvia</p>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">
            Sign in to view your plan and usage.
          </p>
          <Button nativeButton={false} render={<Link href="/login" />} className="w-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }
  const [effective, usage] = await Promise.all([
    getEffectivePlan({ userId: user.id, userEmail: user.email }),
    getUsage(user.id),
  ]);

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

  const isAdmin = isAdminEmail(user.email);

  return (
    <AppShell user={user}>
      <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <PageHeader
          title="Billing"
          description="Your plan, usage and subscription status"
        />
        <div className="flex flex-col gap-10">
          <BillingSection initial={billing} canChangePlan={isAdmin} />
          {isAdmin && <AdminBillingPanel />}
        </div>
      </div>
    </AppShell>
  );
}
