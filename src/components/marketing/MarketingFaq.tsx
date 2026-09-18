"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketingFaq({
  heading,
  intro,
  faqs,
}: {
  heading: string;
  intro?: string;
  faqs: { question: string; answer: string }[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section aria-labelledby="marketing-faq-heading" className="border-t border-border">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-8 md:py-16">
        <h2
          id="marketing-faq-heading"
          className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl"
        >
          {heading}
        </h2>
        {intro && (
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">{intro}</p>
        )}
        <div className="mt-8">
          {faqs.map((faq, index) => {
            const open = openIndex === index;
            return (
              <div key={faq.question} className="border-t border-border last:border-b">
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                    aria-expanded={open}
                    aria-controls={`mfaq-panel-${index}`}
                    id={`mfaq-button-${index}`}
                    className="flex w-full items-center justify-between gap-4 rounded-sm py-4 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="text-prose font-medium">{faq.question}</span>
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
                  id={`mfaq-panel-${index}`}
                  role="region"
                  aria-labelledby={`mfaq-button-${index}`}
                  hidden={!open}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-2xl pb-5 text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
