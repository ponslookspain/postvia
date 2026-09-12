"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TriangleAlertIcon } from "lucide-react";
import { getPlan, PLANS, type PlanId } from "@/lib/plans";
import { isStripeRedirectUrl } from "@/lib/stripe-redirect";
import { PlanBadge, UsageBar } from "@/components/billing/BillingWidgets";

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

  return (
    <section aria-labelledby="settings-billing" id="billing" className="scroll-mt-20">
      <h2 id="settings-billing" className="text-lg font-medium">
        Billing
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Your plan, usage and subscription status
      </p>
      <div className="flex max-w-md flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <PlanBadge plan={initial.plan} status={initial.status} />
          <span className="text-sm text-muted-foreground">
            ${initial.price} / {initial.period}
          </span>
        </div>
        {initial.status === "CANCELLING" && periodEnd && (
          <Alert>
            <AlertTitle>Canceling on {periodEnd}</AlertTitle>
            <AlertDescription>
              Full access until then; afterwards the Free plan applies.
            </AlertDescription>
          </Alert>
        )}
        {initial.status === "PAST_DUE" && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Payment past due</AlertTitle>
            <AlertDescription>
              Update payment in billing management to keep your plan.
            </AlertDescription>
          </Alert>
        )}
        <UsageBar
          used={initial.postsUsed}
          limit={initial.postsLimit}
          label="Posts this month"
        />
        <p className="text-xs text-muted-foreground">
          {initial.totalAccounts} connected{" "}
          {initial.totalAccounts === 1 ? "account" : "accounts"}
          {periodEnd && ` · Period ends ${periodEnd}`}
        </p>
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canChangePlan ? (
          <div>
            <p className="mb-2 text-sm font-medium">Change plan</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Admin testing only — ordinary users check out through Stripe.
            </p>
            <div className="flex flex-col gap-2">
              {PLANS.map((plan) => {
                const current = plan.id === initial.plan;
                return (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {plan.name}
                        {current && <Badge variant="secondary">Current</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${plan.price} / {plan.period}
                      </p>
                    </div>
                    {!current && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={changing !== null}
                        onClick={() => void changePlan(plan.id)}
                      >
                        {changing === plan.id ? "Switching…" : "Switch"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-sm font-medium">Plans</p>
            <div className="flex flex-col gap-2">
              {PLANS.map((plan) => {
                const current = plan.id === initial.plan;
                // Paid plans are bought through Stripe Checkout, but only
                // from Free: plan changes on an active subscription go
                // through Manage subscription (Customer Portal) instead of
                // stacking a second checkout. Free itself needs no action.
                const paidId = isPaidPlanId(plan.id) ? plan.id : null;
                const subscribable = paidId !== null && initial.plan === "free";
                return (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {plan.name}
                        {current && <Badge variant="secondary">Current</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${plan.price} / {plan.period}
                      </p>
                    </div>
                    {subscribable && paidId !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={redirecting !== null}
                        onClick={() => void startCheckout(paidId)}
                      >
                        {redirecting === paidId
                          ? "Redirecting…"
                          : paidId === "scale"
                            ? "Subscribe"
                            : "Upgrade"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!canChangePlan &&
          initial.plan !== "free" &&
          initial.status !== "CANCELED" &&
          initial.status !== "EXPIRED" && (
            <div>
              <Button
                variant="outline"
                disabled={redirecting !== null}
                onClick={() => void openPortal()}
              >
                {redirecting === "portal"
                  ? "Opening…"
                  : "Manage subscription"}
              </Button>
            </div>
          )}
        {canChangePlan &&
          initial.plan !== "free" &&
          initial.status !== "CANCELED" &&
          initial.status !== "EXPIRED" && (
          <div>
            <Button
              variant="outline"
              disabled={initial.cancelAtPeriodEnd}
              onClick={() => setCancelOpen(true)}
            >
              {initial.cancelAtPeriodEnd
                ? "Cancellation scheduled"
                : "Cancel subscription"}
            </Button>
          </div>
        )}
      </div>

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
    </section>
  );
}
