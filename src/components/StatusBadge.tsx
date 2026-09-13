import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/lib/utils";

/**
 * Post status language. One dot + one label everywhere: post lists,
 * calendar chips and detail headers share this mapping so a status
 * reads the same at every size.
 *
 * Dots carry the hue; badge shells stay quiet (neutral outline) except
 * Failed, which uses the destructive tint. Signal indigo is reserved
 * for Scheduled, the only state that promises future action.
 */
const DOT_CLASS: Record<string, string> = {
  DRAFT: "bg-muted-foreground",
  SCHEDULED: "bg-signal",
  PUBLISHING: "animate-pulse bg-warning",
  PUBLISHED: "bg-success",
  PARTIALLY_PUBLISHED: "bg-warning",
  FAILED: "bg-destructive",
};

export function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        DOT_CLASS[status] ?? "bg-muted-foreground",
        className
      )}
    />
  );
}

const BADGE_VARIANT = {
  DRAFT: "outline",
  SCHEDULED: "outline",
  PUBLISHING: "secondary",
  PUBLISHED: "secondary",
  PARTIALLY_PUBLISHED: "secondary",
  FAILED: "destructive",
} as const;

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant={
        BADGE_VARIANT[status as keyof typeof BADGE_VARIANT] ?? "outline"
      }
      className={cn(
        status === "SCHEDULED" &&
          "border-signal/30 bg-signal/10 text-signal dark:text-signal",
        status === "PUBLISHED" &&
          "border-success/30 bg-success/10 text-success dark:text-success",
        status === "PUBLISHING" &&
          "border-warning/30 bg-warning/10 text-warning dark:text-warning",
        status === "PARTIALLY_PUBLISHED" &&
          "border-warning/30 bg-warning/10 text-warning dark:text-warning",
        className
      )}
    >
      <StatusDot
        status={status}
        className={cn(status === "PUBLISHING" && "animate-pulse")}
      />
      {formatStatusLabel(status)}
    </Badge>
  );
}
