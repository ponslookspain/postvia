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
  title: "Schedule Threads posts — text, images and video",
  description:
    "Schedule Threads text posts up to 500 characters with one image or video. Preview the Threads version, validate limits, and track status per account.",
  alternates: { canonical: "/platforms/threads" },
  openGraph: {
    title: "Postvia for Threads — text-first, scheduled",
    description:
      "500 characters with single media support. Scheduled from one workspace with per-account statuses.",
    url: absoluteUrl("/platforms/threads"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for Threads — text-first, scheduled",
    description: "Schedule Threads text, image and video posts.",
  },
};

const FAQS = [
  {
    question: "What Threads formats does Postvia publish?",
    answer:
      "Text up to 500 characters, optionally with one image or one video. Multi-item carousels are outside the current scope and are rejected in the composer with an explicit error.",
  },
  {
    question: "Can I schedule Threads posts?",
    answer:
      "Yes. Threads supports future-dated scheduling with per-account status tracking and calendar rescheduling.",
  },
  {
    question: "How does Threads fit cross-platform posts?",
    answer:
      "Threads usually keeps the longest version of your shared caption while shorter networks get trimmed overrides — one idea, honestly adapted per limit.",
  },
];

export default function ThreadsPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "Threads" },
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
          title="Threads, where the long version lives."
          description="Text-first posts up to 500 characters with a single image or video — scheduled from the same composer as everything else."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Threads" },
          ]}
        />
        <section aria-label="Threads capabilities" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  What ships to Threads
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Text posts up to 500 characters — the longest short-form limit Postvia serves.",
                    "One image (JPEG/PNG/WebP/GIF) or one MP4 video per post.",
                    "Preview renders the Threads version with its counter before scheduling.",
                    "Scheduling with per-account status and calendar placement.",
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
                  Single media, stated plainly
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  The Threads API supports carousels, but Postvia publishes
                  single-media posts only — a product scope decision. The
                  composer fails closed on multi-file Threads input instead
                  of letting the publish fail later.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  In practice this keeps Threads fast: one thought, one
                  attachment, one preview, one schedule slot.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="Threads workflow" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Threads inside the shared workflow
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { title: "Keep the story", text: "Threads holds the full 500-character version of your caption." },
                { title: "Trim elsewhere", text: "X and other limits get their own overrides without touching Threads." },
                { title: "Schedule together", text: "One date queues Threads alongside Instagram and TikTok." },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl bg-panel p-5">
                  <p className="font-heading text-base font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Compare the short-form sibling:{" "}
              <Link href="/platforms/x" className="font-medium text-primary hover:underline">
                publishing to X, immediately.
              </Link>
            </p>
          </div>
        </section>
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Publishing to X",
              description: "The 280-character immediate counterpart to Threads.",
              href: "/platforms/x",
            },
            {
              title: "Social media scheduler",
              description: "How Threads scheduling and statuses work.",
              href: "/social-media-scheduler",
            },
            {
              title: "Platform previews",
              description: "See the Threads version before it ships.",
              href: "/platform-previews",
            },
          ]}
        />
        <MarketingFaq heading="Threads questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Give Threads the full story."
          text="500 characters with media, scheduled from the same queue as the rest."
          note="Free plan: 15 posts per month, 1 connected account."
        />
      </main>
      <Footer />
    </div>
  );
}
