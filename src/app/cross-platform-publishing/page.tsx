import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero, QuietRows, SplitSection } from "@/components/marketing/MarketingSections";
import { ComposerVisual } from "@/components/landing/ProductVisuals";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { absoluteUrl, breadcrumbSchema, faqPageSchema, serializeJsonLd } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Cross-platform publishing — create once, tailor per network",
  description:
    "Write one post and publish it to Instagram, Threads, TikTok and X. Per-account overrides, platform-aware previews and validation keep every version correct.",
  alternates: { canonical: "/cross-platform-publishing" },
  openGraph: {
    title: "Postvia publishing — one idea, every network",
    description:
      "Create once, tailor per platform, preview each version, then publish or schedule from one composer.",
    url: absoluteUrl("/cross-platform-publishing"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia publishing — one idea, every network",
    description: "Create once, tailor per platform, preview, then publish.",
  },
};

const FAQS = [
  {
    question: "Do I have to write a different post per network?",
    answer:
      "No. Start with one shared caption and shared media, then override individual accounts only where a network needs its own version — Threads keeps the long text, X gets the trimmed one.",
  },
  {
    question: "What stops me from posting the wrong format?",
    answer:
      "Structured per-platform validation with stable issue codes checks text length, media type and required attachments before anything publishes, so a text-only Instagram post never leaves the composer.",
  },
  {
    question: "Can one post mix scheduling and immediate publishing?",
    answer:
      "Yes. Instagram, Threads and TikTok targets can be scheduled while X publishes immediately — each account reports its own status afterward.",
  },
];

export default function PublishingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Features", path: "/features" },
              { name: "Cross-Platform Publishing" },
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
          title="Create once. Fit every network."
          description="The multi-target composer starts from one caption and one set of media, then lets each account diverge — with previews and validation that match the real rules of every network."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Cross-Platform Publishing" },
          ]}
          visual={<ComposerVisual />}
          secondaryHref="/platform-previews"
          secondaryLabel="See previews"
          meta={[
            { label: "Flow", value: "create → tailor → preview → publish" },
            { label: "Targets", value: "4 networks, 1 post" },
          ]}
        />
        {/* The four-version moment, full width and mirrored from the hero. */}
        <SplitSection
          title="One post, four honest versions"
          visual={<HeroVisual />}
          flip
          caption="The same launch post adapted per network: full story on Threads, trimmed on X, captioned media elsewhere."
        >
          <p>
            The channel rail is the workflow made visible: each account shows
            its adapted detail and limit counter — caption length on
            Instagram, full story on Threads, video plus title on TikTok,
            trimmed text on X.
          </p>
          <p>
            Nothing here is a mock of a mock. These are the same adaptations
            the composer produces before scheduling.
          </p>
        </SplitSection>
        <QuietRows
          title="What the composer enforces"
          intro="Guardrails with names, applied while you write."
          items={[
            {
              title: "Remaining counters",
              text: "Character limits per platform, visible while typing — not discovered after pressing publish.",
            },
            {
              title: "Media presence",
              text: "Instagram refuses text-only posts; TikTok demands video or photos. Rejected in the composer, not at publish time.",
            },
            {
              title: "No silent mixing",
              text: "Formats that cannot share one post are rejected with a named issue instead of failing halfway.",
            },
            {
              title: "TikTok depth",
              text: "Privacy level, comments, duet, stitch and cover — served per account from creator info, not guessed.",
            },
          ]}
        />
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Platform previews",
              description: "The preview and validation behind every tailored version.",
              href: "/platform-previews",
            },
            {
              title: "Social media scheduler",
              description: "What happens after you press schedule.",
              href: "/social-media-scheduler",
            },
            {
              title: "Instagram publishing",
              description: "Photos, Reels and captions — the Instagram rules in full.",
              href: "/platforms/instagram",
            },
          ]}
        />
        <MarketingFaq heading="Publishing questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Stop rewriting the same post four times."
          text="Write it once, tailor where it matters, and let each network receive its best version."
          note="Free plan: 15 posts per month, no credit card required."
        />
      </main>
      <Footer />
    </div>
  );
}
