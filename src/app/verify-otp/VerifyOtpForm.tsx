"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/AuthShell";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  OTP_RATE_LIMITED_CODE,
  formatOtpRateLimitMessage,
  normalizeRetryAfterSeconds,
} from "@/lib/otp-rate-limit";
import { useOtpRetryCountdown } from "@/hooks/use-otp-retry-countdown";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function mapOtpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("expired")) {
    return "This code has expired. Request a new one below.";
  }
  if (lower.includes("too many") || lower.includes("attempt")) {
    return "Too many wrong attempts. Request a new code below.";
  }
  if (lower.includes("invalid") || lower.includes("incorrect")) {
    return "Incorrect code. Check the email and try again.";
  }
  if (lower.includes("not found") || lower.includes("no account")) {
    return "This code doesn't match an account. Start again from sign up or sign in.";
  }
  return "Unable to verify the code. Check it and try again.";
}

export function VerifyOtpForm({
  email,
  mode,
}: {
  email: string;
  mode: "signup" | "login";
}) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resendRateLimited, setResendRateLimited] = useState(false);
  const { remaining: resendRetryRemaining, start: startResendRetryCountdown } =
    useOtpRetryCountdown();

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    const code = otp.replace(/[\s-]/g, "");
    try {
      // Outer attempt shell first (defense in depth; authoritative attempts
      // stay inside the plugin). Fail-open: a 500 here never blocks verify.
      try {
        const pre = await fetch("/api/auth/otp/pre-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (pre.status === 429) {
          setError("Too many wrong attempts. Request a new code below.");
          setVerifying(false);
          return;
        }
      } catch {
        // Pre-check is advisory; continue to the authoritative verify.
      }
      if (mode === "signup") {
        // New account: marks emailVerified and signs the session in.
        // The /post-auth gate routes to onboarding next.
        const { error: verifyError } = await authClient.emailOtp.verifyEmail({
          email,
          otp: code,
        });
        if (verifyError) {
          setError(mapOtpError(verifyError.message || ""));
          setVerifying(false);
          return;
        }
      } else {
        // Existing account only: disableSignUp guarantees no new User is
        // ever minted here (server rejects unknown emails).
        const { error: signInError } = await authClient.signIn.emailOtp({
          email,
          otp: code,
        });
        if (signInError) {
          setError(mapOtpError(signInError.message || ""));
          setVerifying(false);
          return;
        }
      }
      router.push("/post-auth");
      router.refresh();
    } catch {
      setError("Unable to verify the code. Check it and try again.");
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendRetryRemaining > 0) return;
    setResending(true);
    setResendNote(null);
    setError(null);
    setResendRateLimited(false);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const retryAfter = normalizeRetryAfterSeconds(data.retryAfterSeconds);
        if (res.status === 429 && data.code === OTP_RATE_LIMITED_CODE && retryAfter !== null) {
          // Same structured response as signup/login; countdown is
          // display-only, the next resend is still server-gated.
          setResendRateLimited(true);
          setError(formatOtpRateLimitMessage(retryAfter));
          startResendRetryCountdown(retryAfter);
        } else {
          setError("Unable to resend the code. Please try again.");
        }
      } else {
        setResendNote("New code sent. Check your inbox.");
      }
    } catch {
      setError("Unable to resend the code. Please try again.");
    }
    setResending(false);
  }

  return (
    <AuthShell
      title="Check your email"
      description={`We sent a 6-digit code to ${email}. Enter it below.`}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert color="error" variant="outline">
            <TriangleAlertIcon />
            <AlertContent>
              <AlertTitle>
                {resendRateLimited ? "Too many code requests" : "Verification failed"}
              </AlertTitle>
              <AlertDescription aria-live="polite">
                {resendRateLimited && resendRetryRemaining > 0
                  ? formatOtpRateLimitMessage(resendRetryRemaining)
                  : error}
              </AlertDescription>
            </AlertContent>
          </Alert>
        )}
        {resendNote && (
          <Alert color="neutral" variant="outline">
            <MailCheckIcon />
            <AlertContent>
              <AlertTitle>Code sent</AlertTitle>
              <AlertDescription>{resendNote}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
        <form onSubmit={(e) => void handleVerify(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="otp">6-digit code</FieldLabel>
              <Input
                id="otp"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                minLength={6}
                maxLength={8}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="text-center tracking-widest"
              />
            </Field>
            <Button type="submit" disabled={verifying} className="w-full">
              {verifying && <Spinner data-icon="inline-start" />}
              {verifying ? "Verifying..." : mode === "signup" ? "Verify & continue" : "Sign in"}
            </Button>
          </FieldGroup>
        </form>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleResend()}
          disabled={resending || resendRetryRemaining > 0}
          className="w-full"
        >
          {resending && <Spinner data-icon="inline-start" />}
          {resending
            ? "Sending..."
            : resendRetryRemaining > 0
              ? `Wait ${resendRetryRemaining}s`
              : "Resend code"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Wrong email?{" "}
          <Link href={mode === "signup" ? "/signup" : "/login"} className="hover:underline">
            Start over
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
