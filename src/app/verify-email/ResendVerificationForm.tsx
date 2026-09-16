"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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
    <div className="rounded-lg bg-panel p-4">
      <FieldGroup>
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="resend-email">
            Resend verification email
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="resend-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              aria-invalid={Boolean(error) || undefined}
            />
            <Button
              type="button"
              onClick={() => void handleResend()}
              disabled={loading || !email}
              className="shrink-0"
            >
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? "Sending..." : "Send"}
            </Button>
          </div>
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            success && (
              <p className="text-sm text-muted-foreground">
                Verification email sent. Check your inbox.
              </p>
            )
          )}
        </Field>
      </FieldGroup>
    </div>
  );
}
