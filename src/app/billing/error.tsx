"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { PageContainer } from "@/components/layout/PageContainer";
import { ErrorBlock } from "@/components/StateBlock";
import { Button } from "@/components/ui/button";

export default function BillingError({
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
    <PageContainer>
      <ErrorBlock
        title="Billing failed to load"
        description="No charge was made. Please try again — the webhook remains the source of truth for your plan."
      />
      <div className="mt-4">
        <Button type="button" variant="outline" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </PageContainer>
  );
}
