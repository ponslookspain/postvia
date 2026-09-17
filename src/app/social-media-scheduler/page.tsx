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
        <MarketingHero
          eyebrow="Plan and publish"
          title="A scheduler that treats every network honestly."
          description="Pick a date and time once. Postvia queues the post for Instagram, Threads and TikTok — and tells you plainly that X publishes immediately instead of pretending otherwise."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Features", href: "/features" },
            { label: "Social Media Scheduler" },
          ]}
        />
        <section aria-label="How scheduling works" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  Schedule from the composer
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Write your post, attach media once, and choose a future date
                  and time in the schedule dialog. The post moves through a
                  visible lifecycle — draft, scheduled, publishing, published —
                  instead of disappearing into a black box.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  If anything fails, only the affected account needs attention:
                  failed targets keep their error message and can be retried
                  individually while successful ones stay untouched.
                </p>
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  What scheduling respects
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Per-account statuses: each connected profile reports pending, publishing, published or failed on its own row.",
                    "Connected-account limits: Free includes 1 account, Growth up to 5, Scale unlimited — the composer only offers what your plan allows.",
                    "Monthly quota: every created post counts once, even if you delete it later, so the schedule you see is the schedule you keep.",
                    "X honesty: selecting an X account switches the composer to immediate publishing with an explicit hint, never a silent schedule.",
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
        <section aria-label="Scheduling workflow" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              From idea to published, in four moves
            </h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                { title: "Write once", text: "One shared caption for every selected account." },
                { title: "Tailor", text: "Adjust text or media where a network needs its own version." },
                { title: "Schedule", text: "Pick the date and time; the post waits in your queue." },
                { title: "Check", text: "Watch each account report its own result after publish." },
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
            <p className="mt-6 text-sm text-muted-foreground">
              Planning a batch of videos instead?{" "}
              <Link href="/bulk-social-media-scheduling" className="font-medium text-primary hover:underline">
                Bulk scheduling turns up to 10 videos into dated posts at once.
              </Link>
            </p>
          </div>
        </section>
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
