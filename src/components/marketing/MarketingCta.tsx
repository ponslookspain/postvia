import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/Reveal";

export function MarketingCta({
  title,
  text,
  note,
}: {
  title: string;
  text: string;
  note?: string;
}) {
  return (
    <section aria-labelledby="marketing-cta-heading" className="border-t border-border bg-muted/30">
      <Reveal className="mx-auto w-full max-w-3xl px-4 py-14 text-center md:px-8 md:py-20">
        <h2
          id="marketing-cta-heading"
          className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
          {text}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Get started free
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/pricing" />}>
            See pricing
          </Button>
        </div>
        {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}
      </Reveal>
    </section>
  );
}

export function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      {children}
    </div>
  );
}
