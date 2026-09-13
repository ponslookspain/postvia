import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPlan, type PlanId } from "@/lib/plans";

/** Compact current-plan marker. Neutral; never a status color. */
export function PlanBadge({
  plan,
  status,
}: {
  plan: PlanId;
  status?: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{getPlan(plan).name}</Badge>
      {status && status !== "ACTIVE" && (
        <Badge
          variant={status === "PAST_DUE" || status === "UNPAID" ? "destructive" : "outline"}
        >
          {status === "CANCELLING"
            ? "Canceling"
            : status === "UNPAID"
              ? "Unpaid"
              : status.charAt(0) + status.slice(1).toLowerCase()}
        </Badge>
      )}
    </span>
  );
}

/** Usage fraction bar. Null limit renders nothing (unlimited plans). */
export function UsageBar({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number | null;
  label: string;
}) {
  if (limit === null) return null;
  const percent = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used}/{limit}
        </span>
      </div>
      <Progress value={percent} aria-label={`${label}: ${used} of ${limit}`} />
    </div>
  );
}

/** Consistent upsell: what is blocked, the limit, and where to fix it. */
export function UpgradeCta({
  reason,
  upgradeTo,
  compact = false,
}: {
  reason: string;
  upgradeTo: PlanId | null;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2 text-xs"
          : "flex flex-col gap-2"
      }
    >
      <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {reason}
        {upgradeTo ? ` Upgrade to ${getPlan(upgradeTo).name} to unlock it.` : ""}
      </p>
      <Button
        size="sm"
        variant={compact ? "link" : "outline"}
        nativeButton={false}
        render={<Link href="/billing" />}
        className={compact ? "h-auto p-0 text-xs" : "w-fit"}
      >
        {upgradeTo ? `Upgrade to ${getPlan(upgradeTo).name}` : "Manage plan"}
      </Button>
    </div>
  );
}
