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
        <MarketingHero
          eyebrow="Plan and publish"
          title="Ten videos in. A schedule out."
          description="Bulk scheduling is for the days you film everything at once: upload the batch, set the start and rhythm, review every slot, and create the posts together."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Bulk Scheduling" },
          ]}
        />
        <section aria-label="How bulk works" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Upload, configure, review, create
            </h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                { title: "Upload", text: "Add up to 10 videos in one batch with per-file progress and retry." },
                { title: "Configure", text: "Choose the start date and time, timezone, and interval between posts." },
                { title: "Review", text: "Check every video against its scheduled slot before confirming." },
                { title: "Create", text: "One scheduled post per video lands on the calendar for editing." },
              ].map((step, index) => (
                <li key={step.title} className="rounded-2xl bg-panel p-5">
                  <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                    {index + 1}
                  </span>
                  <p className="mt-3 font-heading text-base font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section aria-label="Bulk limits" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Built for video-first weeks
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Bulk exists because short video is batch work: you shoot
                  five TikToks on Sunday and want them spread across the
                  week. Each video becomes a full post — editable, movable on
                  the calendar, and tracked with its own status.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  After creation the batch dissolves into ordinary posts.
                  There is no special bulk state to learn; the calendar is
                  the confirmation screen.
                </p>
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  The honest limits
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Growth and Scale only: up to 10 videos per batch, quota pre-checked before creation.",
                    "Video batches: bulk is a video workflow — single posts cover images and mixed planning.",
                    "Per-post backstop: every item is validated server-side, so plan caps hold even under retry.",
                    "Calendar finish: review leads straight to the calendar, where each post can still move.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Compare what each plan includes:{" "}
              <Link href="/pricing" className="font-medium text-primary hover:underline">
                see pricing and bulk limits.
              </Link>
            </p>
          </div>
        </section>
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
