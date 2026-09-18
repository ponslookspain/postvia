import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, QuietRows, SplitSection } from "@/components/marketing/MarketingSections";
import { ComposerVisual, PublishStatusCard } from "@/components/landing/ProductVisuals";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Platform previews — see every version before publishing",
  description:
    "Platform-aware previews with per-network validation: character limits, media rules, TikTok titles and per-account customization before you schedule or publish.",
  alternates: { canonical: "/platform-previews" },
  openGraph: {
    title: "Postvia previews — every network, before it ships",
    description:
      "Mock posts per platform with limits, counters and validation. Customize per account with confidence.",
    url: absoluteUrl("/platform-previews"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia previews — every network, before it ships",
    description: "Platform-aware previews with validation per network.",
  },
};

const FAQS = [
  {
    question: "What does a preview actually show?",
    answer:
      "A mock post per selected platform — the adapted text, the attached media, and the network's limits with remaining counters — so the version you approve is the version that publishes.",
  },
  {
    question: "What gets validated in the preview?",
    answer:
      "Text length per network (Threads 500, X 280, Instagram caption 2,200, TikTok title rules), media presence and type, mixed-media conflicts, and TikTok-specific settings. Issues carry stable codes, not vague warnings.",
  },
  {
    question: "Can I change one network without touching the others?",
    answer:
      "Yes. Per-account overrides edit a single network's text, and TikTok targets support their own title, description and publishing options — the shared caption stays intact.",
  },
];

export default function PreviewsPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Features", path: "/features" },
              { name: "Platform Previews" },
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
          eyebrow="Create"
          title="Approve the post you will actually publish."
          description="Every selected network renders its own mock — with its limits, media rules and counters — before anything is scheduled or sent. No surprises after the fact."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Platform Previews" },
          ]}
          visual={<ComposerVisual />}
          secondaryHref="/cross-platform-publishing"
          secondaryLabel="How publishing works"
          meta={[
            { label: "Limits", value: "280 · 500 · 2,200 · TikTok titles" },
            { label: "Validation", value: "named issues, pre-publish" },
          ]}
        />
        <SplitSection
          title="From preview to outcome"
          visual={<PublishStatusCard />}
          flip
          caption="Approved versions become per-account statuses: published, publishing, or failed with retry."
        >
          <p>
            The version you approve is the version that ships. After publish,
            the same per-account thinking continues: each network reports
            its own result on its own row.
          </p>
          <p>
            A failure on one account never rewrites the story for the rest —
            retry the failed target and leave the published ones untouched.
          </p>
        </SplitSection>
        <QuietRows
          title="Validation with names, not shrugs"
          intro="What the preview checks while you write."
          items={[
            {
              title: "Remaining counters",
              text: "Per-platform counts visible while typing — Threads 500, X 280, Instagram caption 2,200, TikTok title rules.",
            },
            {
              title: "Media presence",
              text: "Instagram refuses text-only posts; TikTok demands video or photos. Stopped in the composer, not at publish.",
            },
            {
              title: "Mixed-media conflicts",
              text: "Combinations that cannot ship together are named per platform with the exact offending mix.",
            },
            {
              title: "Per-account overrides",
              text: "Edit one network's text or TikTok options in place. The shared caption never forks into disconnected drafts.",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Cross-platform publishing",
              description: "The composer flow that previews belong to.",
              href: "/cross-platform-publishing",
            },
            {
              title: "Threads publishing",
              description: "500 characters and single media — the Threads rules.",
              href: "/platforms/threads",
            },
            {
              title: "Instagram publishing",
              description: "Captions, photos and Reels — the Instagram rules.",
              href: "/platforms/instagram",
            },
          ]}
        />
        <MarketingFaq heading="Preview questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Look before it ships."
          text="Preview every network's version, fix the flagged issues, then schedule with confidence."
          note="Previews and validation are available on all plans, including Free."
        />
      </main>
      <Footer />
    </div>
  );
}
