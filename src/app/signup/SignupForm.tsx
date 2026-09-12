"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { GoogleButton } from "@/components/GoogleButton";
import { AuthShell } from "@/components/AuthShell";
import { PLAN_STORAGE_KEY, type PlanId } from "@/lib/plans";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export function SignupForm({ plan = null }: { plan?: PlanId | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resending, setResending] = useState(false);

  // Paid plan intent from the landing (?plan=); free signups carry none.
  const planQuery = plan && plan !== "free" ? `?plan=${plan}` : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Persist a paid plan intent for the billing step (test mode: local
    // only, no backend). Free signups land straight on the dashboard.
    if (plan && plan !== "free") {
      try {
        localStorage.setItem(PLAN_STORAGE_KEY, plan);
      } catch {
        // Private mode: the ?plan= URL param still carries it forward.
      }
    }
    const { data, error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: "/verify-email",
    });

    if (signUpError) {
      setError(signUpError.message || "Unable to create account");
      setSubmitting(false);
      return;
    }

    if (data && !data.token) {
      setCheckEmail(true);
      setSubmitting(false);
      return;
    }

    router.push(plan && plan !== "free" ? `/billing${planQuery}` : "/dashboard");
    router.refresh();
  }

  async function handleResend() {
    setResending(true);
    setResendSuccess(false);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setResendSuccess(true);
      else setError("Failed to resend. Please try again.");
    } catch {
      setError("Failed to resend. Please try again.");
    }
    setResending(false);
  }

  if (checkEmail) {
    return (
      <AuthShell
        title="Check your email"
        description={`We sent a verification link to ${email}. Please verify your email to continue.`}
      >
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Verification link sent</EmptyTitle>
            <EmptyDescription>
              {resendSuccess
                ? "Verification email sent. Check your inbox."
                : "Didn't get it? Ask for another one."}
            </EmptyDescription>
          </EmptyHeader>
          {!resendSuccess && (
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleResend()}
                disabled={resending}
              >
                {resending && <Spinner data-icon="inline-start" />}
                {resending ? "Sending..." : "Resend verification email"}
              </Button>
            </EmptyContent>
          )}
        </Empty>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Verified already?{" "}
          <Link href="/login" className="hover:underline">
            Sign in
          </Link>
        </p>
        <Button
          nativeButton={false}
          render={
            <Link
              href={
                plan && plan !== "free" ? `/billing${planQuery}` : "/dashboard"
              }
            />
          }
          className="mt-4 w-full"
          variant="outline"
        >
          Continue{plan && plan !== "free" ? " to billing" : " to dashboard"}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      description="Publish to social media in one place"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Sign-up failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldDescription>At least 8 characters</FieldDescription>
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? "Creating account..." : "Sign up"}
            </Button>
          </FieldGroup>
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton />

        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          By signing up you agree to the{" "}
          <Link href="/terms" className="hover:underline">
            Terms of Service
          </Link>
          <span className="mx-1">and</span>
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
