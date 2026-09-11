"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm({
  deleted = false,
  passwordChanged = false,
}: {
  deleted?: boolean;
  passwordChanged?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message || "Unable to sign in");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in to postvia</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Publish to social media in one place
        </p>

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