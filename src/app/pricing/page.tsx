import type { Metadata } from "next";
import Link from "next/link";
import { NavbarState } from "@/components/landing/NavbarState";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Faq";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import {
  absoluteUrl,
  breadcrumbSchema,
  faqPageSchema,
  serializeJsonLd,
  softwareApplicationSchema,
} from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Pricing — start free, upgrade when you need more",
  description:
    "Postvia plans: Free (€0, 15 posts/month, 1 account), Growth (€20, 300 posts, 5 accounts, bulk), Scale (€50, unlimited). No credit card to start.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Postvia pricing — Free, Growth, Scale",
    description:
      "Start free with 15 posts per month. Add accounts, volume and bulk scheduling as you grow.",
    url: absoluteUrl("/pricing"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia pricing — Free, Growth, Scale",
    description: "Free €0 · Growth €20 · Scale €50. No credit card to start.",
  },
};

const FAQS = [
  {
    question: "What does the Free plan include?",
    answer:
      "15 posts per month, 1 connected account, scheduling for Instagram, Threads and TikTok, immediate publishing to X, per-platform previews and the content calendar. No credit card required.",
  },
  {
    question: "When do I need Growth?",
    answer:
      "When one account is not enough: up to 5 connected accounts, 300 posts per month, and bulk video scheduling up to 10 videos per batch.",
  },
  {
    question: "What does Scale add?",
    answer:
      "Unlimited connected accounts and unlimited monthly posts, with the same bulk scheduling, calendar and retry controls. For teams and heavy schedules.",
  },
  {
    question: "Do unused posts or deleted posts refill my quota?",
    answer:
      "No. Monthly quota counts created posts via a server-side ledger, and deleting a post never refills it. Downgrades never delete your data — only new actions are gated.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Pricing" },
            ])
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageSchema(FAQS)) }}
      />
      <NavbarState />
      <main>
        <MarketingHero
          eyebrow="Pricing"
          title="Start free. Pay when volume says so."
          description="Three plans from the same source of truth as the app itself. Every limit below is enforced server-side — what you read is what the API allows."
          breadcrumbs={[{ label: "Home", href: "/" }, { label: "Pricing" }]}
        />
        <Pricing />
        <section aria-label="Plan details" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              The limits, plainly
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { title: "Free · €0", text: "15 posts a month, 1 connected account. Scheduling, previews, calendar and retries included. Start in onboarding without a card." },
                { title: "Growth · €20", text: "300 posts a month, up to 5 accounts, bulk batches to 10 videos. For creators publishing every week." },
                { title: "Scale · €50", text: "Unlimited posts and accounts, same bulk and calendar. For teams and heavy schedules." },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl bg-panel p-5">
                  <p className="font-heading text-base font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              New users pick a plan during{" "}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                onboarding
              </Link>
              ; paid plans check out through Stripe on the billing page.
            </p>
          </div>
        </section>
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Bulk scheduling",
              description: "The Growth and Scale batch workflow in detail.",
              href: "/bulk-social-media-scheduling",
            },
            {
              title: "All features",
              description: "The full capability map behind every plan.",
              href: "/features",
            },
            {
              title: "Social media scheduler",
              description: "How queues, statuses and retries work daily.",
              href: "/social-media-scheduler",
            },
          ]}
        />
        <MarketingFaq heading="Pricing questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Start on Free tonight."
          text="Connect one account and schedule your first posts. Upgrade when the calendar says so."
          note="No credit card required. Cancel paid plans at period end without losing data."
        />
      </main>
      <Footer />
    </div>
  );
}
