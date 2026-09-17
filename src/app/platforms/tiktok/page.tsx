import type { Metadata } from "next";
import Link from "next/link";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
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
        <MarketingHero
          eyebrow="Platforms"
          title="TikTok, with the settings TikTok actually offers."
          description="Video or photo posts with titles, privacy levels and interaction toggles served per account — scheduled singly or in bulk batches."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "TikTok" },
          ]}
        />
        <section aria-label="TikTok capabilities" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  What ships to TikTok
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "One video (MP4/WebM/MOV) per post via Direct Post.",
                    "1–4 photos (JPEG/WebP) per post as the photo flow.",
                    "Title per target: global text by default, overridable per account.",
                    "Photo-only description up to 4,000 characters.",
                    "Privacy level, allow-comments, allow-duet, allow-stitch and cover options per post.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Options from the source, not guesses
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Privacy choices and interaction toggles are served
                  per account from creator info — the composer shows what
                  your TikTok account actually allows instead of a static
                  list that drifts from reality.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Validation keeps the two media flows apart: video-only
                  settings never leak into photo posts, and mixed photo-plus-
                  video posts are rejected with a named issue before publish.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="TikTok scheduling" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Scheduled singly or in batches
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-panel p-5">
                <p className="font-heading text-base font-semibold">Single scheduling</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Date and time in the composer, per-account status after
                  publish, retries and calendar rescheduling like any other
                  network.
                </p>
              </div>
              <div className="rounded-2xl bg-panel p-5">
                <p className="font-heading text-base font-semibold">Bulk batches</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Up to 10 videos with a start time and interval become
                  individual scheduled posts on Growth and Scale.
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Batch workflow in detail:{" "}
              <Link href="/bulk-social-media-scheduling" className="font-medium text-primary hover:underline">
                bulk video scheduling.
              </Link>
            </p>
          </div>
        </section>
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
