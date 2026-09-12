import Link from "next/link";
import { CheckIcon, XIcon } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/plans";

export function Platforms() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
      <Reveal className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Four platforms. One workspace.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Instagram, Threads, TikTok and X — connected over secure OAuth.
          The list keeps growing.
        </p>
      </Reveal>
      <Reveal
        className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4"
        delayMs={100}
      >
        {[
          { platform: "INSTAGRAM", name: "Instagram" },
          { platform: "THREADS", name: "Threads" },
          { platform: "TIKTOK", name: "TikTok" },
          { platform: "X", name: "X" },
        ].map((entry) => (
          <div
            key={entry.platform}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none"
          >
            <PlatformIcon platform={entry.platform} className="size-7" />
            <span className="text-sm font-medium">{entry.name}</span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

const withoutItems = [
  "Copy-paste posts into different apps",
  "Switch between platforms",
  "Lose track of publishing",
  "Manage schedules manually",
];

const withItems = [
  "Write once",
  "Customize per platform",
  "Manage everything in one workspace",
  "Use the visual calendar",
  "Schedule content",
  "See publishing status",
];

export function Comparison() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Stop posting one app at a time.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <Reveal>
            <h3 className="text-base font-medium text-muted-foreground">
              Without Postvia
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {withoutItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <XIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delayMs={100}>
            <h3 className="text-base font-medium">With Postvia</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {withItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon
                    className="mt-0.5 size-4 shrink-0 text-blue-700"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
            <Button
              nativeButton={false}
              render={<Link href="/signup" />}
              className="mt-6"
            >
              Get started
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Simple pricing, per month.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Pick the plan that fits how often you publish.
        </p>
      </Reveal>
      <div className="mt-10 grid items-stretch gap-4 md:grid-cols-3">
        {PLANS.map((plan, index) => (
          <Reveal key={plan.id} delayMs={index * 80}>
            <div
              className={
                plan.highlighted
                  ? "flex h-full flex-col rounded-2xl border-2 border-blue-700 bg-card p-6"
                  : "flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:transform-none"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-medium">{plan.name}</h3>
                {plan.highlighted && (
                  <span className="rounded-full bg-blue-700 px-2.5 py-0.5 text-xs font-medium text-white">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-4">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  ${plan.price}
                </span>{" "}
                <span className="text-sm text-muted-foreground">/ month</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan.description}
              </p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <CheckIcon
                      className="mt-0.5 size-4 shrink-0 text-blue-700"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                nativeButton={false}
                render={<Link href={`/signup?plan=${plan.id}`} />}
                variant={plan.highlighted ? "default" : "outline"}
                className="mt-6 w-full"
              >
                Get started
              </Button>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
