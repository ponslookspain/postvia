import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { FullVisual, PageHero, QuietRows } from "@/components/marketing/MarketingSections";
import { ComposerVisual, PublishStatusCard } from "@/components/landing/ProductVisuals";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Social media scheduler — schedule Instagram, Threads and TikTok",
  description:
    "Schedule posts for Instagram, Threads and TikTok from one queue. Pick a date and time, track per-account status, retry failures. X publishes immediately.",
  alternates: { canonical: "/social-media-scheduler" },
  openGraph: {
    title: "Postvia scheduler — one queue for every network",
    description:
      "Schedule Instagram, Threads and TikTok from one workspace. Per-account statuses, retries and calendar planning included.",
    url: absoluteUrl("/social-media-scheduler"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia scheduler — one queue for every network",
    description: "Schedule Instagram, Threads and TikTok from one workspace.",
  },
};

const FAQS = [
  {
    question: "Which networks can I schedule for?",
    answer:
      "Instagram, Threads and TikTok support future-dated scheduling. X publishes immediately, so any post that includes an X account goes out right away.",
  },
  {
    question: "How do I know a scheduled post went out?",
    answer:
      "Every connected account reports its own status — published, still publishing, or failed with the error message — so you can retry individual accounts without touching the ones that succeeded.",
  },
  {
    question: "Can I reschedule a post?",
    answer:
      "Yes. Open the post or drag it to another day on the content calendar. Retry and reschedule controls are available on all plans.",
  },
];

export default function SchedulerPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Features", path: "/features" },
              { name: "Social Media Scheduler" },
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
          title="A scheduler that treats every network honestly."
          description="Pick a date and time once. Postvia queues the post for Instagram, Threads and TikTok — and tells you plainly that X publishes immediately instead of pretending otherwise."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Social Media Scheduler" },
          ]}
          visual={<ComposerVisual />}
          secondaryHref="/social-media-calendar"
          secondaryLabel="See the calendar"
          meta={[
            { label: "Scheduling", value: "Instagram · Threads · TikTok" },
            { label: "X", value: "immediate only" },
            { label: "Retry", value: "per account" },
          ]}
        />
        <FullVisual
          title="Every account reports back"
          intro="After publish, the post becomes a status board: each connected profile on its own row, failures retryable without touching what succeeded."
          visual={<PublishStatusCard />}
          caption="Real product language: per-account statuses with individual retry, as shown in the app."
        />
        <QuietRows
          title="What scheduling respects"
          intro="Constraints the queue enforces before anything waits on a date."
          items={[
            {
              title: "Per-account lifecycle",
              text: "Draft, scheduled, publishing, published — plus partial and failed states that stay visible instead of disappearing.",
            },
            {
              title: "Plan-shaped queue",
              text: "Free includes 1 account and 15 posts a month; Growth adds accounts, volume and bulk. The composer only offers what your plan allows.",
            },
            {
              title: "Quota honesty",
              text: "Every created post counts once, even if deleted later. Rescheduling never creates a second post, so usage stays predictable.",
            },
            {
              title: "The X exception",
              text: "Selecting X switches the composer to immediate publishing with an explicit hint — never a silent schedule that cannot happen.",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Content calendar",
              description: "See every scheduled post on a month grid and drag to reschedule.",
              href: "/social-media-calendar",
            },
            {
              title: "Cross-platform publishing",
              description: "How one post becomes the right version for each network.",
              href: "/cross-platform-publishing",
            },
            {
              title: "Publishing to X",
              description: "What immediate publishing means for your X workflow.",
              href: "/platforms/x",
            },
          ]}
        />
        <MarketingFaq heading="Scheduler questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Schedule your first week tonight."
          text="Connect an account, write three posts, and let the queue handle the timing."
          note="Free plan: 15 posts per month, no credit card required."
        />
      </main>
      <Footer />
    </div>
  );
}
