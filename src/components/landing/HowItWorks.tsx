"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";import { cn } from "cn";
import { Reveal } from "@/components/landing/Reveal";
import { SceneCaption, ScenePlatforms, SceneStatusDot, SceneThumb } from "@/components/landing/scenes";

const STEP_MS = 4000;

const steps = [
  {
    id: "connect",
    title: "Connect your accounts",
    text: "Link Instagram, Threads, TikTok and X with secure OAuth. No passwords stored, disconnect anytime.",
  },
  {
    id: "write",
    title: "Write your post",
    text: "One global caption, live previews, and per-platform customization where it matters.",
  },
  {
    id: "schedule",
    title: "Schedule and publish",
    text: "Pick a date and time. Watch every target move from scheduled to published.",
  },
] as const;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

function ConnectScene() {
  return (
    <div className="flex flex-col gap-2.5 p-4 md:p-6">
      {[
        { platform: "INSTAGRAM", user: "@studio", state: "Connected" },
        { platform: "THREADS", user: "@studio", state: "Connected" },
        { platform: "TIKTOK", user: "@studio.clips", state: "Connected" },
        { platform: "X", user: "@studio", state: "Connect" },
      ].map((row) => (
        <div
          key={row.platform}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ScenePlatforms platforms={[row.platform]} />
            <span className="truncate text-sm font-medium">{row.user}</span>
          </span>
          <span
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              row.state === "Connected"
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground"
            )}
          >
            {row.state}
          </span>
        </div>
      ))}
    </div>
  );
}

function WriteScene() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-6">
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Global caption</p>
        <SceneCaption lines={4} />
        <div className="mt-3 flex gap-2">
          <SceneThumb kind="image" className="h-14 w-20" />
          <SceneThumb kind="video" className="h-14 w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {["Threads · 482 chars", "TikTok · title set", "X · fits 280"].map((label) => (
          <div key={label} className="rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="truncate text-xs">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleScene() {
  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <SceneStatusDot tone="busy" />
          Friday, 09:00 · 3 targets
        </span>
        <ScenePlatforms platforms={["THREADS", "TIKTOK", "INSTAGRAM"]} />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums",
              i === 8
                ? "bg-blue-700 font-medium text-white"
                : "bg-muted/50 text-muted-foreground"
            )}
          >
            {((i % 14) + 1) % 28 || 28}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    timer.current = setInterval(() => {
      setActive((current) => (current + 1) % steps.length);
      setCycle((c) => c + 1);
    }, STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced]);

  function select(index: number) {
    setActive(index);
    setCycle((c) => c + 1);
    if (timer.current) {
      clearInterval(timer.current);
      if (!reduced) {
        timer.current = setInterval(() => {
          setActive((current) => (current + 1) % steps.length);
          setCycle((c) => c + 1);
        }, STEP_MS);
      }
    }
  }

  const current = steps[active] ?? {
    id: "connect",
    title: "Connect your accounts",
    text: "",
  };

  return (
    <section id="how" className="scroll-mt-20 border-y border-border bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            From account to published in three steps.
          </h2>
        </Reveal>
        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Reveal className="flex flex-row gap-2 lg:flex-col" delayMs={80}>
            <div role="tablist" aria-label="How it works" className="flex flex-1 flex-row gap-2 lg:flex-col">
              {steps.map((step, index) => {
                const isActive = index === active;
                return (
                  <button
                    key={step.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => select(index)}
                    className={cn(
                      "flex-1 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 lg:flex-none",
                      isActive
                        ? "border-foreground/20 bg-background"
                        : "border-transparent text-muted-foreground hover:bg-background/60"
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                          isActive ? "bg-blue-700 text-white" : "bg-muted"
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium">{step.title}</span>
                    </span>
                    <span className="mt-1.5 hidden text-xs leading-relaxed text-muted-foreground lg:block">
                      {step.text}
                    </span>
                    {!reduced && (
                      <span
                        aria-hidden="true"
                        className="mt-2 hidden h-0.5 overflow-hidden rounded-full bg-muted lg:block"
                      >
                        <span
                          key={cycle}
                          className={cn(
                            "block h-full origin-left bg-blue-700",
                            isActive && "animate-[how-progress_4s_linear_both]"
                          )}
                          style={{ width: isActive ? undefined : 0 }}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Reveal>
          <Reveal delayMs={140}>
            <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_24px_80px_-40px_rgba(0,0,0,0.3)]">
              <div
                key={active}
                className="animate-[post-in_.35s_ease_both] motion-reduce:animate-none"
              >
                {active === 0 && <ConnectScene />}
                {active === 1 && <WriteScene />}
                {active === 2 && <ScheduleScene />}
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground md:hidden">
              {current.text}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
