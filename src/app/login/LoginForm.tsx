"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { GoogleButton } from "@/components/GoogleButton";
import { AuthShell } from "@/components/AuthShell";
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

export function LoginForm({
  deleted = false,
  passwordChanged = false,
}: {
  deleted?: boolean;
  passwordChanged?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const oauthAccountNotLinked = oauthError === "account_not_linked";
  const oauthFailed = oauthError !== null && !oauthAccountNotLinked;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpRateLimited, setOtpRateLimited] = useState(false);
  const { remaining: otpRetryRemaining, start: startOtpRetryCountdown } =
    useOtpRetryCountdown();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setEmailNotVerified(false);
    setResendSuccess(false);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    if (signInError) {
      if (
        signInError.message?.toLowerCase().includes("email not verified") ||
        signInError.status === 403
      ) {
        setEmailNotVerified(true);
        setSubmitting(false);
        return;
      }
      setError(signInError.message || "Unable to sign in");
      setSubmitting(false);
      return;
    }

    // Post-auth routing is server-side (onboarding/billing/dashboard).
    router.push("/post-auth");
    router.refresh();
  }

  async function handleSignInWithCode() {
    if (!email) {
      setError("Enter your email first, then request a code.");
      return;
    }
    if (otpRetryRemaining > 0) return;
    setSendingCode(true);
    setError(null);
    setOtpRateLimited(false);
    try {
      // Neutral endpoint: same response for existing and unknown emails,
      // so this button is not an enumeration oracle. Unknown emails simply
      // receive no code; the verify screen then rejects the attempt.
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mode: "login" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const retryAfter = normalizeRetryAfterSeconds(data.retryAfterSeconds);
        if (res.status === 429 && data.code === OTP_RATE_LIMITED_CODE && retryAfter !== null) {
          setOtpRateLimited(true);
          setError(formatOtpRateLimitMessage(retryAfter));
          startOtpRetryCountdown(retryAfter);
        } else {
          setError(data.error || "Unable to send code. Please try again.");
        }
        setSendingCode(false);
        return;
      }
      router.push(`/verify-otp?${new URLSearchParams({ email, mode: "login" })}`);
    } catch {
      setError("Unable to send code. Please try again.");
      setSendingCode(false);
    }
  }

  async function handleResendVerification() {
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

  return (
    <AuthShell
      title="Sign in to postvia"
      description="Publish to social media in one place"
    >
      <div className="flex flex-col gap-4">
        {oauthAccountNotLinked && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Account not linked</AlertTitle>
            <AlertDescription>
              This Google account is not linked to an existing account. Please
              sign in with your email and password first.
            </AlertDescription>
          </Alert>
        )}

        {oauthFailed && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>
              Google sign-in failed. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>
              {otpRateLimited ? "Too many code requests" : "Sign-in failed"}
            </AlertTitle>
            <AlertDescription aria-live="polite">
              {otpRateLimited && otpRetryRemaining > 0
                ? formatOtpRateLimitMessage(otpRetryRemaining)
                : error}
            </AlertDescription>
          </Alert>
        )}

        {(deleted || passwordChanged) && (
          <Alert>
            <AlertDescription>
              {deleted
                ? "Your account has been deleted."
                : "Password changed. Please sign in again."}
            </AlertDescription>
          </Alert>
        )}

        {emailNotVerified && (
          <Alert>
            <AlertTitle>Email not verified</AlertTitle>
            <AlertDescription>
              Your email address has not been verified yet.{" "}
              {resendSuccess ? (
                <>Verification email sent. Check your inbox.</>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => void handleResendVerification()}
                  disabled={resending}
                  className="h-auto p-0 text-sm"
                >
                  {resending ? "Sending..." : "Resend verification email"}
                </Button>
              )}
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
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={sendingCode || submitting || otpRetryRemaining > 0}
              onClick={() => void handleSignInWithCode()}
              className="w-full"
            >
              {sendingCode && <Spinner data-icon="inline-start" />}
              {sendingCode
                ? "Sending code..."
                : otpRetryRemaining > 0
                  ? `Wait ${otpRetryRemaining}s`
                  : "Sign in with a code"}
            </Button>
            <p className="text-xs text-muted-foreground">
              No password yet? Use{" "}
              <span className="font-medium">Sign in with a code</span> — we will
              email you a 6-digit code.
            </p>
          </FieldGroup>
        </form>

        <FieldSeparator>Or continue with</FieldSeparator>

        <GoogleButton newUserCallbackURL="/post-auth" callbackURL="/post-auth" />

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium hover:underline">
            Sign up
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/terms" className="hover:underline">
            Terms of Service
          </Link>
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
