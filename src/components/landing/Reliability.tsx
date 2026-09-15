import { PlatformIcon } from "@/components/PlatformIcon";
import { PublishStatusCard } from "@/components/landing/ProductVisuals";
import { Reveal } from "@/components/landing/Reveal";

const guarantees = [
  {
    title: "Retry only what failed",
    text: "Retry a failed account without reposting targets that already succeeded.",
  },
  {
    title: "See partial publishing clearly",
    text: "Know exactly which accounts published and which still need attention.",
  },
  {
    title: "Protect against duplicate posts",
    text: "Publishing retries resume safely instead of blindly creating the same post twice.",
  },
  {
    title: "Recover interrupted schedules",
    text: "Scheduled work can recover after interruptions without silently disappearing.",
  },
] as const;

/**
 * PUBLISH chapter: per-account outcomes. Editorial split with a sticky
 * heading on desktop — the outcome list is the visual, guarantees read
 * as hairline rows rather than another card grid.
 */
export function Reliability() {
  return (
    <section
      id="reliability"
      aria-labelledby="reliability-heading"
      className="scroll-mt-20 border-y border-border bg-muted/30"
    >
      <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <Reveal className="lg:sticky lg:top-24">
          <p className="text-sm font-medium text-muted-foreground">
            In detail · Publish
          </p>
          <h2
            id="reliability-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Know what published. Not just what you clicked.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Every account has its own status, so a partial failure stays
            visible and recoverable instead of disappearing into the
            background.
          </p>
          <div
            aria-hidden="true"
            className="mt-6 hidden items-center gap-1.5 lg:flex"
          >
            {(["INSTAGRAM", "THREADS", "TIKTOK", "X"] as const).map((platform) => (
              <span
                key={platform}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-card"
              >
                <PlatformIcon platform={platform} />
              </span>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">
              One post · four independent outcomes
            </span>
          </div>
        </Reveal>

        <div>
          <Reveal>
            <PublishStatusCard />
          </Reveal>
          <Reveal as="ul" delay={150} className="mt-2 border-b border-border">
            {guarantees.map((guarantee) => (
              <li
                key={guarantee.title}
                className="grid gap-1 border-t border-border py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6"
              >
                <h3 className="text-[15px] font-medium">{guarantee.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {guarantee.text}
                </p>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
