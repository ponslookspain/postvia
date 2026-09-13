"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ErrorBlock } from "@/components/StateBlock";
import { Section, SectionHeader } from "@/components/Section";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { getPlan, PLANS, type Plan, type PlanId } from "@/lib/plans";
import { isStripeRedirectUrl } from "@/lib/stripe-redirect";
import { PlanBadge, UpgradeCta, UsageBar } from "@/components/billing/BillingWidgets";

export type BillingView = {
  plan: PlanId;
  status: string;
  price: number;
  period: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  postsUsed: number;
  postsLimit: number | null;
  totalAccounts: number;
  accountsLimit: number | null;
  /** Checkout started, no authoritative subscription state yet — no paid grant. */
  checkoutPending: boolean;
  checkoutResult: "success" | "cancelled" | null;
  /** A Stripe customer exists: upgrades/fixes go through the portal, not a new checkout. */
  hasBillingCustomer: boolean;
};

function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type PaidPlanId = Extract<PlanId, "growth" | "scale">;

function isPaidPlanId(plan: PlanId): plan is PaidPlanId {
  return plan === "growth" || plan === "scale";
}

/**
 * Compact feature rows derived from live entitlements — never enum
 * names, never duplicated limits. What the plan gates is what the
 * card lists.
 */
function planFeatureRows(plan: Plan): string[] {
  const e = plan.entitlements;
  const rows = [
    e.monthlyPosts === null
      ? "Unlimited posts"
      : `${e.monthlyPosts} posts / month`,
    e.maxTotalAccounts === null
      ? "Unlimited accounts"
      : e.maxTotalAccounts === 1
        ? "1 connected account"
        : `${e.maxTotalAccounts} connected accounts`,
  ];
  if (e.calendar) rows.push("Calendar");
  if (e.bulk)
    rows.push(`Bulk video scheduling (up to ${e.maxBulkVideos} videos)`);
  if (e.retryReschedule) rows.push("Retry failed posts");
  return rows;
}

