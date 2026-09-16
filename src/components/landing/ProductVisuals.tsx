import { CalendarClockIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge, StatusDot } from "@/components/StatusBadge";

/**
 * Faithful static recreations of real Postvia screens for the landing
 * page. They mirror production UI language (calendar chip geometry,
 * composer rail, accounts rows) without wiring any app logic.
 * Each visual is a labelled image; inner markup is hidden from AT.
 */

const shellClass =
  "overflow-hidden rounded-2xl border border-border bg-card text-left";

/* ---------------------------------- accounts --------------------------------- */

const accountRows = [
  { platform: "INSTAGRAM", name: "Instagram", user: "@studio", state: "ok" },
  { platform: "THREADS", name: "Threads", user: "@studio", state: "ok" },
  { platform: "TIKTOK", name: "TikTok", user: "@studio.clips", state: "attention" },
  { platform: "X", name: "X", user: "@studio", state: "ok" },
] as const;

export function AccountsVisual() {
  return (
    <div
      role="img"
      aria-label="Postvia accounts screen: Instagram, Threads and X connected, TikTok needing reconnection"
      className={shellClass}
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 md:px-5">
          <p className="text-[15px] font-medium">Social accounts</p>
          <Badge variant="soft">Official OAuth</Badge>
        </div>
        <ul className="divide-y divide-border">
          {accountRows.map((row) => (
            <li
              key={row.platform}
              className="flex items-center gap-3 px-4 py-3 md:px-5"
            >
              <Avatar className="size-8">
                <AvatarFallback className="text-[11px]">
                  {row.user.replace("@", "").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <PlatformIcon platform={row.platform} className="size-3.5" />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.user}
                </span>
              </span>
              {row.state === "ok" ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot status="PUBLISHED" />
                  Connected
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusDot status="FAILED" />
                  <Badge variant="outline">Reconnect</Badge>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground md:px-5">
          Postvia stores access tokens — never your social passwords.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- composer --------------------------------- */

const railRows = [
  { platform: "INSTAGRAM", user: "@studio", tag: "Customized", detail: "Caption 184/2,200" },
  { platform: "THREADS", user: "@studio", tag: "Global", detail: "Full story 184/500" },
  { platform: "TIKTOK", user: "@studio.clips", tag: "Customized", detail: "Video + title" },
  { platform: "X", user: "@studio", tag: "Customized", detail: "Trimmed 184/280" },
] as const;

export function ComposerVisual() {
  return (
    <div
      role="img"
      aria-label="Postvia composer: global caption with attached video, per-account previews and a scheduled publish card"
      className={shellClass}
    >
      {/* Stacked like the real mobile composer: editor, then preview rail. */}
      <div aria-hidden="true" className="grid">
        {/* Editor */}
        <div className="min-w-0 border-b border-border p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">Channels · 4 selected</p>
          <p className="mt-3 text-[15px] leading-relaxed">
            Morning launch is live — our biggest update yet. Here is
            everything that changed and why it matters for your week.
          </p>
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            184 characters
          </p>
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
              <ImageIcon className="size-4 text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                launch-day.mp4
              </span>
              <span className="block text-[11px] text-muted-foreground">
                1 video · per-network rules apply
              </span>
            </span>
            <CheckIcon className="size-4 shrink-0 text-success" />
          </div>
        </div>
        {/* Rail */}
        <div className="min-w-0 bg-muted/30 p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {railRows.map((row) => (
              <li
                key={row.platform}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
              >
                <PlatformIcon platform={row.platform} className="size-3.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {row.user}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {row.detail}
                  </span>
                </span>
                <Badge variant="soft" className="shrink-0">
                  {row.tag}
                </Badge>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 rounded-lg border border-border bg-card px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <CalendarClockIcon className="size-3.5 text-muted-foreground" />
              Wed 09:00 · Europe/Madrid
            </p>
            <span className="mt-2 flex h-8 items-center justify-center rounded-4xl bg-primary px-3 text-[13px] font-medium text-primary-foreground">
              Schedule
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- calendar --------------------------------- */

type Chip = {
  title: string;
  time: string;
  status: "PUBLISHED" | "SCHEDULED" | "PUBLISHING" | "FAILED";
  platforms: readonly ("INSTAGRAM" | "THREADS" | "TIKTOK" | "X")[];
};

type Day = {
  day: number;
  dimmed?: boolean;
  today?: boolean;
  chips?: Chip[];
  more?: number;
};

const monthWeeks: Day[][] = [
  [
    { day: 23, dimmed: true }, { day: 24, dimmed: true }, { day: 25, dimmed: true },
    { day: 26, dimmed: true }, { day: 27, dimmed: true }, { day: 28, dimmed: true },
    { day: 1, chips: [{ title: "March kickoff", time: "09:00", status: "PUBLISHED", platforms: ["INSTAGRAM", "THREADS"] }] },
  ],
  [
    { day: 2, chips: [{ title: "Launch teaser", time: "09:00", status: "PUBLISHED", platforms: ["INSTAGRAM", "THREADS", "TIKTOK"] }] },
    { day: 3, chips: [{ title: "Teaser clip", time: "14:00", status: "PUBLISHED", platforms: ["TIKTOK"] }] },
    {
      day: 4,
      chips: [
        { title: "Launch day video", time: "09:00", status: "SCHEDULED", platforms: ["INSTAGRAM", "THREADS", "TIKTOK"] },
        { title: "Launch thread", time: "11:30", status: "SCHEDULED", platforms: ["THREADS", "X"] },
        { title: "Founder note", time: "18:00", status: "SCHEDULED", platforms: ["X"] },
      ],
      more: 2,
    },
    { day: 5, chips: [{ title: "Press quotes", time: "10:00", status: "SCHEDULED", platforms: ["THREADS"] }] },
    { day: 6, chips: [{ title: "Demo reel", time: "09:00", status: "SCHEDULED", platforms: ["INSTAGRAM", "TIKTOK"] }] },
    { day: 7 },
    { day: 8 },
  ],
  [
    { day: 9, chips: [{ title: "Behind the scenes", time: "09:00", status: "SCHEDULED", platforms: ["INSTAGRAM", "TIKTOK"] }] },
    { day: 10 },
    { day: 11, chips: [{ title: "Product demo", time: "12:00", status: "SCHEDULED", platforms: ["TIKTOK", "X"] }] },
    {
      day: 12, today: true,
      chips: [
        { title: "Launch recap", time: "09:00", status: "PUBLISHING", platforms: ["INSTAGRAM", "THREADS"] },
        { title: "Recap clip", time: "15:00", status: "FAILED", platforms: ["X"] },
      ],
    },
    { day: 13, chips: [{ title: "Community post", time: "18:00", status: "SCHEDULED", platforms: ["THREADS", "X"] }] },
    { day: 14 },
    { day: 15 },
  ],
  [
    { day: 16, chips: [{ title: "Weekly update", time: "09:00", status: "SCHEDULED", platforms: ["THREADS", "X"] }] },
    { day: 17 },
    { day: 18, chips: [{ title: "Customer story", time: "11:00", status: "SCHEDULED", platforms: ["INSTAGRAM"] }] },
    { day: 19 },
    { day: 20, chips: [{ title: "Feature highlight", time: "09:00", status: "SCHEDULED", platforms: ["TIKTOK"] }] },
    { day: 21 },
    { day: 22 },
  ],
  [
    { day: 23 }, { day: 24 }, { day: 25 }, { day: 26 }, { day: 27 }, { day: 28 }, { day: 29 },
  ],
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function DayChip({ chip }: { chip: Chip }) {
  return (
    <span className="hidden h-6 min-w-0 items-center gap-1.5 rounded-md bg-muted/70 px-1.5 sm:flex">
      <StatusDot status={chip.status} />
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {chip.time}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{chip.title}</span>
      <span className="hidden shrink-0 items-center lg:flex" aria-hidden="true">
        {chip.platforms.slice(0, 2).map((platform) => (
          <PlatformIcon key={platform} platform={platform} className="size-3" />
        ))}
      </span>
    </span>
  );
}

export function CalendarVisual() {
  return (
    <div
      role="img"
      aria-label="Postvia content calendar for March: scheduled chips across the month, today showing one publishing and one failed post"
      className={shellClass}
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <span className="flex items-center gap-0.5">
            <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
              <ChevronLeftIcon className="size-4" />
            </span>
            <span className="text-sm font-medium">March 2026</span>
            <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
              <ChevronRightIcon className="size-4" />
            </span>
          </span>
          <span className="rounded-4xl border border-border px-3 py-1 text-xs font-medium">
            Today
          </span>
        </div>
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="px-1 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
            >
              <span className="sm:hidden">{day.slice(0, 1)}</span>
              <span className="hidden sm:inline">{day}</span>
            </span>
          ))}
        </div>
        <div>
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map((date, di) => (
                <div
                  key={di}
                  className={
                    "min-h-9 border-r border-border/70 p-0.5 last:border-r-0 sm:min-h-[4.5rem] sm:p-1" +
                    (date.today ? " bg-signal/[0.06]" : "") +
                    (date.dimmed ? " bg-muted/30" : "")
                  }
                >
                  <span
                    className={
                      "mx-auto flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums sm:mx-0 sm:mb-0.5 " +
                      (date.today
                        ? "bg-primary font-medium text-primary-foreground"
                        : date.dimmed
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground")
                    }
                  >
                    {date.day}
                  </span>
                  {/* Mobile: dots like the real product. Desktop: full chips. */}
                  <span className="flex items-center justify-center gap-1 pb-0.5 sm:hidden">
                    {date.chips?.slice(0, 3).map((chip, ci) => (
                      <StatusDot key={ci} status={chip.status} />
                    ))}
                  </span>
                  <span className="hidden min-w-0 flex-col gap-1 sm:flex">
                    {date.chips?.slice(0, 3).map((chip, ci) => (
                      <DayChip key={ci} chip={chip} />
                    ))}
                    {date.more != null && (
                      <span className="px-1 text-[11px] text-muted-foreground">
                        +{date.more} more
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PublishStatusCard() {
  return (
    <div
      role="img"
      aria-label="Per-account publish status: Instagram and Threads published, TikTok publishing, X failed with retry"
      className={shellClass}
    >
      <div aria-hidden="true" className="px-4 py-3.5 md:px-5">
        <p className="text-[15px] font-medium">Launch day video</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Per-account status · retry only what failed
        </p>
      </div>
      <ul aria-hidden="true" className="divide-y divide-border border-t border-border">
        {(
          [
            { platform: "INSTAGRAM", user: "@studio", status: "PUBLISHED" },
            { platform: "THREADS", user: "@studio", status: "PUBLISHED" },
            { platform: "TIKTOK", user: "@studio.clips", status: "PUBLISHING" },
            { platform: "X", user: "@studio", status: "FAILED" },
          ] as const
        ).map((target) => (
          <li
            key={target.platform}
            className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <PlatformIcon platform={target.platform} />
              <span className="truncate text-sm">{target.user}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge status={target.status} />
              {target.status === "FAILED" && (
                <Badge variant="outline">Retry</Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
