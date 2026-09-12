"use client";

import { useState } from "react";
import { cn } from "cn";
import { Reveal } from "@/components/landing/Reveal";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScenePlatforms, SceneStatusDot, SceneThumb } from "@/components/landing/scenes";

function WriteStory() {
  const [active, setActive] = useState("THREADS");
  const previews: Record<string, { text: string; note: string }> = {
    THREADS: { text: "Morning launch is live on Threads", note: "482 / 500 chars" },
    X: { text: "Morning launch is live", note: "24 / 280 chars" },
    TIKTOK: { text: "Launch day vlog", note: "Title set · SELF_ONLY" },
    INSTAGRAM: { text: "Morning launch is live on Instagram", note: "Caption ready" },
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border bg-card p-5 md:p-7">
        <p className="text-xs font-medium text-muted-foreground">Global caption</p>
        <p className="mt-3 text-xl leading-relaxed md:text-2xl">
          Morning launch is live — our biggest update yet. Here is everything
          that changed and why it matters for your week.
        </p>
        <div className="mt-5 flex gap-2.5">
          <SceneThumb kind="image" className="h-20 w-28" />
          <SceneThumb kind="video" className="h-20 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {(["THREADS", "X", "TIKTOK", "INSTAGRAM"] as const).map((platform) => {
          const isActive = platform === active;
          return (
            <button
              key={platform}
              type="button"
              onClick={() => setActive(platform)}
              aria-pressed={isActive}
              className={cn(
                "rounded-xl border p-3.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive
                  ? "border-foreground/25 bg-card shadow-[0_12px_40px_-20px_rgba(0,0,0,0.35)]"
                  : "border-border bg-muted/30 hover:bg-muted/60"
              )}
            >
              <span className="flex items-center gap-2">
                <ScenePlatforms platforms={[platform]} />
                <span className="text-sm font-medium">{platform === "X" ? "X" : platform.charAt(0) + platform.slice(1).toLowerCase()}</span>
              </span>
              <span className="mt-1.5 block truncate text-sm text-muted-foreground">
                {previews[platform]!.text}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {previews[platform]!.note}
              </span>
            </button>
          );
        })}
        <p aria-live="polite" className="sr-only">
          Showing {active} preview
        </p>
      </div>
    </div>
  );
}

function CalendarStory() {
  const [selected, setSelected] = useState(11);
  const posts: Record<number, { title: string; platforms: string[]; status: string }> = {
    4: { title: "Launch teaser", platforms: ["THREADS", "X"], status: "Published" },
    11: { title: "Launch day video", platforms: ["TIKTOK", "INSTAGRAM"], status: "Scheduled" },
    18: { title: "Behind the scenes", platforms: ["INSTAGRAM"], status: "Scheduled" },
  };
  const current = posts[selected];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="September preview">
        {Array.from({ length: 28 }).map((_, i) => {
          const day = i + 1;
          const hasPost = day === 4 || day === 11 || day === 18;
          const isSelected = day === selected;
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              aria-label={`September ${day}${hasPost ? ", has posts" : ""}`}
              onClick={() => hasPost && setSelected(day)}
              disabled={!hasPost}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                isSelected
                  ? "bg-blue-700 font-medium text-white"
                  : hasPost
                    ? "bg-muted font-medium hover:bg-muted/60"
                    : "text-muted-foreground"
              )}
            >
              {day}
              {hasPost && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    isSelected ? "bg-white" : "bg-blue-700"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <div
        key={selected}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 animate-[post-in_.3s_ease_both] motion-reduce:animate-none"
      >
        {current ? (
          <>
            <SceneThumb kind="video" className="h-28 w-full" />
            <p className="text-sm font-medium">{current.title}</p>
            <div className="flex items-center justify-between">
              <ScenePlatforms platforms={current.platforms} />
              <Badge variant="secondary">{current.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              September {selected}, 09:00
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No posts this day.</p>
        )}
      </div>
    </div>
  );
}

function BulkStory() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Bulk workflow">
        {["Upload", "Configure", "Review", "Schedule"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
              {i + 1}
            </span>
            <span className="text-xs font-medium">{step}</span>
            {i < 3 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          { name: "launch-day.mp4", time: "Fri 09:00", progress: 100, label: "Scheduled" },
          { name: "demo-reel.mp4", time: "Fri 12:00", progress: 100, label: "Scheduled" },
          { name: "teaser.mp4", time: "Fri 15:00", progress: 64, label: "Uploading" },
        ].map((row) => (
          <div
            key={row.name}
            className="rounded-xl border border-border bg-card p-3.5 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <Badge variant={row.progress === 100 ? "secondary" : "outline"}>
                {row.label}
              </Badge>
            </div>
            <div className="mt-2.5">
              <Progress value={row.progress} aria-label={`${row.name} ${row.progress} percent`} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{row.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublishingStory() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-center gap-2" aria-label="Publishing lifecycle">
        {["Scheduled", "Publishing", "Published"].map((stage, i) => (
          <li key={stage} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                i < 2 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              )}
            >
              {i + 1}
            </span>
            <span className="truncate text-xs font-medium">{stage}</span>
            {i < 2 && <span aria-hidden="true" className="mx-1 h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        {[
          { platform: "INSTAGRAM", user: "@studio", state: "Published", tone: "ok" as const, action: null },
          { platform: "THREADS", user: "@studio", state: "Published", tone: "ok" as const, action: null },
          { platform: "TIKTOK", user: "@studio.clips", state: "Publishing", tone: "busy" as const, action: null },
          { platform: "X", user: "@studio", state: "Failed", tone: "bad" as const, action: "Retry" },
        ].map((row) => (
          <div
            key={row.platform}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <SceneStatusDot tone={row.tone} />
              <ScenePlatforms platforms={[row.platform]} />
              <span className="truncate text-sm">{row.user}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge variant={row.tone === "bad" ? "destructive" : "secondary"}>
                {row.state}
              </Badge>
              {row.action && (
                <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium">
                  {row.action}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Stories() {
  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Write once. Make it yours everywhere.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            One caption goes out, tuned for every audience. Pick a platform
            to see its version.
          </p>
        </Reveal>
        <Reveal className="mt-10" delayMs={100}>
          <WriteStory />
        </Reveal>
      </section>

      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              See everything at a glance.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              The month, the posts in it, and what happens next — pick a day.
            </p>
          </Reveal>
          <Reveal className="mt-10" delayMs={100}>
            <CalendarStory />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Ten videos. One schedule.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Upload a batch of clips, set a start and an interval. Each one
            becomes its own scheduled post.
          </p>
        </Reveal>
        <Reveal className="mt-10" delayMs={100}>
          <BulkStory />
        </Reveal>
      </section>

      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              Know exactly what happened.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Every target reports its own status. Failures get a retry, not
              a mystery.
            </p>
          </Reveal>
          <Reveal className="mt-10" delayMs={100}>
            <SceneFrame label="Publishing lifecycle preview">
              <div className="p-4 md:p-6">
                <PublishingStory />
              </div>
            </SceneFrame>
          </Reveal>
          <Reveal delayMs={140}>
            <div className="mt-6 flex items-center gap-3">
              <PlatformIcon platform="INSTAGRAM" className="size-5 opacity-60" />
              <PlatformIcon platform="THREADS" className="size-5 opacity-60" />
              <PlatformIcon platform="TIKTOK" className="size-5 opacity-60" />
              <PlatformIcon platform="X" className="size-5 opacity-60" />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function SceneFrame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_80px_-40px_rgba(0,0,0,0.3)]"
    >
      {children}
    </div>
  );
}
