"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { GoogleButton } from "@/components/GoogleButton";

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
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resending, setResending] = useState(false);

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

    router.push("/dashboard");
    router.refresh();
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
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in to postvia</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Publish to social media in one place
        </p>

        {oauthAccountNotLinked && (
          <div className="mb-4 p-3 rounded-md border border-destructive/30 bg-red-50 text-sm text-destructive">
            This Google account is not linked to an existing account. Please
            sign in with your email and password first.
          </div>
        )}

        {oauthFailed && (
          <div className="mb-4 p-3 rounded-md border border-destructive/30 bg-red-50 text-sm text-destructive">
            Google sign-in failed. Please try again.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-md border border-destructive/30 bg-red-50 text-sm text-destructive">
            {error}
          </div>
        )}

        {(deleted || passwordChanged) && (
          <div className="mb-4 p-3 rounded-md border border-border bg-muted/50 text-sm">
            {deleted
              ? "Your account has been deleted."
              : "Password changed. Please sign in again."}
          </div>
        )}

        {emailNotVerified && (
          <div className="mb-4 p-3 rounded-md border border-amber-300/50 bg-amber-50 text-sm text-amber-800">
            <p className="mb-2">
              Your email address has not been verified yet.
            </p>
            {resendSuccess ? (
              <p className="font-medium">
                Verification email sent. Check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={resending}
                className="underline font-medium disabled:opacity-40"
              >
                {resending ? "Sending..." : "Resend verification email"}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <GoogleButton />

        <p className="mt-6 text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium hover:underline">
            Sign up
          </Link>
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          <Link href="/terms" className="hover:underline">
            Terms of Service
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
