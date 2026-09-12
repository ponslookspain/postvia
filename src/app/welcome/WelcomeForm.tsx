"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { AuthShell } from "@/components/AuthShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  PLAN_STORAGE_KEY,
  PLANS,
  parsePlanParam,
  type PlanId,
} from "@/lib/plans";

function subscribeNoop(): () => void {
  return () => {};
}

function readStoredPlan(fallback: PlanId): PlanId {
  try {
    return (
      parsePlanParam(localStorage.getItem(PLAN_STORAGE_KEY)) ?? fallback
    );
  } catch {
    return fallback;
  }
}

export function WelcomeForm({ initialPlan }: { initialPlan: PlanId }) {
  const router = useRouter();
  const stored = useSyncExternalStore(
    subscribeNoop,
    () => readStoredPlan(initialPlan),
    () => initialPlan
  );
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = selected ?? stored;

  function confirm() {
    setConfirming(true);
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, active);
    } catch {
      // Selection still applies for this session via the dashboard push.
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      title="Choose your plan"
      description="Test mode — no payment, no card, nothing is charged."
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Plans" className="flex flex-col gap-2">
          {PLANS.map((plan) => {
            const isActive = plan.id === active;
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setSelected(plan.id)}
                className={cn(
                  "rounded-lg border p-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive ? "border-primary" : "border-border"
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {plan.name}
                    {plan.highlighted && (
                      <Badge variant="secondary">Most popular</Badge>
                    )}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold tabular-nums">
                      ${plan.price}
                    </span>{" "}
                    <span className="text-muted-foreground">/ month</span>
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {plan.description}
                </span>
                <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isActive && (
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  )}
                  {plan.features[0]}
                  {plan.features.length > 1 &&
                    ` +${plan.features.length - 1} more`}
                </span>
              </button>
            );
          })}
        </div>
        <Separator />
        <Button onClick={confirm} disabled={confirming} className="w-full">
          {confirming && <Spinner data-icon="inline-start" />}
          {confirming ? "Confirming…" : `Continue with ${active}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          You can change this later. This is a test flow.
        </p>
      </div>
    </AuthShell>
  );
}
