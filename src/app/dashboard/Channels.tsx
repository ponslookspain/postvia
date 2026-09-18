import { PlatformIcon } from "@/components/PlatformIcon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatPlatformName } from "@/lib/utils";
import type { ChannelRow } from "@/lib/dashboard-types";

export type { ChannelRow };

/**
 * Where posts go, said plainly. Success-rate bars used to live here;
 * they read as a quarterly report, and a broken connection — the only
 * thing anyone can act on — got the same weight as a percentage.
 */
export function Channels({ rows }: { rows: ChannelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No channels connected yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1 border-t border-border pt-1">
      {rows.map((row) => (
        <li key={row.platform} className="flex items-center gap-3 py-2">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback aria-label={formatPlatformName(row.platform)}>
              <PlatformIcon platform={row.platform} className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-5 font-medium">
              {formatPlatformName(row.platform)}
            </p>
            <p className="truncate text-xs leading-4 text-muted-foreground">
              {row.usernames.map((name) => `@${name}`).join(", ")}
              {" · "}
              {row.published === 0
                ? "nothing sent yet"
                : row.lastPublishedLabel
                  ? `last post ${row.lastPublishedLabel}`
                  : `${row.published} sent`}
            </p>
          </div>
          {row.expired && (
            <Badge color="error" variant="soft" className="shrink-0">
              Reconnect
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
