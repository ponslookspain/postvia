"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

const faqs = [
  {
    question: "Which platforms are supported?",
    answer:
      "Instagram, Threads, TikTok, and X. Connect any combination of them. Instagram publishes a single JPEG photo or MP4 reel with a caption; TikTok publishes video or up to 4 photos with titles and posting options.",
  },
  {
    question: "Can I schedule posts?",
    answer:
      "Yes — pick a date and time and the post goes out automatically. X publishes immediately; scheduling is available for Threads, TikTok, and Instagram.",
  },
  {
    question: "Can I customize content per platform?",
    answer:
      "Yes. Every post starts from one global caption, and each connected account can carry its own version — including TikTok titles, descriptions, privacy level, comment, duet and stitch settings, and cover selection.",
  },
  {
    question: "Can I connect multiple accounts?",
    answer:
      "Yes, up to your plan's total limit (Free: 1, Growth: 5, Scale: unlimited), including several handles on the same platform where supported. Each account reconnects or disconnects independently.",
  },
  {
    question: "How does bulk video scheduling work?",
    answer:
      "Drop up to 10 videos, choose a start date, a timezone, and an interval. Each video becomes its own scheduled post on the calendar. Bulk is included in Growth and Scale; the Free plan schedules one post at a time.",
  },
  {
    question: "What can I upload?",
    answer:
      "MP4, WebM, and MOV video up to 100 MB, and JPG, PNG, WebP, or GIF images up to 10 MB, with per-file upload progress. Each network enforces its own media rules — for example, Threads accepts one image or MP4 video, and Instagram requires media on every post.",
  },
  {
    question: "Is my social password stored?",
    answer:
      "No. Connections use official OAuth, so Postvia only ever holds access tokens — never your social passwords. Uploads live in a private store, and disconnecting removes access.",
  },
  {
    question: "What happens when a scheduled post fails?",
    answer:
      "The post keeps its error message and every failed target can be retried individually from the post page. Partially published posts show exactly which networks succeeded, and retries never repost what already published.",
  },
];

function FaqItem({
  question,
  answer,
  open,
  onToggle,
  index,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <div className="border-t border-border last:border-b">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`faq-panel-${index}`}
          id={`faq-button-${index}`}
          className="flex w-full items-center justify-between gap-4 rounded-sm py-4 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="text-[15px] font-medium">{question}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
      </h3>
      <div
        id={`faq-panel-${index}`}
        role="region"
        aria-labelledby={`faq-button-${index}`}
        hidden={!open}
        className="grid grid-rows-[1fr] motion-reduce:transition-none"
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-5 text-sm leading-relaxed text-muted-foreground">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 border-t border-border"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-14 md:px-8 md:py-20">
        <h2
          id="faq-heading"
          className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          Questions, answered.
        </h2>
        <div className="mt-8">
          {faqs.map((faq, index) => (
            <FaqItem
              key={faq.question}
              index={index}
              question={faq.question}
              answer={faq.answer}
              open={openIndex === index}
              onToggle={() =>
                setOpenIndex((current) => (current === index ? null : index))
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="border-t border-border"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center md:px-8 md:py-24">
        <h2
          id="final-cta-heading"
          className="text-4xl font-semibold tracking-tight text-balance md:text-5xl"
        >
          Publish everywhere from one calm workspace.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Free plan: 15 posts per month, 1 connected account, no credit card
          required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/signup" />}
          >
            Get started free
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="#pricing" />}
          >
            See pricing
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight">postvia</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Write once. Tailor for every network. Know exactly what
              published.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-12 gap-y-2.5 sm:grid-cols-3"
          >
            {[
              { href: "#how", label: "How it works" },
              { href: "#pricing", label: "Pricing" },
              { href: "#faq", label: "FAQ" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
              { href: "/login", label: "Sign in" },
              { href: "/signup", label: "Sign up" },
            ].map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Postvia — one workspace for social publishing.
        </p>
      </div>
    </footer>
  );
}
