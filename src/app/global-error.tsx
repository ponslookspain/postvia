"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

// Root error boundary: catches render failures for the whole app.
// Hardcoded strings only — providers above may have crashed.
// Server-side logging happens where the error is thrown; here we only
// forward the client-side boundary event to Sentry.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Please try again. If the problem continues, come back later.
          </p>
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
