import type { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared async states. Every loading, empty and error view composes
 * from these so Dashboard, Calendar, Posts, Accounts, Billing and
 * Settings fail and recover in the same voice: plain verbs, sentence
 * case, one job per message. Errors explain what happened and how to
 * fix it; empty screens invite the next action.
 */

/** Skeleton stack matching the surrounding container width. */
export function LoadingBlock({
  rows = 3,
  rowClassName = "h-24 w-full",
  className,
  label = "Loading",
}: {
  rows?: number;
  rowClassName?: string;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn("flex flex-col gap-4", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={rowClassName} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Inline failure with a fix, not an apology. */
export function ErrorBlock({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={className}>
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        {action && <span className="mt-2 block">{action}</span>}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Empty moment with one invitation to act. Icon renders at 16px;
 * actions stack on 375px and sit side by side from sm up.
 */
export function EmptyBlock({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {actions && (
        <EmptyContent>
          <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
            {actions}
          </div>
        </EmptyContent>
      )}
    </Empty>
  );
}
