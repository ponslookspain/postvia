"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Reveal } from "@/components/landing/Reveal";
import { Button } from "@/components/ui/button";

const faqs: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What is Postvia?",
    answer:
      "Postvia is a workspace for publishing to social media. You write a post once, preview it per platform, and schedule or publish it to every connected profile from one place.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Instagram, Threads, TikTok and X. Connect any combination of them; more platforms will follow.",
  },
  {
    question: "Can I schedule posts?",
    answer:
      "Yes — pick a date and time and the post goes out automatically. X publishes immediately; scheduling is available for Threads, TikTok and Instagram.",
  },
  {
    question: "Can I customize content per platform?",
    answer:
      "Yes. Every post starts from one global text, and each connected account can carry its own version — including TikTok titles and posting options.",
  },
  {
    question: "Can I upload videos?",
    answer:
      "Yes. MP4 and WebM videos up to 100 MB, and JPG, PNG, WebP or GIF images up to 10 MB. You see upload progress per file.",
  },
  {
    question: "How does bulk video scheduling work?",
    answer:
      "Drop up to 10 videos, choose a start date, a timezone and an interval. Each video becomes its own scheduled post, and you land on the calendar with the full batch.",
  },
  {
    question: "Can I connect multiple accounts?",
    answer:
      "Yes, including several handles on the same platform where supported. Each account can be reconnected or disconnected independently.",
  },
  {
    question: "How does media storage work?",
    answer:
      "Uploads land in your private store. Still images are kept as optimized canonical copies, videos untouched. Files without a post are swept automatically, and everything is removed when you delete the post.",
  },
  {
    question: "Is my social password stored?",
    answer:
      "No. Connections use official OAuth, so Postvia only ever holds access tokens — never your social passwords. Disconnecting removes access.",
  },
  {
    question: "What happens when a scheduled post fails?",
    answer:
      "The post keeps its error message and every failed target can be retried individually from the post page. Partially published posts show exactly which platforms succeeded.",
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
  answer: React.ReactNode;
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
        className={cn(
          "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
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
    <section id="faq" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto w-full max-w-3xl px-4 py-14 md:px-8 md:py-20">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Questions, answered.
          </h2>
        </Reveal>
        <Reveal className="mt-8" delayMs={80}>
          <div>
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
        </Reveal>
        <Reveal className="mt-10 text-center" delayMs={120}>
          <p className="text-sm text-muted-foreground">
            Ready to publish everywhere?{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
              Get started
            </Link>
            .
          </p>
          <div className="mt-4 flex justify-center">
            <Button nativeButton={false} render={<Link href="/signup" />}>
              Get started
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center md:px-8 md:py-24">
        <Reveal>
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Stop posting one app at a time.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            One workspace for writing, scheduling and publishing everywhere
            you are.
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              Get started
            </Button>
          </div>
        </Reveal>
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
              Publish everywhere. Stay in one place.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2.5 sm:grid-cols-3">
            {[
              { href: "#product", label: "Product" },
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
