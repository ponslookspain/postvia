import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { FullVisual, PageHero, QuietRows } from "@/components/marketing/MarketingSections";
import { CalendarVisual } from "@/components/landing/ProductVisuals";
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
        {/* Calendar hero stays text-first: the grid below is the visual. */}
        <PageHero
          eyebrow="Plan and publish"
          title="The month, visible in one grid."
          description="Scheduled posts, unscheduled drafts and per-day statuses live on a single calendar. Drag a post to a new day and the schedule follows."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Content Calendar" },
          ]}
          secondaryHref="/bulk-social-media-scheduling"
          secondaryLabel="Fill it with bulk"
          meta={[
            { label: "View", value: "month grid" },
            { label: "Reschedule", value: "drag and drop" },
            { label: "Timezone", value: "viewer local" },
          ]}
        />
        <FullVisual
          title="March, as Postvia sees it"
          intro="Status dots and chips per day, today highlighted, failures impossible to miss. On mobile the same grid collapses to dots — the product's own responsive language."
          visual={<CalendarVisual />}
          caption="Recreation of the real calendar: statuses, platforms and media per day, drafts waiting in the side panel."
        />
        <QuietRows
          title="A weekly rhythm, not a feature list"
          intro="How the grid gets used once the novelty wears off."
          items={[
            {
              title: "Draft the week",
              text: "Write posts without dates; they collect in the drafts panel instead of clogging the grid.",
            },
            {
              title: "Place them",
              text: "Drag each draft onto its day and set times in the composer. Validation still applies per network.",
            },
            {
              title: "Adjust live",
              text: "Move, retry or reschedule as results come back. Failed posts surface with state intact for triage.",
            },
          ]}
        />
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
