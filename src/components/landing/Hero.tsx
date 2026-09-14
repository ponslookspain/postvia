import Link from "next/link";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ProductShot } from "@/components/landing/ProductShot";

const platforms = [
  { id: "INSTAGRAM", label: "Instagram" },
  { id: "THREADS", label: "Threads" },
  { id: "TIKTOK", label: "TikTok" },
  { id: "X", label: "X" },
] as const;

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto w-full max-w-6xl px-4 pt-16 pb-10 md:px-8 md:pt-24 md:pb-14"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {platforms.map((platform) => (
            <Badge key={platform.id} variant="secondary">
              <PlatformIcon platform={platform.id} />
              {platform.label}
            </Badge>
          ))}
        </div>
        <h1
          id="hero-heading"
          className="mt-6 text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-7xl"
        >
          Write once. Tailor for every network. Know exactly what published.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          Postvia publishes to Instagram, Threads, TikTok, and X from one
          composition workflow — with per-platform customization and a
          scheduling calendar.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Get started free
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
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
          Free plan: 15 posts per month and 1 connected account. No credit
          card required. X publishes immediately; scheduling is available
          for Threads, TikTok, and Instagram.
        </p>
      </div>
      <div className="mx-auto mt-12 max-w-4xl md:mt-16">
        <ProductShot
          src="/landing/composer.svg"
          alt="Postvia composer showing a global caption with per-platform previews for Instagram, Threads, TikTok, and X"
          priority
        />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Interim crop — replace with a capture of /posts/new. See
          ProductShot docs for the shot list.
        </p>
      </div>
    </section>
  );
}
