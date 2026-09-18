"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  AccountsVisual,
  CalendarVisual,
  ComposerVisual,
} from "@/components/landing/ProductVisuals";
import { Reveal } from "@/components/landing/Reveal";

const steps = [
  {
    id: "connect",
    title: "Connect",
    heading: "Connect your social accounts",
    text: "Connect Instagram, Threads, TikTok, and X with official OAuth. Postvia never stores your social passwords.",
    layout: "split",
    bullets: [
      "Connect multiple accounts where your plan allows it.",
      "Reconnect accounts when access needs attention.",
      "Disconnect any account independently.",
    ],
  },
  {
    id: "write",
    title: "Write",
    heading: "Create once. Tailor each network.",
    text: "Start with one caption, then customize individual accounts when the platform needs a different version.",
    layout: "split-reverse",
    bullets: [
      "See platform-specific previews before publishing.",
      "Keep character limits visible while you write.",
      "Set TikTok-specific title and posting options.",
    ],
  },
  {
    id: "schedule",
    title: "Schedule",
    heading: "Schedule or publish, then see the result.",
    text: "Schedule Instagram, Threads, and TikTok, or publish now. X publishes immediately. Every connected account reports its own status.",
    layout: "wide",
    bullets: [
      "Plan upcoming posts on the visual calendar.",
      "Bulk schedule up to 10 videos on Growth and Scale.",
      "See which accounts published, are still publishing, or failed.",
    ],
  },
] as const;

function BulletList({ bullets }: { bullets: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2.5 border-t border-border pt-5">
      {bullets.map((bullet) => (
        <li
          key={bullet}
          className="flex items-start gap-2.5 text-sm text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary"
          />
          {bullet}
        </li>
      ))}
    </ul>
  );
}

function StepCopy({
  heading,
  text,
  bullets,
}: {
  heading: string;
  text: string;
  bullets: readonly string[];
}) {
  return (
    <div className="min-w-0">
      <h3 className="font-heading text-xl font-semibold tracking-tight">
        {heading}
      </h3>
      <p className="mt-2 max-w-xl text-prose leading-relaxed text-muted-foreground">
        {text}
      </p>
      <div className="mt-5">
        <BulletList bullets={bullets} />
      </div>
    </div>
  );
}

/**
 * Interactive product showcase: the three-step workflow as tabs with a
 * connected step rail. Copy/visual composition varies per step —
 * split, mirrored split, then a full-width calendar moment.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const tablistRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const current = steps[active] ?? steps[0];

  function onKeyDown(event: React.KeyboardEvent) {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % steps.length;
    if (event.key === "ArrowLeft")
      next = (active - 1 + steps.length) % steps.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = steps.length - 1;
    setActive(next);
    const tabs = tablistRef.current?.querySelectorAll('[role="tab"]');
    (tabs?.[next] as HTMLElement | undefined)?.focus();
  }

  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:px-8 md:py-24"
    >
      <Reveal className="max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">
          How it works
        </p>
        <h2
          id="how-heading"
          className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          From connected accounts to published posts.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Three steps. One place to create, schedule, publish, and check the
          result.
        </p>
      </Reveal>

      <Reveal delay={150} className="mt-10">
        {/* Connected step rail */}
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="How Postvia works"
          onKeyDown={onKeyDown}
          className="relative grid grid-cols-3 gap-2 sm:gap-3"
        >
          <div
            aria-hidden="true"
            className="absolute top-5 right-8 left-8 hidden h-px bg-border sm:block"
          />
          {steps.map((step, index) => {
            const isActive = index === active;
            const isDone = index < active;
            return (
              <button
                key={step.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${step.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${step.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(index)}
                className={cn(
                  "group relative min-w-0 rounded-xl border p-2.5 text-left outline-none transition-colors duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:p-4",
                  isActive
                    ? "border-foreground/20 bg-card"
                    : "border-transparent hover:bg-muted/60"
                )}
              >
                <span className="flex items-center gap-2 sm:gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors duration-200 motion-reduce:transition-none",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-label font-medium sm:text-sm",
                      !isActive && "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {step.title}
                  </span>
                </span>
                <span className="mt-1.5 hidden text-xs leading-relaxed text-muted-foreground md:block">
                  {step.heading}
                </span>
                {isActive && (
                  <span
                    key={active}
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-1.5 hidden h-0.5 origin-left animate-[how-progress_.45s_ease_both] rounded-full bg-primary/40 motion-reduce:animate-none sm:block"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Active panel */}
        <div className="mt-4 overflow-hidden rounded-2xl bg-panel">
          {steps.map((step, index) => (
            <div
              key={step.id}
              role="tabpanel"
              id={`${baseId}-panel-${step.id}`}
              aria-labelledby={`${baseId}-tab-${step.id}`}
              hidden={index !== active}
            >
              {index === active && step.layout !== "wide" && (
                <div
                  key={step.id}
                  className="grid animate-[post-in_.4s_ease_both] items-center gap-6 p-4 motion-reduce:animate-none sm:p-6 md:p-8 lg:grid-cols-2 lg:gap-10"
                >
                  <StepCopy
                    heading={step.heading}
                    text={step.text}
                    bullets={step.bullets}
                  />
                  <div className={cn(step.layout === "split-reverse" && "lg:order-first")}>
                    {step.id === "connect" ? <AccountsVisual /> : <ComposerVisual />}
                  </div>
                </div>
              )}
              {index === active && step.layout === "wide" && (
                <div
                  key={step.id}
                  className="animate-[post-in_.4s_ease_both] p-4 motion-reduce:animate-none sm:p-6 md:p-8"
                >
                  <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
                    <div className="min-w-0">
                      <h3 className="font-heading text-xl font-semibold tracking-tight">
                        {step.heading}
                      </h3>
                      <p className="mt-2 max-w-xl text-prose leading-relaxed text-muted-foreground">
                        {step.text}
                      </p>
                    </div>
                    <BulletList bullets={step.bullets} />
                  </div>
                  <div className="mt-6 md:mt-8">
                    <CalendarVisual />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1" aria-hidden="true">
            <PlatformIcon platform="INSTAGRAM" className="size-3.5" />
            <PlatformIcon platform="THREADS" className="size-3.5" />
            <PlatformIcon platform="TIKTOK" className="size-3.5" />
            <PlatformIcon platform="X" className="size-3.5" />
          </span>
          Showing: {current.heading}
        </p>
      </Reveal>
    </section>
  );
}
