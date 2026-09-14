import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    text: "Keep it concise and ready for immediate publishing.",
    note: "Up to 280 characters · up to 4 photos, 1 GIF, or 1 video · publishes immediately",
  },
  {
    platform: "TIKTOK",
    label: "TikTok",
    text: "Turn the same idea into a video or photo post.",
    note: "Title and publishing settings supported",
  },
  {
    platform: "INSTAGRAM",
    label: "Instagram",
    text: "Publish the visual version with its caption.",
    note: "Caption up to 2,200 characters · photo or Reel required",
  },
] as const;

export function TailorPreview() {
  return (
    <section
      id="preview"
      aria-labelledby="preview-heading"
      className="border-y border-border bg-muted/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <h2
            id="preview-heading"
            className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            One idea. A better fit for every network.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Start with a shared message, then adjust each account for its
            format, limits, and audience before anything goes live.
          </p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Start with one caption</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl leading-relaxed md:text-2xl">
                Morning launch is live — our biggest update yet. Here is
                everything that changed and why it matters for your week.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Postvia checks each connected network against its own
                publishing rules before you schedule or publish.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Add images or video once. Postvia applies each network&apos;s
                media rules before publishing.
              </p>
            </CardContent>
          </Card>
          <ul className="flex flex-col gap-2.5">
            {versions.map((version) => (
              <li
                key={version.platform}
                className="rounded-xl border border-border bg-card p-3.5"
              >
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={version.platform} />
                  <span className="text-sm font-medium">{version.label}</span>
                  <Badge variant="secondary" className="ml-auto">
                    Preview
                  </Badge>
                </span>
                <span className="mt-1.5 block truncate text-sm text-muted-foreground">
                  {version.text}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {version.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
