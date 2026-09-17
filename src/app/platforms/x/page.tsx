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
  title: "Publish to X — immediate posting with media",
  description:
    "Publish text posts up to 280 characters to X with up to 4 photos, 1 GIF or 1 video. X publishes immediately in Postvia — scheduling is not available for X.",
  alternates: { canonical: "/platforms/x" },
  openGraph: {
    title: "Postvia for X — immediate publishing",
    description:
      "Short posts with photos, GIF or video. X publishes immediately; the composer says so upfront.",
    url: absoluteUrl("/platforms/x"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for X — immediate publishing",
    description: "280 characters with media, published immediately.",
  },
};

const FAQS = [
  {
    question: "Can I schedule posts to X?",
    answer:
      "No. X publishes immediately in Postvia. Selecting an X account switches the composer to immediate publishing with an explicit hint, and the API rejects scheduled X posts with a clear error.",
  },
  {
    question: "What media can I attach to an X post?",
    answer:
      "Up to 4 photos, 1 GIF, or 1 video per post. Photos and video can never share one post, and stills over 5 MB are rejected before publish.",
  },
  {
    question: "How does X fit a multi-platform post?",
    answer:
      "Write the shared caption, trim the X version to 280 characters, and publish: X goes out now while Instagram, Threads and TikTok targets follow their own schedule.",
  },
];

export default function XPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "X" },
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
          title="X, published now — honestly."
          description="Short posts with media that go out immediately. Postvia never promises X scheduling; the composer tells you upfront and the workflow respects it."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "X" },
          ]}
        />
        <section aria-label="X capabilities" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  What ships to X
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Text posts up to 280 characters with a live remaining counter.",
                    "Up to 4 photos, 1 GIF, or 1 video attached via chunked upload.",
                    "Preview renders the trimmed X version before you confirm.",
                    "Immediate publish with per-account status and individual retry.",
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
                  No scheduling — by rule, not by accident
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Scheduling for X is not available yet. The composer detects
                  X in your selection and shows the immediate-publishing hint
                  instead of the schedule dialog; the posts API enforces the
                  same rule server-side.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  This page is titled publishing, not scheduling, on purpose:
                  search intent and product truth stay aligned.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="X workflow" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              X inside the shared workflow
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { title: "Trim the version", text: "Override the X text to 280 characters; the shared caption stays long elsewhere." },
                { title: "Attach the media", text: "Photos, GIF or video validated against X limits before publish." },
                { title: "Publish and check", text: "X goes out now with its own status while other networks queue." },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl bg-panel p-5">
                  <p className="font-heading text-base font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Need the scheduled counterpart?{" "}
              <Link href="/social-media-scheduler" className="font-medium text-primary hover:underline">
                How scheduling works for Instagram, Threads and TikTok.
              </Link>
            </p>
          </div>
        </section>
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Threads publishing",
              description: "The 500-character scheduled sibling of X posts.",
              href: "/platforms/threads",
            },
            {
              title: "Cross-platform publishing",
              description: "How immediate X and scheduled networks share one post.",
              href: "/cross-platform-publishing",
            },
            {
              title: "Platform previews",
              description: "See the trimmed X version before it goes out.",
              href: "/platform-previews",
            },
          ]}
        />
        <MarketingFaq heading="X questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Post to X without the tab."
          text="Trim, attach, publish now — and keep the result next to your scheduled posts."
          note="X publishing works on all plans, including Free."
        />
      </main>
      <Footer />
    </div>
  );
}
