"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { PLANS, type PlanId } from "@/lib/plans";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function OnboardingForm({ initialName = "" }: { initialName?: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [plan, setPlan] = useState<PlanId>("free");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Unable to save. Please try again.");
        setSaving(false);
        return;
      }
      // Server decides the next step (free -> dashboard, paid -> billing).
      router.push(data.next === "/billing" ? "/billing" : "/dashboard");
      router.refresh();
    } catch {
      setError("Unable to save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title="Welcome to Postvia"
      description="Tell us your name and pick a plan to finish setup"
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <FieldGroup>
          {error && (
            <Alert color="error" variant="outline">
              <TriangleAlertIcon />
              <AlertContent>
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="onboarding-name">Your name</FieldLabel>
            <Input
              id="onboarding-name"
              type="text"
              required
              autoComplete="name"
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel id="onboarding-plan-label">Choose your plan</FieldLabel>
            <div
              role="radiogroup"
              aria-labelledby="onboarding-plan-label"
              className="flex flex-col gap-2"
            >
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={plan === p.id}
                  onClick={() => setPlan(p.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
                    plan === p.id
                      ? "border-foreground bg-muted/60"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {p.name}
                      {p.id === "free" ? " — free forever" : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.id === "free"
                        ? "15 posts per month · 1 account"
                        : p.id === "growth"
                          ? "300 posts per month · 5 accounts"
                          : "Unlimited posts and accounts"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {p.price === 0 ? "Free" : `€${p.price}/mo`}
                  </span>
                </button>
              ))}
            </div>
          </Field>
          <Button type="submit" disabled={saving} className="w-full">
            {saving && <Spinner data-icon="inline-start" />}
            {saving
              ? "Saving..."
              : plan === "free"
                ? "Continue as free"
                : `Continue with ${plan === "growth" ? "Growth" : "Scale"}`}
          </Button>
          <p className="text-xs text-muted-foreground">
            {plan === "free"
              ? "You can upgrade anytime from Billing."
              : "You will be taken to secure checkout next. No charge until you confirm."}
          </p>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
