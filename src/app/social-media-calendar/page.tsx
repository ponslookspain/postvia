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
  title: "Social media calendar — month view, drafts and rescheduling",
  description:
    "Plan the month on one calendar: scheduled posts, unscheduled drafts, per-day statuses and platforms, drag-and-drop rescheduling in your own timezone.",
  alternates: { canonical: "/social-media-calendar" },
  openGraph: {
    title: "Postvia calendar — the month at a glance",
    description:
      "Month grid with statuses, platforms and media previews. Drag a post to another day to reschedule it.",
    url: absoluteUrl("/social-media-calendar"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia calendar — the month at a glance",
    description: "Scheduled posts, drafts and drag-to-reschedule in one grid.",
  },
};

const FAQS = [
  {
    question: "What do I see on the calendar?",
    answer:
      "A month grid with per-day posts: status, platform, and media preview. Unscheduled drafts sit in a side panel until you give them a date.",
  },
  {
    question: "How do I reschedule?",
    answer:
      "Drag a draft or scheduled post to another day. The change goes through the same validation as the composer, so network rules still apply.",
  },
  {
    question: "Which timezone does the calendar use?",
    answer:
      "Yours. Posts are bucketed by viewer timezone, so what you see is when things actually go out for you.",
  },
];

export default function CalendarPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Features", path: "/features" },
              { name: "Content Calendar" },
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
          title="The month, visible in one grid."
          description="Scheduled posts, unscheduled drafts and per-day statuses live on a single calendar. Drag a post to a new day and the schedule follows."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Content Calendar" },
          ]}
        />
        <section aria-label="What the calendar shows" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Every post has a place
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  The grid shows scheduled posts with their status, platform
                  and media preview per day. Drafts without a date wait in
                  their own panel — nothing unpublished gets lost, and nothing
                  scheduled hides.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Failed and partially published posts surface with their
                  state intact, so the calendar doubles as a triage view: see
                  what needs a retry without opening every post.
                </p>
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Rescheduling without retyping
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Drag and drop: move a draft or scheduled post to another day; the grid never reflows around you.",
                    "Viewer-timezone bucketing: days reflect your local time, not the server clock.",
                    "Status-aware: publishing and published posts stay readable while you plan around them.",
                    "Quota-safe: rescheduling never creates a second post, so your monthly usage stays predictable.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="Planning workflow" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              A weekly planning rhythm
            </h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { title: "Draft the week", text: "Write posts without dates; they collect in the drafts panel." },
                { title: "Place them", text: "Drag each draft onto its day and set times in the composer." },
                { title: "Adjust live", text: "Move, retry or reschedule as results come back — all from the grid." },
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
            <p className="mt-6 text-sm text-muted-foreground">
              Filling the calendar with videos?{" "}
              <Link href="/bulk-social-media-scheduling" className="font-medium text-primary hover:underline">
                Bulk scheduling creates dated posts straight onto the grid.
              </Link>
            </p>
          </div>
        </section>
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Social media scheduler",
              description: "How dates, queues and per-account statuses work.",
              href: "/social-media-scheduler",
            },
            {
              title: "Bulk scheduling",
              description: "Fill weeks of the calendar from one batch of videos.",
              href: "/bulk-social-media-scheduling",
            },
            {
              title: "TikTok scheduling",
              description: "How titles, privacy and photo posts land on TikTok.",
              href: "/platforms/tiktok",
            },
          ]}
        />
        <MarketingFaq heading="Calendar questions, answered." faqs={FAQS} />
        <MarketingCta
          title="See your month before it happens."
          text="Draft this week's posts, place them on the grid, and adjust with a drag."
          note="Calendar is available on all plans, including Free."
        />
      </main>
      <Footer />
    </div>
  );
}
