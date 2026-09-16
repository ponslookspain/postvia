import Link from "next/link";
import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroVisual } from "@/components/landing/HeroVisual";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto w-full max-w-6xl px-4 pt-16 pb-16 md:px-8 md:pt-24 md:pb-24"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="animate-[post-in_.5s_ease_both] motion-reduce:animate-none">
          <Badge variant="soft" className="gap-1.5 py-1 pr-3 pl-2.5">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-signal"
            />
            Instagram · Threads · TikTok · X
          </Badge>
        </div>
        <h1
          id="hero-heading"
          style={{ animationDelay: "90ms" }}
          className="mt-6 animate-[post-in_.55s_ease_both] font-heading text-5xl leading-[1.04] font-semibold tracking-tight text-balance motion-reduce:animate-none md:text-7xl"
        >
          Publish everywhere. Stay in one place.
        </h1>
        <p
          style={{ animationDelay: "180ms" }}
          className="mx-auto mt-6 max-w-xl animate-[post-in_.55s_ease_both] text-lg leading-relaxed text-pretty text-muted-foreground motion-reduce:animate-none md:text-xl"
        >
          Write one post, tailor it for every network, and schedule it from
          a single calm workspace.
        </p>
        <div
          style={{ animationDelay: "260ms" }}
          className="mt-8 flex animate-[post-in_.55s_ease_both] flex-col items-center justify-center gap-3 motion-reduce:animate-none sm:flex-row"
        >
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Get started free
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="#how" />}
          >
            See how it works
            <ArrowDownIcon data-icon="inline-end" />
          </Button>
        </div>
        <p
          style={{ animationDelay: "320ms" }}
          className="mx-auto mt-5 max-w-xl animate-[post-in_.55s_ease_both] text-sm text-muted-foreground motion-reduce:animate-none"
        >
          Free: 15 posts/month and 1 connected account. No credit card
          required.
        </p>
      </div>
      <div
        style={{ animationDelay: "380ms" }}
        className="mx-auto mt-14 max-w-5xl animate-[post-in_.6s_ease_both] motion-reduce:animate-none md:mt-20"
      >
        <HeroVisual />
        <p className="mt-8 text-center text-xs text-muted-foreground sm:mt-3">
          X publishes immediately; scheduling is available for Instagram,
          Threads, and TikTok.
        </p>
      </div>
    </section>
  );
}
