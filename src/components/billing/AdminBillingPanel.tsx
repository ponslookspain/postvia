"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Section, SectionHeader } from "@/components/Section";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TriangleAlertIcon } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Developer test controls. Rendered only when the server verified the
 * admin gate; every action re-checks it server-side (a 403 hides this
 * panel entirely if it was ever rendered by mistake).
 */
export function AdminBillingPanel() {
  const router = useRouter();
  const [state, setState] = useState<{
    subscription: unknown;
    testOverride: unknown;
  } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [mode, setMode] = useState<"BYPASS" | "ENFORCEMENT">("ENFORCEMENT");
  const [plan, setPlan] = useState<PlanId>("growth");
  const [subStatus, setSubStatus] = useState<"ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID">("ACTIVE");
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/billing-override");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      setState(await res.json());
    } catch {
      setError("Failed to load test state");
    }
  }

  useEffect(() => {
    // Initial test-state load on mount (async fetch, not render data).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          plan,
          subStatus,
          cancelAtPeriodEnd,
          currentPeriodEnd: periodEnd || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to apply");
        return;
      }
      toast.add({ title: "Test override applied", type: "success" });
      await load();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function simulateExpiration() {
    setSaving(true);
    setError(null);
    try {
      const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 16);
      const res = await fetch("/api/admin/billing-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "ENFORCEMENT",
          plan,
          subStatus: "ACTIVE",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: past,
        }),
      });
      if (!res.ok) {
        setError("Failed to simulate expiration");
        return;
      }
      toast.add({ title: "Expiration simulated", type: "success" });
      await load();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await fetch("/api/admin/billing-override", { method: "DELETE" });
      toast.add({ title: "Test override cleared", type: "success" });
      await load();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) return null;

  return (
    <Section labelledBy="settings-billing-test">
      <SectionHeader
        id="settings-billing-test"
        title="Developer billing testing"
        description="Admin only. Overrides the effective plan without touching the real subscription."
      />
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Test override</CardTitle>
          <CardDescription>
            Applies immediately and refreshes the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        {state && (
          <pre className="overflow-auto rounded-md border border-border bg-muted/50 p-3 text-xs">
            {JSON.stringify(state, null, 2)}
          </pre>
        )}
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="test-mode">Mode</FieldLabel>
            <Select
              value={mode}
              onValueChange={(value: unknown) =>
                setMode(String(value) === "BYPASS" ? "BYPASS" : "ENFORCEMENT")
              }
            >
              <SelectTrigger id="test-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="ENFORCEMENT">Enforcement</SelectItem>
                  <SelectItem value="BYPASS">Bypass</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="test-plan">Test plan</FieldLabel>
            <Select
              value={plan}
              onValueChange={(value: unknown) =>
                setPlan((value as PlanId) ?? "growth")
              }
            >
              <SelectTrigger id="test-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PLANS.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="test-status">Test status</FieldLabel>
            <Select
              value={subStatus}
              onValueChange={(value: unknown) =>
                setSubStatus(
                  (value as "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID") ?? "ACTIVE"
                )
              }
            >
              <SelectTrigger id="test-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CANCELED">Canceled</SelectItem>
                  <SelectItem value="PAST_DUE">Past due</SelectItem>
                  <SelectItem value="UNPAID">Unpaid</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="test-cancel">Cancel at period end</FieldLabel>
            <Switch
              id="test-cancel"
              checked={cancelAtPeriodEnd}
              onCheckedChange={(checked) => setCancelAtPeriodEnd(checked === true)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="test-end">Current period end (optional)</FieldLabel>
            <Input
              id="test-end"
              type="datetime-local"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void apply()} disabled={saving}>
            {saving ? "Applying…" : "Apply override"}
          </Button>
          <Button variant="outline" onClick={() => void simulateExpiration()} disabled={saving}>
            Simulate expiration
          </Button>
          <Button variant="ghost" onClick={() => void clear()} disabled={saving}>
            Clear
          </Button>
        </div>
        </CardContent>
      </Card>
    </Section>
  );
}
