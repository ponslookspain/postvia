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
        <MarketingHero
          eyebrow="Create"
          title="Approve the post you will actually publish."
          description="Every selected network renders its own mock — with its limits, media rules and counters — before anything is scheduled or sent. No surprises after the fact."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Platform Previews" },
          ]}
        />
        <section aria-label="Preview capabilities" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  One switcher, four truths
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  The platform switcher renders a single mock at a time — an
                  X post that looks like X, a Threads post that looks like
                  Threads, an Instagram caption paired with its required
                  photo or Reel, a TikTok post with its title and settings.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Switching never loses your text: the shared caption
                  persists while each mock shows how much of it survives that
                  network&apos;s rules.
                </p>
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Validation with names, not shrugs
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Remaining counters per platform, visible while you type — not after you press publish.",
                    "Media presence checks: Instagram refuses text-only posts before they leave the composer.",
                    "Mixed-media conflicts named per platform, with the exact combination that cannot ship together.",
                    "TikTok publishing options validated per account: privacy level, comments, duet, stitch and cover.",
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
        <section aria-label="Customization" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Customize the version, keep the idea
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { title: "Per-account text", text: "Override the caption for one account when its limit or audience demands it." },
                { title: "TikTok titles", text: "Global post text becomes the default caption; per-target titles and descriptions refine it." },
                { title: "Posting options", text: "Privacy, comments, duet, stitch and cover timestamp — set where TikTok actually supports them." },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl bg-panel p-5">
                  <p className="font-heading text-base font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              See how tailored posts ship together:{" "}
              <Link href="/cross-platform-publishing" className="font-medium text-primary hover:underline">
                cross-platform publishing, end to end.
              </Link>
            </p>
          </div>
        </section>
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
