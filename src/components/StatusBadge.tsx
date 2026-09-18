import { cn, formatStatusLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Post status language. One dot + one label everywhere: post lists,
 * calendar chips and detail headers share this mapping so a status
 * reads the same at every size.
 *
 * Dots carry the hue; badge shells stay quiet (neutral outline) except
 * Failed, which uses the error tint. Scheduled uses info blue — the same
 * hue as the primary brand action, but only as a status dot/badge tint,
 * so a routine future-dated post never reads as a warning.
 */
const DOT_CLASS: Record<string, string> = {
  DRAFT: "bg-muted-foreground",
  SCHEDULED: "bg-info",
  PUBLISHING: "animate-pulse bg-warning",
  PUBLISHED: "bg-success",
  PARTIALLY_PUBLISHED: "bg-warning",
  FAILED: "bg-error",
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

// PostVIA status mapping: quiet outline shells, soft neutral fills.
// The label text is always neutral (text-foreground): status hues live in
// the dot and the tinted shell, which are decorative next to the label.
// Colored running text on those tints fails 4.5:1 in both themes
// (measured 2026-09), while neutral text on the same shells passes easily.
const BADGE_STYLE: Record<string, { variant: "outline" | "soft" }> = {
  DRAFT: { variant: "outline" },
  SCHEDULED: { variant: "outline" },
  PUBLISHING: { variant: "soft" },
  PUBLISHED: { variant: "soft" },
  PARTIALLY_PUBLISHED: { variant: "soft" },
  FAILED: { variant: "soft" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const style = BADGE_STYLE[status] ?? { variant: "outline" as const };
  return (
    <Badge
      variant={style.variant}
      className={cn(
        status === "SCHEDULED" && "border-info/30 bg-info/10",
        status === "PUBLISHED" && "border-success/30 bg-success/10",
        status === "PUBLISHING" &&
          "border-warning/30 bg-warning/10",
        status === "PARTIALLY_PUBLISHED" &&
          "border-warning/30 bg-warning/10",
        status === "FAILED" && "border-error/30 bg-error-accent",
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
