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
        <MarketingHero
          eyebrow="Plan and publish"
          title="Create once. Fit every network."
          description="The multi-target composer starts from one caption and one set of media, then lets each account diverge — with previews and validation that match the real rules of every network."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Cross-Platform Publishing" },
          ]}
        />
        <section aria-label="The publishing flow" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Create, tailor, preview, publish
            </h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                { title: "Create", text: "Global text plus images or video attached once in the composer." },
                { title: "Tailor", text: "Per-account overrides and TikTok titles, privacy and cover options." },
                { title: "Preview", text: "A platform-aware mock per network with limits and counters visible." },
                { title: "Publish", text: "Schedule ahead or publish now, with live progress and cancel." },
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
        <section aria-label="What the composer enforces" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Overrides, not copies
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  The shared caption stays the source of truth. When Threads
                  allows 500 characters and X allows 280, you edit the X
                  version in place — the shared text never forks into four
                  disconnected drafts.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  TikTok goes further with its own title and publishing
                  settings (privacy level, comments, duet, stitch, cover),
                  served per account from creator info rather than guessed.
                </p>
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Validation before regret
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Character limits with remaining counters per platform while you type.",
                    "Media rules per network: Instagram needs a photo or Reel; TikTok needs video or photos; Threads takes a single item.",
                    "Mixed-media guards: formats that cannot share one post are rejected with a named issue, not a silent failure.",
                    "Dirty-form guard and mobile action bar so an accidental tap never loses a multi-target draft.",
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
              Want the per-network format details?{" "}
              <Link href="/platform-previews" className="font-medium text-primary hover:underline">
                Platform previews show exactly what each version looks like.
              </Link>
            </p>
          </div>
        </section>
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
