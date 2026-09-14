"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { PageContainer } from "@/components/layout/PageContainer";
import { ErrorBlock } from "@/components/StateBlock";
import { Button } from "@/components/ui/button";

export default function PostsError({
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
        title="Posts failed to load"
        description="Please try again. Your drafts are kept."
      />
      <div className="mt-4">
        <Button type="button" variant="outline" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </PageContainer>
  );
}
