import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, QuietRows } from "@/components/marketing/MarketingSections";
import { CalendarVisual } from "@/components/landing/ProductVisuals";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Bulk scheduling — turn 10 videos into a posting schedule",
  description:
    "Upload up to 10 videos, pick a start time and interval, review the batch, and Postvia creates one scheduled post per video on Growth and Scale plans.",
  alternates: { canonical: "/bulk-social-media-scheduling" },
  openGraph: {
    title: "Postvia bulk scheduling — a week of posts in minutes",
    description:
      "Batch upload, start time with timezone, interval, review, then one scheduled post per video.",
    url: absoluteUrl("/bulk-social-media-scheduling"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia bulk scheduling — a week of posts in minutes",
    description: "Up to 10 videos become dated posts in one batch.",
  },
};

const FAQS = [
  {
    question: "How many videos fit in one batch?",
    answer:
      "Up to 10 videos per batch on Growth and Scale. Free does not include bulk — it keeps the same calendar workflow for individual posts.",
  },
  {
    question: "What does Postvia create from a batch?",
    answer:
      "One ordinary scheduled post per video, each with its own date and time from your start plus interval. After creation you land on the calendar, where every post behaves like any other.",
  },
  {
    question: "Does bulk respect my monthly quota?",
    answer:
      "Yes. The batch is pre-checked against your remaining quota before anything is created, and each post is attested server-side — so a half-created batch cannot silently overspend.",
  },
];

const STEPS = [
  {
    title: "Upload",
    text: "Add up to 10 videos in one batch with per-file progress and retry.",
  },
  {
    title: "Configure",
    text: "Choose the start date and time, timezone, and interval between posts.",
  },
  {
    title: "Review",
    text: "Check every video against its scheduled slot before confirming.",
  },
  {
    title: "Create",
    text: "One scheduled post per video lands on the calendar for editing.",
  },
] as const;

export default function BulkPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Features", path: "/features" },
              { name: "Bulk Scheduling" },
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
          eyebrow="Plan and publish"
          title="Ten videos in. A schedule out."
          description="Bulk scheduling is for the days you film everything at once: upload the batch, set the start and rhythm, review every slot, and create the posts together."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Bulk Scheduling" },
          ]}
          secondaryHref="/pricing"
          secondaryLabel="Compare plans"
          meta={[
            { label: "Batch", value: "up to 10 videos" },
            { label: "Plans", value: "Growth · Scale" },
            { label: "Result", value: "dated posts on the calendar" },
          ]}
        />
        {/* The procedure IS a sequence — numbered steps are honest here. */}
        <section aria-label="How bulk works" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                Upload, configure, review, create
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Four moves in order. Each video becomes a full post — editable
                and movable afterward.
              </p>
            </div>
            <ol className="mt-8 border-t border-border">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="grid gap-1 border-b border-border py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,8fr)] sm:items-baseline sm:gap-6"
                >
                  <span aria-hidden="true" className="font-mono text-[13px] text-muted-foreground tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-heading text-base font-semibold tracking-tight">{step.title}</span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section aria-label="Where batches land" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                The batch dissolves into the calendar
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                After creation there is no special bulk state to learn. Every
                video is an ordinary scheduled post on the grid — move it,
                retitle it, or let it ship.
              </p>
            </div>
            <div className="mt-8">
              <CalendarVisual />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Bulk-created posts behave like any other post on the calendar.
            </p>
          </div>
        </section>
        <QuietRows
          title="The honest limits"
          items={[
            {
              title: "Growth and Scale only",
              text: "Up to 10 videos per batch, quota pre-checked before creation. Free keeps single-post scheduling.",
            },
            {
              title: "Video batches",
              text: "Bulk is a video workflow — single posts cover images and mixed planning.",
            },
            {
              title: "Per-post backstop",
              text: "Every item is validated server-side, so plan caps hold even under retry.",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Content calendar",
              description: "Where bulk-created posts land and how to move them.",
              href: "/social-media-calendar",
            },
            {
              title: "Social media scheduler",
              description: "How individual scheduled posts behave after creation.",
              href: "/social-media-scheduler",
            },
            {
              title: "TikTok publishing",
              description: "Video rules, titles and privacy for TikTok batches.",
              href: "/platforms/tiktok",
            },
          ]}
        />
        <MarketingFaq heading="Bulk questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Film the batch. Ship the month."
          text="Upload up to 10 videos, set the rhythm, and let the calendar fill itself."
          note="Bulk is on Growth (€20) and Scale (€50). Free keeps single-post scheduling."
        />
      </main>
      <Footer />
    </div>
  );
}
