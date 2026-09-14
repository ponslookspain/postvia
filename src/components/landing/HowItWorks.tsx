"use client";

import { useId, useRef, useState } from "react";
import { cn } from "cn";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ProductShot } from "@/components/landing/ProductShot";

const steps = [
  {
    id: "connect",
    title: "Connect",
    heading: "Connect your social accounts",
    text: "Connect Instagram, Threads, TikTok, and X with official OAuth. Postvia never stores your social passwords.",
    shot: "/landing/accounts.svg" as const,
    shotAlt:
      "Postvia accounts screen showing connected Instagram, Threads, TikTok, and X profiles",
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
    shot: "/landing/composer.svg" as const,
    shotAlt:
      "Postvia composer showing a global caption with per-platform versions and character counts",
    bullets: [
      "See platform-specific previews before publishing.",
      "Keep character limits visible while you write.",
      "Set TikTok-specific title and posting options.",
    ],
  },
  {
    id: "schedule",
    title: "Schedule / Publish",
    heading: "Schedule or publish, then see the result.",
    text: "Schedule Instagram, Threads, and TikTok, or publish now. X publishes immediately. Every connected account reports its own status.",
    shot: "/landing/calendar.svg" as const,
    shotAlt:
      "Postvia content calendar showing scheduled posts across a month grid",
    bullets: [
      "Plan upcoming posts on the visual calendar.",
      "Bulk schedule up to 10 videos on Growth and Scale.",
      "See which accounts published, are still publishing, or failed.",
    ],
  },
] as const;

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
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-8 md:py-20"
    >
      <div className="max-w-2xl">
        <h2
          id="how-heading"
          className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          From connected accounts to published posts.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Three steps. One place to create, schedule, publish, and check the
          result.
        </p>
      </div>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="How Postvia works"
          onKeyDown={onKeyDown}
          className="flex flex-row gap-2 lg:flex-col"
        >
          {steps.map((step, index) => {
            const isActive = index === active;
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
                  "flex-1 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 lg:flex-none",
                  isActive
                    ? "border-foreground/20 bg-background"
                    : "border-transparent text-muted-foreground hover:bg-muted/60"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{step.title}</span>
                </span>
                <span className="mt-1.5 hidden text-xs leading-relaxed text-muted-foreground lg:block">
                  {step.heading}
                </span>
              </button>
            );
          })}
        </div>
        <div>
          {steps.map((step, index) => (
            <div
              key={step.id}
              role="tabpanel"
              id={`${baseId}-panel-${step.id}`}
              aria-labelledby={`${baseId}-tab-${step.id}`}
              hidden={index !== active}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="p-4 md:p-6">
                <h3 className="text-base font-medium">{step.heading}</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {step.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  <ProductShot src={step.shot} alt={step.shotAlt} />
                </div>
              </div>
            </div>
          ))}
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <PlatformIcon platform="INSTAGRAM" className="size-3.5" />
              <PlatformIcon platform="THREADS" className="size-3.5" />
              <PlatformIcon platform="TIKTOK" className="size-3.5" />
              <PlatformIcon platform="X" className="size-3.5" />
            </span>
            Showing: {current.heading}
          </p>
        </div>
      </div>
    </section>
  );
}
