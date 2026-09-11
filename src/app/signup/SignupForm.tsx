"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message || "Unable to create account");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Create your account</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Start publishing to X and Threads
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-md border border-destructive/30 bg-red-50 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              At least 8 characters
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
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
    </div>
  );
}