import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, PlatformMock, QuietRows } from "@/components/marketing/MarketingSections";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Publish to X — immediate posting with media",
  description:
    "Publish text posts up to 280 characters to X with up to 4 photos, 1 GIF or 1 video. X publishes immediately in Postvia — scheduling is not available for X.",
  alternates: { canonical: "/platforms/x" },
  openGraph: {
    title: "Postvia for X — immediate publishing",
    description:
      "Short posts with photos, GIF or video. X publishes immediately; the composer says so upfront.",
    url: absoluteUrl("/platforms/x"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for X — immediate publishing",
    description: "280 characters with media, published immediately.",
  },
};

const FAQS = [
  {
    question: "Can I schedule posts to X?",
    answer:
      "No. X publishes immediately in Postvia. Selecting an X account switches the composer to immediate publishing with an explicit hint, and the API rejects scheduled X posts with a clear error.",
  },
  {
    question: "What media can I attach to an X post?",
    answer:
      "Up to 4 photos, 1 GIF, or 1 video per post. Photos and video can never share one post, and stills over 5 MB are rejected before publish.",
  },
  {
    question: "How does X fit a multi-platform post?",
    answer:
      "Write the shared caption, trim the X version to 280 characters, and publish: X goes out now while Instagram, Threads and TikTok targets follow their own schedule.",
  },
];

export default function XPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "X" },
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
          title="X, published now — honestly."
          description="Short posts with media that go out immediately. Postvia never promises X scheduling; the composer tells you upfront and the workflow respects it."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "X" },
          ]}
          visual={
            <PlatformMock
              platform="X"
              handle="@studio"
              text="Launch day is live. Biggest update yet — details in the thread below."
              counter="184 / 280"
              mediaLabel="2 photos attached"
              foot="Trimmed version · publishes immediately"
            />
          }
          secondaryHref="/social-media-scheduler"
          secondaryLabel="How scheduling works"
          meta={[
            { label: "Text", value: "up to 280" },
            { label: "Media", value: "4 photos · 1 GIF · 1 video" },
            { label: "Scheduling", value: "not available" },
          ]}
        />
        {/* Deliberately no scheduling visual: the constraint is the message. */}
        <section aria-label="No scheduling for X" className="border-t border-border bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-2 lg:gap-14">
            <div className="min-w-0">
              <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                No scheduling — by rule, not by accident
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Scheduling for X is not available yet. The composer detects X
                in your selection and shows the immediate-publishing hint
                instead of the schedule dialog; the posts API enforces the
                same rule server-side.
              </p>
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                How X shares a post
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Trim the X version to 280 characters, attach photos, GIF or
                video within limits, and publish: X goes out now with its own
                status while the other networks follow their schedule.
              </p>
            </div>
          </div>
        </section>
        <QuietRows
          title="Media rules for X"
          items={[
            {
              title: "Up to 4 photos",
              text: "Stills up to 5 MB each via chunked upload. Over-limit stills are rejected before publish.",
            },
            {
              title: "1 GIF or 1 video",
              text: "One moving attachment per post — never mixed with photos on the same post.",
            },
            {
              title: "Individual retry",
              text: "A failed X target keeps its error and retries alone; published siblings stay untouched.",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Threads publishing",
              description: "The 500-character scheduled sibling of X posts.",
              href: "/platforms/threads",
            },
            {
              title: "Cross-platform publishing",
              description: "How immediate X and scheduled networks share one post.",
              href: "/cross-platform-publishing",
            },
            {
              title: "Platform previews",
              description: "See the trimmed X version before it goes out.",
              href: "/platform-previews",
            },
          ]}
        />
        <MarketingFaq heading="X questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Post to X without the tab."
          text="Trim, attach, publish now — and keep the result next to your scheduled posts."
          note="X publishing works on all plans, including Free."
        />
      </main>
      <Footer />
    </div>
  );
}
