import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Reveal } from "@/components/landing/Reveal";

const versions = [
  {
    platform: "THREADS",
    label: "Threads",
    text: "Keep the full story where longer text fits.",
    note: "Up to 500 characters · 1 image or video",
  },
  {
    platform: "X",
    label: "X",
    text: "Trimmed and ready for immediate publishing.",
    note: "Up to 280 characters · up to 4 photos, 1 GIF, or 1 video",
  },
  {
    platform: "TIKTOK",
    label: "TikTok",
    text: "The same idea as a video or photo post.",
    note: "Title and publishing settings supported",
  },
  {
    platform: "INSTAGRAM",
    label: "Instagram",
    text: "The visual version with its caption.",
    note: "Caption up to 2,200 characters · photo or Reel required",
  },
] as const;

/**
 * CREATE chapter of the product story: one caption, per-network
 * adaptations. Editorial split — long-form source on the left,
 * adapted versions as a quiet delivery list on the right.
 */
export function TailorPreview() {
  return (
    <section
      id="product"
      aria-labelledby="preview-heading"
      className="scroll-mt-20 border-y border-border bg-muted/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">
            In detail · Create
          </p>
          <h2
            id="preview-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            One idea. A better fit for every network.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Start with a shared message, then adjust each account for its
            format, limits, and audience before anything goes live.
          </p>
        </Reveal>
        <div className="mt-10 grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6">
          <Reveal>
            <Card>
              <CardContent className="p-6 md:p-8">
                <Badge variant="secondary">Shared caption</Badge>
                <p className="mt-4 font-heading text-xl leading-relaxed text-pretty md:text-2xl">
                  “Morning launch is live — our biggest update yet. Here is
                  everything that changed and why it matters for your week.”
                </p>
                <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                  Postvia checks each connected network against its own
                  publishing rules before you schedule or publish. Add images
                  or video once; each network&apos;s media rules apply
                  automatically.
                </p>
              </CardContent>
            </Card>
          </Reveal>
          <Reveal as="ul" delay={150} className="flex flex-col gap-2.5">
            {versions.map((version) => (
              <li
                key={version.platform}
                className="rounded-xl border border-border bg-card p-3.5 transition-colors duration-200 hover:border-foreground/20 motion-reduce:transition-none"
              >
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={version.platform} />
                  <span className="text-sm font-medium">{version.label}</span>
                  <Badge variant="secondary" className="ml-auto">
                    Adapted
                  </Badge>
                </span>
                <span className="mt-1.5 block text-sm text-muted-foreground">
                  {version.text}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {version.note}
                </span>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
