"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function ResendVerificationForm() {
  const searchParams = useSearchParams();
  const queryEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(queryEmail);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSuccess(true);
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to resend. Please try again.");
      }
    } catch {
      setError("Failed to resend. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="mt-6 border border-border rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-2">Resend verification email</h2>
      {success ? (
        <p className="text-sm text-muted-foreground">
          Verification email sent. Check your inbox.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={loading || !email}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
