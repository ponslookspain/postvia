import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { NavbarState } from "@/components/landing/NavbarState";
import { Footer } from "@/components/landing/Faq";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RelatedLinks } from "@/components/marketing/MarketingCards";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MarketingCta } from "@/components/marketing/MarketingCta";
import { PageHero } from "@/components/marketing/MarketingSections";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
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
      "15 posts per month, 1 connected account, scheduling for Instagram, Threads and TikTok, immediate publishing to X, per-platform previews and the content calendar. Videos up to 50 MB, 2 media files per post. No credit card required.",
  },
  {
    question: "When do I need Growth?",
    answer:
      "When one account is not enough: up to 5 connected accounts, 300 posts per month, bulk video scheduling up to 10 videos per batch, videos up to 100 MB and 4 media files per post.",
  },
  {
    question: "What does Scale add?",
    answer:
      "Unlimited connected accounts and unlimited monthly posts, with the same bulk scheduling, calendar, retry controls and media limits as Growth. For teams and heavy schedules.",
  },
  {
    question: "Do unused posts or deleted posts refill my quota?",
    answer:
      "No. Monthly quota counts created posts via a server-side ledger, and deleting a post never refills it. Downgrades never delete your data — only new actions are gated.",
  },
  {
    question: "How long do you keep my uploaded photos and videos?",
    answer:
      "Once a post is fully published, its original media is kept for 3 months on Free and 12 months on Growth and Scale, then automatically removed to control storage cost — the post itself, its caption and its publishing history are never deleted. Draft and scheduled posts are never affected.",
  },
];

function formatCount(value: number | null, singular: string, plural: string): string {
  if (value === null) return "Unlimited";
  if (value === 0) return "—";
  return `${value} ${value === 1 ? singular : plural}`;
}

function PlanCta({ planId, highlighted }: { planId: string; highlighted?: boolean }) {
  return (
    <Button
      asChild
      variant={highlighted ? "default" : "outline"}
      className="mt-5 w-full"
    >
      <Link href={planId === "free" ? "/signup" : `/signup?plan=${planId}`}>
        {planId === "free" ? "Get started free" : `Choose ${PLANS.find((p) => p.id === planId)?.name}`}
      </Link>
    </Button>
  );
}

