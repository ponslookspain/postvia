import { PlatformIcon } from "@/components/PlatformIcon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPlatformName } from "@/lib/utils";

export type PlatformHealthRow = {
  platform: string;
  usernames: string[];
  expired: boolean;
  published: number;
  successRate: number | null;
  lastPublishedLabel: string | null;
};

/**
 * Compact per-platform breakdown: publish totals, target-level success
 * rate and connection state. Expired connections surface here next to
 * the numbers they affect.
 */
export function PlatformHealth({ rows }: { rows: PlatformHealthRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a profile to start publishing.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li
          key={row.platform}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <Avatar className="size-9 shrink-0">
            <AvatarFallback aria-label={formatPlatformName(row.platform)}>
              <PlatformIcon platform={row.platform} className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {formatPlatformName(row.platform)}
              <span className="font-normal text-muted-foreground tabular-nums">
                {" "}
                · {row.published} published
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.usernames.map((name) => `@${name}`).join(", ")}
              {row.lastPublishedLabel
                ? ` · last published ${row.lastPublishedLabel}`
                : ""}
            </p>
            {row.successRate !== null && (
              <Progress
                value={row.successRate}
                aria-label={`${formatPlatformName(row.platform)} publishing success rate: ${row.successRate} percent`}
                className="mt-1.5 h-1.5 max-w-44"
              />
            )}
          </div>
          {row.expired ? (
            <Badge color="error" variant="soft" className="shrink-0">
              Expired
            </Badge>
          ) : (
            <Badge variant="soft" className="shrink-0 tabular-nums">
              {row.successRate === null
                ? "Connected"
                : `${row.successRate}% success`}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
