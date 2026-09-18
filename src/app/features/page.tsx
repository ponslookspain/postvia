import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { PlatformGrid } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, QuietRows, SplitSection } from "@/components/marketing/MarketingSections";
import { ComposerVisual } from "@/components/landing/ProductVisuals";
import {
  CREATE_FEATURES,
  PLAN_PUBLISH_FEATURES,
  PLATFORM_LINKS,
} from "@/components/marketing/marketing-data";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Features — everything Postvia does",
  description:
    "Plan, create and publish social content from one workspace: scheduler, content calendar, cross-platform publishing, bulk scheduling and per-platform previews for Instagram, TikTok, Threads and X.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "Postvia features — plan, create, publish",
    description:
      "Scheduler, calendar, cross-platform publishing, bulk scheduling and previews for Instagram, TikTok, Threads and X.",
    url: absoluteUrl("/features"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia features — plan, create, publish",
    description:
      "Scheduler, calendar, cross-platform publishing, bulk scheduling and previews.",
  },
};

const FAQS = [
  {
    question: "What does Postvia actually do?",
    answer:
      "Postvia is a single workspace to write a post once, adapt it per network, preview each version, and schedule or publish it to Instagram, Threads, TikTok and X.",
  },
  {
    question: "Which platforms can I publish to?",
    answer:
      "Instagram (photo or Reel), TikTok (video or photos), Threads (text, image or video) and X (immediate publishing). Each network applies its own media and text rules.",
  },
  {
    question: "Can I schedule posts?",
    answer:
      "Yes for Instagram, Threads and TikTok. X publishes immediately, so posts that include X go out right away.",
  },
  {
    question: "What is bulk scheduling?",
    answer:
      "Growth and Scale plans turn up to 10 videos into individual scheduled posts: pick a start time and interval, review the batch, and Postvia creates each post on the calendar.",
  },
];

const SECONDARY_PLAN = PLAN_PUBLISH_FEATURES.slice(1);

export default function FeaturesPage() {
  const featured = PLAN_PUBLISH_FEATURES[0]!;
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Features" },
            ])
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageSchema(FAQS)) }}
      />
      <NavbarState />
      <main>
        <PageHero
          eyebrow="Features"
          title="Everything Postvia does, on one map."
          description="Write once, adapt per network, preview each version, and keep every publishing result visible. Start from the capability you need."
          breadcrumbs={[{ label: "Home", href: "/" }, { label: "Features" }]}
          meta={[
            { label: "Capabilities", value: "5 guides" },
            { label: "Platforms", value: "Instagram · Threads · TikTok · X" },
            { label: "Plans", value: "Free · Growth · Scale" },
          ]}
        />

        {/* Featured capability — the one card that is not like the others. */}
        <SplitSection
          title={featured.title}
          visual={<ComposerVisual />}
          caption="The real composer: shared caption, per-account adaptations with limits, scheduled for Wednesday 09:00."
        >
          <p>
            The scheduler is the center of Postvia: one queue for Instagram,
            Threads and TikTok, with per-account statuses and retries — and
            an honest immediate path for X.
          </p>
          <p>
            <Link
              href={featured.href}
              className="inline-flex items-center gap-1 rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Read the scheduler guide
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </p>
        </SplitSection>

        <QuietRows
          title="Plan and publish, continued"
          intro="The rest of the scheduling core — each with its own guide."
          items={SECONDARY_PLAN.map((feature) => ({
            title: feature.title,
            text: feature.description,
            href: feature.href,
          }))}
        />

        {/* Create — compact hairline trio, deliberately not cards. */}
        <section aria-label="Create" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                Create
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                The composer side: shared text, per-account overrides, and
                previews that match each network.
              </p>
            </div>
            <ul className="mt-8 grid gap-8 md:grid-cols-3">
              {CREATE_FEATURES.map((feature) => (
                <li key={feature.title} className="border-t-2 border-primary/50 pt-4">
                  <feature.icon aria-hidden="true" className="size-5 text-primary" />
                  <p className="mt-3 font-heading text-lg font-semibold tracking-tight">
                    <Link
                      href={feature.href}
                      className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {feature.title}
                    </Link>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="border-t border-border">
          <PlatformGrid
            heading="Platforms"
            intro="Four connected networks, each with its own guide to formats, limits and scheduling."
            platforms={PLATFORM_LINKS}
          />
        </div>
        <MarketingFaq
          heading="Feature questions, answered."
          faqs={FAQS}
        />
        <MarketingCta
          title="Try the whole map on the Free plan."
          text="Connect one account, schedule your first posts, and see every status per network."
          note="15 posts per month, 1 connected account, no credit card required."
        />
      </main>
      <Footer />
    </div>
  );
}
