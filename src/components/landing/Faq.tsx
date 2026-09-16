"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/Reveal";

const faqs = [
  {
    question: "Which platforms does Postvia support?",
    answer:
      "Postvia supports Instagram, Threads, TikTok, and X. You can connect any combination of them, subject to your plan's account limit.",
  },
  {
    question: "Can I schedule posts?",
    answer:
      "Yes. Instagram, Threads, and TikTok can be scheduled for a future date and time. X publishes immediately.",
  },
  {
    question: "Can I customize a post for each platform?",
    answer:
      "Yes. Start with one global caption, then customize individual accounts when needed. TikTok also supports its own title and publishing settings.",
  },
  {
    question: "How many accounts can I connect?",
    answer:
      "Free includes 1 connected account, Growth includes up to 5, and Scale is unlimited.",
  },
  {
    question: "How does bulk video scheduling work?",
    answer:
      "Growth and Scale let you add up to 10 videos to a batch, choose the starting time and interval, review the schedule, and create the posts at once.",
  },
  {
    question: "What can I upload?",
    answer:
      "Postvia supports common image formats plus MP4, WebM, and MOV video, with per-file upload progress. Each network applies its own media requirements before publishing.",
  },
  {
    question: "Does Postvia store my social media password?",
    answer:
      "No. Social connections use OAuth. Postvia stores access tokens rather than your social passwords.",
  },
  {
    question: "What happens if publishing fails?",
    answer:
      "Failed accounts keep their status and error information so you can retry them individually. If some accounts already published, those successful targets are left untouched.",
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
        <Reveal>
          <p className="text-sm font-medium text-muted-foreground">FAQ</p>
          <h2
            id="faq-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Questions, answered.
          </h2>
        </Reveal>
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
      className="border-t border-border bg-muted/30"
    >
      <Reveal className="mx-auto w-full max-w-3xl px-4 py-16 text-center md:px-8 md:py-24">
        <p className="text-sm font-medium text-muted-foreground">
          Free plan · No credit card
        </p>
        <h2
          id="final-cta-heading"
          className="mt-3 font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl"
        >
          Publish with less busywork.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Create once, tailor where needed, schedule ahead, and keep every
          publishing result visible.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/signup" />}
          >
            Get started free
            <ArrowRightIcon data-icon="inline-end" />
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
        <p className="mt-4 text-sm text-muted-foreground">
          15 posts/month on Free · 1 connected account · no credit card
          required
        </p>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight">postvia</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Create once. Tailor for every network. Know what published.
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
          Postvia — social publishing without the tab-hopping.
        </p>
      </div>
    </footer>
  );
}
