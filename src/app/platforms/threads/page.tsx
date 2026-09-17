import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, PlatformMock, QuietRows } from "@/components/marketing/MarketingSections";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Schedule Threads posts — text, images and video",
  description:
    "Schedule Threads text posts up to 500 characters with one image or video. Preview the Threads version, validate limits, and track status per account.",
  alternates: { canonical: "/platforms/threads" },
  openGraph: {
    title: "Postvia for Threads — text-first, scheduled",
    description:
      "500 characters with single media support. Scheduled from one workspace with per-account statuses.",
    url: absoluteUrl("/platforms/threads"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for Threads — text-first, scheduled",
    description: "Schedule Threads text, image and video posts.",
  },
};

const FAQS = [
  {
    question: "What Threads formats does Postvia publish?",
    answer:
      "Text up to 500 characters, optionally with one image or one video. Multi-item carousels are outside the current scope and are rejected in the composer with an explicit error.",
  },
  {
    question: "Can I schedule Threads posts?",
    answer:
      "Yes. Threads supports future-dated scheduling with per-account status tracking and calendar rescheduling.",
  },
  {
    question: "How does Threads fit cross-platform posts?",
    answer:
      "Threads usually keeps the longest version of your shared caption while shorter networks get trimmed overrides — one idea, honestly adapted per limit.",
  },
];

export default function ThreadsPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "Threads" },
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
          title="Threads, where the long version lives."
          description="Text-first posts up to 500 characters with a single image or video — scheduled from the same composer as everything else."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Threads" },
          ]}
          visual={
            <PlatformMock
              platform="THREADS"
              handle="@studio"
              text="Morning launch is live — our biggest update yet. Here is everything that changed, why it matters, and what ships next for your week."
              counter="184 / 500"
              mediaLabel="launch-day.mp4 · 1 video"
              foot="Full story fits · single media · ready to schedule"
            />
          }
          secondaryHref="/platforms/x"
          secondaryLabel="Compare with X"
          meta={[
            { label: "Text", value: "up to 500" },
            { label: "Media", value: "1 image · 1 video" },
            { label: "Scheduling", value: "yes" },
          ]}
        />
        <QuietRows
          title="One thought, one attachment"
          intro="Single media is a scope decision, stated once and enforced kindly."
          items={[
            {
              title: "Text up to 500",
              text: "The longest short-form limit Postvia serves — Threads usually keeps the full version of your shared caption.",
            },
            {
              title: "Single image or video",
              text: "JPEG, PNG, WebP, GIF or one MP4. Multi-file input fails closed with an explicit per-platform error.",
            },
            {
              title: "Scheduled together",
              text: "One date queues Threads alongside Instagram and TikTok, each reporting its own status afterward.",
              href: "/social-media-scheduler",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Publishing to X",
              description: "The 280-character immediate counterpart to Threads.",
              href: "/platforms/x",
            },
            {
              title: "Social media scheduler",
              description: "How Threads scheduling and statuses work.",
              href: "/social-media-scheduler",
            },
            {
              title: "Platform previews",
              description: "See the Threads version before it ships.",
              href: "/platform-previews",
            },
          ]}
        />
        <MarketingFaq heading="Threads questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Give Threads the full story."
          text="500 characters with media, scheduled from the same queue as the rest."
          note="Free plan: 15 posts per month, 1 connected account."
        />
      </main>
      <Footer />
    </div>
  );
}
