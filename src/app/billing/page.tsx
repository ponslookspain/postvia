import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer, PageSections } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  getEffectivePlan,
  getSubscription,
  getUsage,
  isAdminEmail,
  isCheckoutPending,
} from "@/lib/entitlements";
import { getPlan } from "@/lib/plans";
import { liveBillingStores } from "@/lib/billing-live-stores";
import { isStripeConfigured, reconcileSubscriptionFromStripe } from "@/lib/stripe";
import type { BillingView } from "@/components/billing/BillingSection";
import { BillingSection } from "@/components/billing/BillingSection";
import { AdminBillingPanel } from "@/components/billing/AdminBillingPanel";

export const dynamic = "force-dynamic";

type BillingSearchParams = {
  checkout?: string;
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<BillingSearchParams>;
}) {
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
  const params = await searchParams;
  const checkoutResult =
    params?.checkout === "success"
      ? ("success" as const)
      : params?.checkout === "cancelled"
        ? ("cancelled" as const)
        : null;
  // On-demand reconciliation (no polling): the user just returned from
  // Checkout but the webhook may be delayed. Reads the live Stripe object
  // and applies it through the same guarded writer — never grants from the
  // `checkout=success` query param itself.
  if (checkoutResult === "success" && isStripeConfigured()) {
    try {
      await reconcileSubscriptionFromStripe({
        userId: user.id,
        stores: liveBillingStores,
      });
    } catch {
      // Webhook remains the writer; the page degrades to the pending state.
    }
  }
  const [effective, usage, subscription] = await Promise.all([
    getEffectivePlan({ userId: user.id, userEmail: user.email }),
    getUsage(user.id),
    getSubscription(user.id),
  ]);

  // A FREE row holding a customer but no subscription means Checkout
  // started and no authoritative subscription state exists yet. Older rows
  // read as abandoned checkouts that may safely start over.
  const checkoutPending = isCheckoutPending(subscription);

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
    accountsLimit: effective.entitlements.maxTotalAccounts,
    checkoutPending,
    checkoutResult,
    hasBillingCustomer: !!subscription?.stripeCustomerId,
  };

  const isAdmin = isAdminEmail(user.email);

  return (
    <AppShell user={user}>
      <PageContainer>
        <PageHeader
          title="Billing"
          description="Your plan, usage and subscription"
        />
        <PageSections>
          <BillingSection initial={billing} canChangePlan={isAdmin} />
          {isAdmin && <AdminBillingPanel />}
        </PageSections>
      </PageContainer>
    </AppShell>
  );
}
