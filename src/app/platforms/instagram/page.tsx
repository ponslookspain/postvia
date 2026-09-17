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
  title: "Schedule Instagram posts — photos and Reels from Postvia",
  description:
    "Schedule Instagram photos (JPEG) and Reels (MP4) with captions up to 2,200 characters. Preview the caption, pass validation, and track publish status per account.",
  alternates: { canonical: "/platforms/instagram" },
  openGraph: {
    title: "Postvia for Instagram — photos and Reels, scheduled",
    description:
      "One JPEG photo or one MP4 Reel per post, captions up to 2,200 characters, scheduled from one workspace.",
    url: absoluteUrl("/platforms/instagram"),
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia for Instagram — photos and Reels, scheduled",
    description: "Schedule Instagram photos and Reels with captions.",
  },
};

const FAQS = [
  {
    question: "What Instagram formats does Postvia publish?",
    answer:
      "A single JPEG photo or a single MP4 Reel per post, each with a caption of up to 2,200 characters. Text-only posts are not publishable to Instagram.",
  },
  {
    question: "Does Postvia support carousels or Stories?",
    answer:
      "No. Postvia publishes single-photo and single-Reel posts only. Carousels, Stories and alt text are outside the current scope, and the composer rejects anything else with an explicit error.",
  },
  {
    question: "Can I schedule Instagram posts?",
    answer:
      "Yes. Instagram supports future-dated scheduling with per-account status tracking, retries and calendar rescheduling.",
  },
];

export default function InstagramPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Platforms", path: "/features" },
              { name: "Instagram" },
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
          title="Instagram, scheduled without the juggling."
          description="Photos and Reels with real captions, validated before they ship and scheduled from the same queue as your other networks."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Instagram" },
          ]}
        />
        <section aria-label="Instagram capabilities" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  What ships to Instagram
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Single JPEG photo with a caption of up to 2,200 characters.",
                    "Single MP4 Reel with the same caption treatment.",
                    "Preview shows the caption version Instagram will receive.",
                    "Scheduling with per-account status: published, publishing or failed.",
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
                  What Postvia does not claim
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  The Instagram Content Publishing API supports more than
                  Postvia ships — carousels, Stories, alt text. Those are
                  conscious scope decisions, not gaps you will discover at
                  publish time.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Anything outside photo-or-Reel fails closed in the composer
                  with a named validation issue, before scheduling. You learn
                  the boundary while writing, not after a failed publish.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="Instagram workflow" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Instagram inside the shared workflow
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { title: "Attach once", text: "Add the photo or Reel in the composer; Instagram's media rules apply automatically." },
                { title: "Caption with a counter", text: "2,200 characters with remaining count visible while you write." },
                { title: "Schedule and check", text: "Future-dated queueing, calendar placement, and per-account result." },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl bg-panel p-5">
                  <p className="font-heading text-base font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Pair Instagram with short video:{" "}
              <Link href="/platforms/tiktok" className="font-medium text-primary hover:underline">
                how TikTok publishing works.
              </Link>
            </p>
          </div>
        </section>
        <RelatedLinks
          heading="Keep exploring"
          links={[
            {
              title: "Social media scheduler",
              description: "How Instagram scheduling, queues and statuses work.",
              href: "/social-media-scheduler",
            },
            {
              title: "Platform previews",
              description: "See the Instagram caption version before it ships.",
              href: "/platform-previews",
            },
            {
              title: "Content calendar",
              description: "Place Instagram posts on the month grid.",
              href: "/social-media-calendar",
            },
          ]}
        />
        <MarketingFaq heading="Instagram questions, answered." faqs={FAQS} />
        <MarketingCta
          title="Put Instagram on a schedule."
          text="Photos and Reels with captions, queued alongside your other networks."
          note="Free plan: 15 posts per month, 1 connected account."
        />
      </main>
      <Footer />
    </div>
  );
}
