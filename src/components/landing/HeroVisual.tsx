import { CalendarClockIcon, CheckIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge, StatusDot } from "@/components/StatusBadge";

const channelRows = [
  {
    platform: "INSTAGRAM",
    handle: "@studio",
    detail: "1 photo · caption 184/2,200",
    status: "SCHEDULED",
  },
  {
    platform: "THREADS",
    handle: "@studio",
    detail: "Full story · 184/500",
    status: "SCHEDULED",
  },
  {
    platform: "TIKTOK",
    handle: "@studio.clips",
    detail: "Video + title · ready",
    status: "SCHEDULED",
  },
  {
    platform: "X",
    handle: "@studio",
    detail: "Trimmed · 184/280 · publishes now",
    status: "PUBLISHING",
  },
] as const;

const weekStrip = [
  { day: "M", active: false, dot: "bg-success" },
  { day: "T", active: false, dot: "bg-success" },
  { day: "W", active: true, dot: "bg-signal" },
  { day: "T", active: false, dot: null },
  { day: "F", active: false, dot: "bg-signal" },
  { day: "S", active: false, dot: null },
  { day: "S", active: false, dot: null },
] as const;

/**
 * Composed product visual for the hero. Built only from installed
 * primitives (Card, Badge, StatusBadge, PlatformIcon, Avatar) and real
 * Postvia concepts: one caption, per-channel adaptations with limits,
 * and per-account publish status. Decorative, labelled as an image.
 */
export function HeroVisual() {
  return (
    <div
      role="img"
      aria-label="Postvia composer preview: one caption adapted for Instagram, Threads, TikTok and X, scheduled for Wednesday at 09:00"
      className="relative mx-auto w-full max-w-5xl"
    >
      <Card className="overflow-hidden text-left">
        <CardContent className="p-0">
          {/* Composer header */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 md:px-6">
            <Avatar className="size-9">
              <AvatarFallback>ST</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                Morning launch is live — our biggest update yet
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClockIcon className="size-3.5" aria-hidden="true" />
                Wed 09:00 · Europe/Madrid
              </p>
            </div>
            <StatusBadge status="SCHEDULED" />
          </div>

          {/* Channel adaptations */}
          <ul className="divide-y divide-border">
            {channelRows.map((row, index) => (
              <li
                key={row.platform}
                style={{ animationDelay: `${350 + index * 120}ms` }}
                className="flex animate-[post-in_.5s_ease_both] items-center gap-3 px-4 py-3 transition-colors duration-200 motion-reduce:animate-none motion-reduce:transition-none hover:bg-muted/40 md:px-6"
              >
                <PlatformIcon platform={row.platform} className="size-4.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {row.handle}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.detail}
                  </span>
                </span>
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <StatusDot status={row.status} />
                  {row.status === "SCHEDULED" ? "Queued" : "Sending"}
                </span>
                <CheckIcon
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
              </li>
            ))}
          </ul>

          {/* Week strip */}
          <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-3 md:px-6">
            <div
              aria-hidden="true"
              className="flex flex-1 items-center gap-1.5"
            >
              {weekStrip.map((slot, i) => (
                <span
                  key={i}
                  className={
                    slot.active
                      ? "flex h-8 flex-1 flex-col items-center justify-center gap-1 rounded-lg bg-signal/10 text-[11px] font-medium text-signal ring-1 ring-signal/30 ring-inset"
                      : "flex h-8 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] text-muted-foreground"
                  }
                >
                  {slot.day}
                  <span
                    className={`size-1 rounded-full ${slot.dot ?? "bg-transparent"}`}
                  />
                </span>
              ))}
            </div>
            <Badge variant="soft" className="shrink-0">
              3 posts this week
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Floating outcome card — the only overlap on the page */}
      <div
        aria-hidden="true"
        style={{ animationDelay: "900ms" }}
        className="absolute -right-3 -bottom-6 hidden animate-[post-in_.5s_ease_both] motion-reduce:animate-none sm:block md:-right-8"
      >
        <div className="flex items-center gap-2.5 rounded-xl bg-panel px-3.5 py-2.5 shadow-lg shadow-foreground/5">
          <span className="flex size-7 items-center justify-center rounded-full bg-success/10">
            <CheckIcon className="size-4 text-success" />
          </span>
          <span>
            <span className="block text-xs font-medium">
              One post, four outcomes
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Queued for Wed 09:00
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
