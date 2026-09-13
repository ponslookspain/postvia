"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { GoogleButton } from "@/components/GoogleButton";
import { AuthShell } from "@/components/AuthShell";
import type { PlanId } from "@/lib/plans";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export function SignupForm({ plan = null }: { plan?: PlanId | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Server persists the paid plan hint into User.selectedPlan
      // (authoritative intent); the ?plan=/localStorage channel is only a
      // hint and never billing state.
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mode: "signup", plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Unable to continue. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push(`/verify-otp?${new URLSearchParams({ email, mode: "signup" })}`);
    } catch {
      setError("Unable to continue. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="Enter your email to get started"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby="signup-legal"
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? "Sending code..." : "Continue"}
            </Button>
            <p id="signup-legal" className="text-xs text-muted-foreground">
              By continuing, you agree to Postvia&apos;s{" "}
              <Link href="/terms" className="hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </FieldGroup>
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton newUserCallbackURL="/post-auth" callbackURL="/post-auth" />

        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