const ROWS: { label: string; value: (planId: string) => string }[] = [
  {
    label: "Monthly posts",
    value: (id) =>
      formatCount(
        PLANS.find((p) => p.id === id)!.entitlements.monthlyPosts,
        "post",
        "posts"
      ),
  },
  {
    label: "Connected accounts",
    value: (id) => {
      const v = PLANS.find((p) => p.id === id)!.entitlements.maxTotalAccounts;
      if (v === null) return "Unlimited";
      return `${v} ${v === 1 ? "account" : "accounts"}`;
    },
  },
  {
    label: "Bulk video scheduling",
    value: (id) => {
      const v = PLANS.find((p) => p.id === id)!.entitlements.maxBulkVideos;
      return v === 0 ? "—" : `Up to ${v} videos per batch`;
    },
  },
  { label: "Content calendar", value: () => "Included" },
  { label: "Per-platform previews", value: () => "Included" },
  { label: "Retry and reschedule", value: () => "Included" },
  {
    label: "Max video size",
    value: (id) =>
      `${Math.round(PLANS.find((p) => p.id === id)!.entitlements.maxVideoBytes / (1024 * 1024))} MB`,
  },
  {
    label: "Media files per post",
    value: (id) => {
      const v = PLANS.find((p) => p.id === id)!.entitlements.maxMediaPerPost;
      return `${v} ${v === 1 ? "file" : "files"}`;
    },
  },
  {
    label: "Media kept after publishing",
    value: (id) => {
      const ms = PLANS.find((p) => p.id === id)!.entitlements.mediaRetentionMs;
      if (ms === null) return "Forever";
      const months = Math.round(ms / (30 * 86_400_000));
      return `${months} ${months === 1 ? "month" : "months"}`;
    },
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
        <PageHero
          eyebrow="Pricing"
          title="Start free. Pay when volume says so."
          description="Three plans from the same source of truth as the app itself. Every limit below is enforced server-side — what you read is what the API allows."
          breadcrumbs={[{ label: "Home", href: "/" }, { label: "Pricing" }]}
          meta={[
            { label: "Free", value: "€0 · 15 posts" },
            { label: "Growth", value: "€20 · 300 posts" },
            { label: "Scale", value: "€50 · unlimited" },
          ]}
        />
        {/* Desktop comparison table — one structure, three plans. */}
        <section aria-label="Plan comparison" className="border-t border-border">
          <div className="mx-auto hidden w-full max-w-6xl px-8 py-16 md:block md:py-20">
            <div
              role="table"
              aria-label="Postvia plan comparison"
              className="overflow-hidden rounded-2xl bg-panel"
            >
              <div role="row" className="grid grid-cols-4 border-b border-border">
                <div role="columnheader" className="p-6">
                  <p className="font-heading text-base font-semibold">Compare plans</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Limits, plainly. No credit card to start.
                  </p>
                </div>
                {PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    role="columnheader"
                    className={cn("p-6", plan.highlighted && "bg-muted/50")}
                  >
                    <p className="flex items-center gap-2 font-heading text-base font-semibold">
                      {plan.name}
                      {plan.highlighted && (
                        <Badge variant="strong" color="primary">Popular</Badge>
                      )}
                    </p>
                    <p className="mt-2">
                      <span className="font-heading text-4xl font-semibold tracking-tight tabular-nums">
                        ${plan.price}
                      </span>{" "}
                      <span className="text-sm text-muted-foreground">/ month</span>
                    </p>
                  </div>
                ))}
              </div>
              {ROWS.map((row) => (
                <div key={row.label} role="row" className="grid grid-cols-4 border-b border-border last:border-b-0">
                  <div role="rowheader" className="p-6 text-sm text-muted-foreground">
                    {row.label}
                  </div>
                  {PLANS.map((plan) => (
                    <div
                      key={plan.id}
                      role="cell"
                      className={cn(
                        "flex items-center gap-2 p-6 text-sm font-medium",
                        plan.highlighted && "bg-muted/50"
                      )}
                    >
                      {row.value(plan.id) !== "—" && (
                        <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      )}
                      {row.value(plan.id)}
                    </div>
                  ))}
                </div>
              ))}
              <div role="row" className="grid grid-cols-4 border-t border-border">
                <div className="p-6" />
                {PLANS.map((plan) => (
                  <div key={plan.id} className={cn("p-6 pt-2", plan.highlighted && "bg-muted/50")}>
                    <PlanCta planId={plan.id} highlighted={plan.highlighted} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Mobile: one stacked block per plan — same data, no table. */}
          <div className="mx-auto w-full max-w-6xl px-4 py-14 md:hidden">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Compare plans
            </h2>
            <div className="mt-6 flex flex-col gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-2xl bg-panel p-6",
                    plan.highlighted && "ring-1 ring-primary/40 ring-inset"
                  )}
                >
                  <p className="flex items-center justify-between gap-2 font-heading text-base font-semibold">
                    {plan.name}
                    {plan.highlighted && (
                      <Badge variant="strong" color="primary">Popular</Badge>
                    )}
                  </p>
                  <p className="mt-2">
                    <span className="font-heading text-4xl font-semibold tracking-tight tabular-nums">
                      ${plan.price}
                    </span>{" "}
                    <span className="text-sm text-muted-foreground">/ month</span>
                  </p>
                  <dl className="mt-4 border-t border-border">
                    {ROWS.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
                        <dt className="text-xs text-muted-foreground">{row.label}</dt>
                        <dd className="text-right text-sm font-medium">{row.value(plan.id)}</dd>
                      </div>
                    ))}
                  </dl>
                  <PlanCta planId={plan.id} highlighted={plan.highlighted} />
                </div>
              ))}
            </div>
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
