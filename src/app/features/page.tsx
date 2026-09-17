import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { FeatureGrid, PlatformGrid } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
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

export default function FeaturesPage() {
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
        <MarketingHero
          eyebrow="Features"
          title="Everything Postvia does, on one map."
          description="Write once, adapt per network, preview each version, and keep every publishing result visible. Start from the capability you need."
          breadcrumbs={[{ label: "Home", href: "/" }, { label: "Features" }]}
        />
        <div className="border-t border-border">
          <FeatureGrid
            heading="Plan and publish"
            intro="The scheduling core: a queue, a calendar, and publishing that reports per account."
            features={PLAN_PUBLISH_FEATURES}
          />
        </div>
        <div className="border-t border-border">
          <FeatureGrid
            heading="Create"
            intro="The composer side: shared text, per-account overrides, and previews that match each network."
            features={CREATE_FEATURES}
          />
        </div>
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
