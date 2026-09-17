import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { FeatureLink, PlatformLink } from "@/components/marketing/marketing-data";

export function FeatureGrid({
  heading,
  intro,
  features,
}: {
  heading: string;
  intro?: string;
  features: FeatureLink[];
}) {
  return (
    <section aria-label={heading} className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <div className="max-w-2xl">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {heading}
        </h2>
        {intro && (
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">{intro}</p>
        )}
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <li key={feature.href + feature.title}>
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
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PlatformGrid({
  heading,
  intro,
  platforms,
}: {
  heading: string;
  intro?: string;
  platforms: PlatformLink[];
}) {
  return (
    <section aria-label={heading} className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <div className="max-w-2xl">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {heading}
        </h2>
        {intro && (
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">{intro}</p>
        )}
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {platforms.map((platform) => (
          <li key={platform.href}>
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
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RelatedLinks({
  heading,
  links,
}: {
  heading: string;
  links: { title: string; description: string; href: string }[];
}) {
  return (
    <section
      aria-label={heading}
      className="border-t border-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
        <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          {heading}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex h-full flex-col rounded-2xl bg-panel p-5 outline-none transition-colors hover:bg-muted motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="font-heading text-base font-semibold tracking-tight">
                  {link.title}
                </span>
                <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {link.description}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Open page
                  <ArrowRightIcon aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
