"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { GoogleButton } from "@/components/GoogleButton";
import { AuthShell } from "@/components/AuthShell";
import type { PlanId } from "@/lib/plans";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  OTP_RATE_LIMITED_CODE,
  formatOtpRateLimitMessage,
  normalizeRetryAfterSeconds,
  useOtpRetryCountdown,
} from "@/lib/otp-rate-limit";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function SignupForm({ plan = null }: { plan?: PlanId | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { remaining: retryRemaining, start: startRetryCountdown } =
    useOtpRetryCountdown();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (retryRemaining > 0) return;
    setSubmitting(true);
    setError(null);
    setRateLimited(false);
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
        const retryAfter = normalizeRetryAfterSeconds(data.retryAfterSeconds);
        if (res.status === 429 && data.code === OTP_RATE_LIMITED_CODE && retryAfter !== null) {
          // Server is the sole limiter; the countdown is display-only and
          // the next submit is re-checked server-side.
          setRateLimited(true);
          setError(formatOtpRateLimitMessage(retryAfter));
          startRetryCountdown(retryAfter);
        } else {
          setError(data.error || "Unable to continue. Please try again.");
        }
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
            <AlertTitle>
              {rateLimited ? "Too many code requests" : "Something went wrong"}
            </AlertTitle>
            <AlertDescription aria-live="polite">
              {rateLimited && retryRemaining > 0
                ? formatOtpRateLimitMessage(retryRemaining)
                : error}
            </AlertDescription>
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
            <Button
              type="submit"
              disabled={submitting || retryRemaining > 0}
              className="w-full"
            >
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting
                ? "Sending code..."
                : retryRemaining > 0
                  ? `Wait ${retryRemaining}s`
                  : "Continue"}
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

        <FieldSeparator>Or continue with</FieldSeparator>

        <GoogleButton newUserCallbackURL="/post-auth" callbackURL="/post-auth" />

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
