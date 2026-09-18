import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, PlatformMock, QuietRows } from "@/components/marketing/MarketingSections";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Schedule Instagram posts — photos and Reels from Postvia",
  description:
    "Schedule Instagram photos (JPEG) and Reels (MP4) with captions up to 2,200 characters. Preview the caption, pass validation, and track publish status per account.",
  alternates: { canonical: "/platforms/instagram" },
  openGraph: {
    title: "Postvia for Instagram — photos and Reels, scheduled",
    description:
      "One JPEG photo or one MP4 Reel per post, captions up to 2,200 characters, scheduled from one workspace.",
    url: absoluteUrl("/platforms/instagram"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for Instagram — photos and Reels, scheduled",
    description: "Schedule Instagram photos and Reels with captions.",
  },
};

const FAQS = [
  {
    question: "What Instagram formats does Postvia publish?",
    answer:
      "A single JPEG photo or a single MP4 Reel per post, each with a caption of up to 2,200 characters. Text-only posts are not publishable to Instagram.",
  },
  {
    question: "Does Postvia support carousels or Stories?",
    answer:
      "No. Postvia publishes single-photo and single-Reel posts only. Carousels, Stories and alt text are outside the current scope, and the composer rejects anything else with an explicit error.",
  },
  {
    question: "Can I schedule Instagram posts?",
    answer:
      "Yes. Instagram supports future-dated scheduling with per-account status tracking, retries and calendar rescheduling.",
  },
];

export default function InstagramPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "Instagram" },
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
          eyebrow="Platforms"
          title="Instagram, scheduled without the juggling."
          description="Photos and Reels with real captions, validated before they ship and scheduled from the same queue as your other networks."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Instagram" },
          ]}
          visual={
            <PlatformMock
              platform="INSTAGRAM"
              handle="@studio"
              text="Morning launch is live — our biggest update yet. Everything that changed, and why it matters for your week."
              counter="184 / 2,200"
              mediaLabel="launch-day.mp4 · 1 Reel"
              foot="Caption fits · Reel attached · ready to schedule"
            />
          }
          secondaryHref="/platform-previews"
          secondaryLabel="See the preview"
          meta={[
            { label: "Formats", value: "1 photo · 1 Reel" },
            { label: "Caption", value: "up to 2,200" },
            { label: "Scheduling", value: "yes" },
          ]}
        />
        <QuietRows
          title="What ships — and what does not"
          intro="The boundary is stated here so the composer never has to surprise you."
          items={[
            {
              title: "Single photo",
              text: "One JPEG per post with a caption of up to 2,200 characters and a live remaining counter.",
            },
            {
              title: "Single Reel",
              text: "One MP4 Reel per post with the same caption treatment and scheduling.",
            },
            {
              title: "No carousels, Stories, alt text",
              text: "Conscious scope, not a gap. Anything outside photo-or-Reel fails closed in the composer with a named issue.",
            },
            {
              title: "No text-only posts",
              text: "Instagram requires media. The composer blocks text-only Instagram targets before scheduling.",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Social media scheduler",
              description: "How Instagram scheduling, queues and statuses work.",
              href: "/social-media-scheduler",
            },
            {
              title: "Platform previews",
              description: "See the Instagram caption version before it ships.",
              href: "/platform-previews",
            },
            {
              title: "Content calendar",
              description: "Place Instagram posts on the month grid.",
              href: "/social-media-calendar",
            },
          ]}
        />
        <MarketingFaq heading="Instagram questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Put Instagram on a schedule."
          text="Photos and Reels with captions, queued alongside your other networks."
          note="Free plan: 15 posts per month, 1 connected account."
        />
      </main>
      <Footer />
    </div>
  );
}