export function BillingSection({
  initial,
  canChangePlan = false,
}: {
  initial: BillingView;
  /** True only for admins: direct plan changes are an admin testing tool. */
  canChangePlan?: boolean;
}) {
  const router = useRouter();
  const [changing, setChanging] = useState<PlanId | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [redirecting, setRedirecting] = useState<
    "growth" | "scale" | "portal" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function changePlan(plan: PlanId) {
    setChanging(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof data?.error === "string" ? data.error : "Failed to change plan"
        );
        return;
      }
      toast.add({
        title: `Switched to ${getPlan(plan).name}`,
        description: "Test mode — nothing was charged.",
        type: "success",
      });
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setChanging(null);
    }
  }

  async function startCheckout(plan: PaidPlanId) {
    setRedirecting(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => null);
      const url = data?.url;
      if (!res.ok || !isStripeRedirectUrl(url)) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Failed to start checkout"
        );
        return;
      }
      window.location.assign(url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRedirecting(null);
    }
  }

  async function openPortal() {
    setRedirecting("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      const url = data?.url;
      if (!res.ok || !isStripeRedirectUrl(url)) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Failed to open billing management"
        );
        return;
      }
      window.location.assign(url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRedirecting(null);
    }
  }

  async function cancelSubscription() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof data?.error === "string" ? data.error : "Failed to cancel"
        );
        return;
      }
      toast.add({
        title: "Cancellation scheduled",
        description: "Your plan stays active until the end of the period.",
        type: "success",
      });
      setCancelOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  const periodEnd = formatPeriodEnd(initial.currentPeriodEnd);
  const currentPlan = getPlan(initial.plan);
  // Anyone with a Stripe customer (including UNPAID on the Free effective
  // plan) manages payment through the portal; canceled/expired customers
  // resubscribe via a fresh checkout instead.
  const showPortal =
    !canChangePlan &&
    initial.hasBillingCustomer &&
    !initial.checkoutPending &&
    initial.status !== "CANCELED" &&
    initial.status !== "EXPIRED";
  const showCancel =
    canChangePlan &&
    initial.plan !== "free" &&
    initial.status !== "CANCELED" &&
    initial.status !== "EXPIRED";
  const renewalLabel = !periodEnd
    ? null
    : initial.status === "CANCELLING" || initial.cancelAtPeriodEnd
      ? `Ends ${periodEnd}`
      : `Renews ${periodEnd}`;

  return (
    <>
      <Section labelledBy="billing-summary">
        <SectionHeader
          id="billing-summary"
          title="Current plan"
          description="What you pay, what you use, and when it renews."
        />
        <Card>
          <CardHeader>
            <CardTitle>{currentPlan.name}</CardTitle>
            <CardDescription>{currentPlan.description}</CardDescription>
            <CardAction>
              <PlanBadge plan={initial.plan} status={initial.status} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              €{initial.price}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {initial.period}
              </span>
            </p>
            <UsageBar
              used={initial.postsUsed}
              limit={initial.postsLimit}
              label="Posts this month"
            />
            {initial.plan === "free" &&
              initial.postsLimit !== null &&
              initial.postsUsed >= initial.postsLimit && (
                <Alert>
                  <AlertTitle>
                    You&apos;ve reached your {initial.postsLimit} free posts
                    this month.
                  </AlertTitle>
                  <AlertDescription>
                    <UpgradeCta
                      reason="New posts are paused until your allowance resets next month."
                      upgradeTo="growth"
                    />
                  </AlertDescription>
                </Alert>
              )}
            <div>
              <Separator />
              <dl className="flex flex-col">
                <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">Connected accounts</dt>
                  <dd className="font-medium tabular-nums">
                    {initial.accountsLimit === null
                      ? `${initial.totalAccounts} (unlimited)`
                      : `${initial.totalAccounts} of ${initial.accountsLimit}`}
                  </dd>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">Billing period</dt>
                  <dd className="font-medium">
                    {renewalLabel ?? "No renewal date"}
                  </dd>
                </div>
              </dl>
              <Separator />
            </div>
            {initial.status === "CANCELLING" && periodEnd && (
              <Alert>
                <AlertTitle>Canceling on {periodEnd}</AlertTitle>
                <AlertDescription>
                  Full access until then; afterwards the Free plan applies.
                </AlertDescription>
              </Alert>
            )}
            {initial.checkoutResult === "cancelled" && (
              <Alert>
                <AlertTitle>Checkout cancelled</AlertTitle>
                <AlertDescription>
                  No charge was made. You can subscribe any time.
                </AlertDescription>
              </Alert>
            )}
            {initial.checkoutPending && (
              <Alert>
                <AlertTitle>Payment processing</AlertTitle>
                <AlertDescription>
                  Your checkout is confirming with the payment provider. Your
                  plan activates automatically once it is confirmed — no need
                  to pay again.
                </AlertDescription>
              </Alert>
            )}
            {initial.status === "PAST_DUE" && (
              <Alert variant="destructive">
                <AlertTitle>Payment past due</AlertTitle>
                <AlertDescription>
                  Update payment in billing management to keep your plan.
                </AlertDescription>
              </Alert>
            )}
            {initial.status === "UNPAID" && (
              <Alert variant="destructive">
                <AlertTitle>Payment failed</AlertTitle>
                <AlertDescription>
                  Paid features are paused while the subscription is unpaid.
                  Update payment in billing management to restore access — your
                  posts and accounts are kept.
                </AlertDescription>
              </Alert>
            )}
            {(initial.status === "CANCELED" || initial.status === "EXPIRED") && (
              <Alert>
                <AlertTitle>
                  {initial.status === "CANCELED" ? "Subscription canceled" : "Subscription expired"}
                </AlertTitle>
                <AlertDescription>
                  The Free plan applies now. Your posts and accounts are kept —
                  resubscribe any time to unlock paid limits again.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <ErrorBlock title="Something went wrong" description={error} />
            )}
            {(showPortal || showCancel) && (
              <div className="flex flex-col gap-2 sm:flex-row">
                {showPortal && (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={redirecting !== null}
                    onClick={() => void openPortal()}
                    className="min-h-11 w-full sm:w-auto"
                  >
                    {redirecting === "portal"
                      ? "Opening…"
                      : "Manage subscription"}
                  </Button>
                )}
                {showCancel && (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={initial.cancelAtPeriodEnd}
                    onClick={() => setCancelOpen(true)}
                    className="min-h-11 w-full sm:w-auto"
                  >
                    {initial.cancelAtPeriodEnd
                      ? "Cancellation scheduled"
                      : "Cancel subscription"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section labelledBy="billing-plans">
        <SectionHeader
          id="billing-plans"
          title="Plans"
          description={
            canChangePlan
              ? "Admin testing only — ordinary users check out through Stripe."
              : "Upgrade when you need more posts and accounts."
          }
        />
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PLANS.map((plan) => {
            const current = plan.id === initial.plan;
            const recommended = plan.id === "growth";
            const paidId = isPaidPlanId(plan.id) ? plan.id : null;
            // Paid plans are bought through Stripe Checkout, but only
            // from Free without a live billing stake: plan changes and
            // payment fixes on an active subscription go through Manage
            // subscription (Customer Portal) instead of stacking a second
            // checkout. Canceled/expired customers may resubscribe freely.
            // Free itself needs no action.
            const subscribable =
              paidId !== null &&
              initial.plan === "free" &&
              !initial.checkoutPending &&
              (!initial.hasBillingCustomer ||
                initial.status === "CANCELED" ||
                initial.status === "EXPIRED");
            return (
              <Card
                key={plan.id}
                className={cn(
                  "h-full",
                  recommended && "border-signal/60 bg-signal/[0.04]"
                )}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{plan.name}</CardTitle>
                    {recommended && (
                      <Badge className="border-signal/30 bg-signal/10 text-signal">
                        Recommended
                      </Badge>
                    )}
                    {current && <Badge variant="secondary">Current</Badge>}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-5">
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    €{plan.price}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / {plan.period}
                    </span>
                  </p>
                  <ul className="flex flex-col gap-2 text-sm">
                    {planFeatureRows(plan).map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckIcon
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            recommended ? "text-signal" : "text-muted-foreground"
                          )}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-1">
                    {canChangePlan ? (
                      current ? null : (
                        <Button
                          variant={recommended ? "default" : "outline"}
                          size="lg"
                          disabled={changing !== null}
                          onClick={() => void changePlan(plan.id)}
                          className="min-h-11 w-full"
                        >
                          {changing === plan.id ? "Switching…" : "Switch"}
                        </Button>
                      )
                    ) : current ? (
                      showPortal ? (
                        <Button
                          variant="outline"
                          size="lg"
                          disabled={redirecting !== null}
                          onClick={() => void openPortal()}
                          className="min-h-11 w-full"
                        >
                          {redirecting === "portal"
                            ? "Opening…"
                            : "Manage subscription"}
                        </Button>
                      ) : null
                    ) : subscribable && paidId !== null ? (
                      <Button
                        variant={recommended ? "default" : "outline"}
                        size="lg"
                        disabled={redirecting !== null}
                        onClick={() => void startCheckout(paidId)}
                        className="min-h-11 w-full"
                      >
                        {redirecting === paidId
                          ? "Redirecting…"
                          : "Subscribe"}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {error && (
          <ErrorBlock
            title="Something went wrong"
            description={error}
            className="mt-4"
          />
        )}
      </Section>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Access continues until the end of the current period. Afterwards
              the Free plan applies. Nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep plan
            </Button>
            <Button
              variant="destructive"
              onClick={() => void cancelSubscription()}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
