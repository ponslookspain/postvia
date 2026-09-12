"use client";

import Link from "next/link";
import { ArrowDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/Reveal";
import { SceneCaption, ScenePlatforms, SceneStatusDot, SceneThumb } from "@/components/landing/scenes";

function scrollToHow(event: React.MouseEvent) {
  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById("how")
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

function HeroScene() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_80px_-32px_rgba(0,0,0,0.25)]"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 h-4 flex-1 rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-3 p-4 md:p-5">
          <div className="rounded-lg border border-border p-3 transition-colors hover:border-foreground/25">
            <SceneCaption lines={3} />
            <div className="mt-3 flex items-center justify-between">
              <ScenePlatforms platforms={["THREADS", "X", "TIKTOK", "INSTAGRAM"]} />
              <span className="text-xs text-muted-foreground">482 chars</span>
            </div>
          </div>
          <div className="flex gap-2.5">
            <SceneThumb kind="image" className="h-20 w-28" />
            <SceneThumb kind="video" className="h-20 w-28" />
            <span className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground">
              <PlusIcon className="size-4" />
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
            <SceneStatusDot tone="busy" />
            <span className="text-xs text-muted-foreground">
              Scheduled for Friday, 09:00
            </span>
          </div>
        </div>
        <div className="hidden flex-col gap-2.5 border-t border-border bg-muted/30 p-4 md:flex md:border-t-0 md:border-l">
          {[
            { name: "Threads", tone: "ok" as const, text: "Morning launch post is live" },
            { name: "TikTok", tone: "busy" as const, text: "Processing video…" },
            { name: "X", tone: "idle" as const, text: "Queued after Threads" },
          ].map((row) => (
            <div
              key={row.name}
              className="rounded-lg border border-border bg-background p-2.5 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none"
            >
              <div className="flex items-center gap-2">
                <SceneStatusDot tone={row.tone} />
                <span className="text-xs font-medium">{row.name}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{row.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-10 md:px-8 md:pt-24 md:pb-14">
      <div className="mx-auto max-w-3xl text-center">
        <div className="animate-[post-in_.5s_ease_both] motion-reduce:animate-none">
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-7xl">
            Publish everywhere. Stay in one place.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Write once, customize for every platform, and schedule your
            content from one workspace.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              Get started
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToHow}>
              See how it works
              <ArrowDownIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
      <Reveal className="mx-auto mt-12 max-w-4xl md:mt-16" delayMs={120}>
        <HeroScene />
      </Reveal>
    </section>
  );
}
