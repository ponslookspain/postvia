import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Reveal } from "@/components/landing/Reveal";
import {
  FEATURE_HUB_CARDS,
  PLATFORM_LINKS,
} from "@/components/marketing/marketing-data";

/**
 * Marketing-hub extension for the home page. Reuses the marketing
 * taxonomy and the landing visual language (panel tiles, no new
 * tokens). Deep-links home visitors into feature and platform pages.
 */
export function HomePlatforms() {
  return (
    <section
      aria-labelledby="home-platforms-heading"
      className="border-t border-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">
            Supported platforms
          </p>
          <h2
            id="home-platforms-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Four networks. One workspace.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Each network has its own formats, limits and scheduling rules.
            Read the guide before you publish.
          </p>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_LINKS.map((platform, index) => (
            <Reveal key={platform.href} delay={index === 1 ? 75 : index === 2 ? 150 : index === 3 ? 225 : 0} className="h-full">
              <Link
                href={platform.href}
                className="group flex h-full flex-col rounded-2xl bg-panel p-6 outline-none transition-colors hover:bg-muted motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <PlatformIcon platform={platform.platform} className="size-6" />
                <span className="mt-4 font-heading text-lg font-semibold tracking-tight">
                  {platform.title}
                </span>
                <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {platform.description}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {platform.title} guide
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                  />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomeFeatures() {
  return (
    <section
      aria-labelledby="home-features-heading"
      className="border-t border-border bg-muted/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">
            Explore features
          </p>
          <h2
            id="home-features-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Start from the job you need done.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Scheduling, planning, publishing and previews — each with its own
            page explaining the real workflow.
          </p>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURE_HUB_CARDS.slice(0, 4).map((feature, index) => (
            <Reveal key={feature.href} delay={index === 1 ? 75 : index === 2 ? 150 : index === 3 ? 225 : 0} className="h-full">
              <Link
                href={feature.href}
                className="group flex h-full flex-col rounded-2xl bg-panel p-6 outline-none transition-colors hover:bg-muted motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <feature.icon aria-hidden="true" className="size-5 text-primary" />
                <span className="mt-4 font-heading text-lg font-semibold tracking-tight">
                  {feature.title}
                </span>
                <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Learn more
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                  />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
        <Reveal className="mt-6">
          <Link
            href="/features"
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            View all features
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function HomeResources() {
  return (
    <section
      aria-labelledby="home-resources-heading"
      className="border-t border-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Learn</p>
          <h2
            id="home-resources-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Understand the workflow first.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Longer guides live on the feature and platform pages — no empty
            blog, no placeholder links.
          </p>
        </Reveal>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "How scheduling works",
              text: "Queues, per-account statuses, retries and the X exception.",
              href: "/social-media-scheduler",
            },
            {
              title: "How the calendar plans",
              text: "Month grid, drafts, timezones and drag-to-reschedule.",
              href: "/social-media-calendar",
            },
            {
              title: "What each plan allows",
              text: "Accounts, monthly posts and bulk limits per plan.",
              href: "/pricing",
            },
          ].map((resource) => (
            <li key={resource.href + resource.title}>
              <Link
                href={resource.href}
                className="group flex h-full flex-col rounded-2xl bg-panel p-6 outline-none transition-colors hover:bg-muted motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="font-heading text-lg font-semibold tracking-tight">
                  {resource.title}
                </span>
                <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {resource.text}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read the guide
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
