import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, PlatformMock, QuietRows } from "@/components/marketing/MarketingSections";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Schedule TikTok posts — video, photos, titles and privacy",
  description:
    "Publish TikTok videos or 1–4 photos from Postvia with titles, descriptions, privacy levels, duet/stitch/comments and cover options. Scheduling and bulk supported.",
  alternates: { canonical: "/platforms/tiktok" },
  openGraph: {
    title: "Postvia for TikTok — video and photo posts, scheduled",
    description:
      "Direct Post publishing with titles, privacy controls and cover options. Bulk video scheduling on Growth and Scale.",
    url: absoluteUrl("/platforms/tiktok"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for TikTok — video and photo posts, scheduled",
    description: "Titles, privacy, duet/stitch/comments, bulk scheduling.",
  },
};

const FAQS = [
  {
    question: "What TikTok formats does Postvia publish?",
    answer:
      "Exactly one video, or 1–4 photos (JPEG/WebP) per post via Direct Post. Photos and video can never share one post.",
  },
  {
    question: "How do titles and descriptions work?",
    answer:
      "Your global post text becomes the default caption. Per-target title overrides refine it (up to 2,200 characters for video; photo titles narrow to 90), and photo posts support a separate description of up to 4,000 characters.",
  },
  {
    question: "Can I control privacy, duet and stitch?",
    answer:
      "Yes. Privacy level, comment/duet/stitch toggles and cover timestamp come from per-account creator info and are set per post in the composer.",
  },
  {
    question: "Can I schedule TikTok posts in bulk?",
    answer:
      "Yes. Bulk video scheduling on Growth and Scale turns up to 10 videos into dated TikTok posts, each editable afterward on the calendar.",
  },
];

export default function TiktokPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "TikTok" },
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
          title="TikTok, with the settings TikTok actually offers."
          description="Video or photo posts with titles, privacy levels and interaction toggles served per account — scheduled singly or in bulk batches."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "TikTok" },
          ]}
          visual={
            <PlatformMock
              platform="TIKTOK"
              handle="@studio.clips"
              text="Launch day, cut to 30 seconds. Full story in the caption — duet open."
              counter="title 42 / 2,200"
              mediaLabel="launch-day.mp4 · 1 video · cover 00:01"
              foot="Privacy: public · comments on · duet on"
            />
          }
          secondaryHref="/bulk-social-media-scheduling"
          secondaryLabel="Schedule in bulk"
          meta={[
            { label: "Formats", value: "1 video · 1–4 photos" },
            { label: "Title", value: "per-target override" },
            { label: "Scheduling", value: "single + bulk" },
          ]}
        />
        {/* Two flows, side by side on quiet background — no cards. */}
        <section aria-label="Video and photo flows" className="border-t border-border bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-2 lg:gap-14">
            <div className="min-w-0">
              <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                Video flow
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                One video per post with a title of up to 2,200 characters,
                privacy level, comment/duet/stitch toggles and a cover
                timestamp — options served per account from creator info, so
                the composer shows what your account actually allows.
              </p>
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                Photo flow
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                One to four photos with a title narrowed to 90 characters and
                a separate description of up to 4,000. Video-only settings
                never leak across, and mixed photo-plus-video posts are
                rejected before publish.
              </p>
            </div>
          </div>
        </section>
        <QuietRows
          title="Scheduled singly or in batches"
          items={[
            {
              title: "Single scheduling",
              text: "Date and time in the composer, per-account status after publish, retries and calendar rescheduling.",
              href: "/social-media-scheduler",
            },
            {
              title: "Bulk batches",
              text: "Up to 10 videos with a start time and interval become individual scheduled posts on Growth and Scale.",
              href: "/bulk-social-media-scheduling",
            },
            {
              title: "Preview first",
              text: "The TikTok version with titles and settings renders before anything is queued.",
              href: "/platform-previews",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Bulk scheduling",
              description: "Turn video batches into dated TikTok posts.",
              href: "/bulk-social-media-scheduling",
            },
            {
              title: "Platform previews",
              description: "See the TikTok version with titles and settings.",
              href: "/platform-previews",
            },
            {
              title: "Cross-platform publishing",
              description: "How TikTok fits the create-once workflow.",
              href: "/cross-platform-publishing",
            },
          ]}
        />
        <MarketingFaq heading="TikTok questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Queue your next TikToks."
          text="Titles, privacy and covers set per post — scheduled singly or ten at a time."
          note="Bulk needs Growth or Scale. Single scheduling works on Free."
        />
      </main>
      <Footer />
    </div>
  );
}
