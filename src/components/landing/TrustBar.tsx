import { PlatformIcon } from "@/components/PlatformIcon";
import { Reveal } from "@/components/landing/Reveal";

const platforms = ["INSTAGRAM", "THREADS", "TIKTOK", "X"] as const;

const stats = [
  { value: "4", label: "networks, one workflow" },
  { value: "15", label: "posts/month on Free" },
  { value: "10", label: "videos per bulk batch" },
] as const;

/**
 * Quiet trust strip: platform coverage + plan facts. No fake logos,
 * no invented customers — only true product statements.
 */
export function TrustBar() {
  return (
    <section aria-label="Supported platforms and plan facts">
      <Reveal className="mx-auto w-full max-w-6xl px-4 md:px-8">
        <div className="flex flex-col items-center gap-6 border-y border-border py-8 md:flex-row md:justify-between md:py-7">
          <div className="flex items-center gap-5">
            {platforms.map((platform) => (
              <span
                key={platform}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <PlatformIcon platform={platform} className="size-4.5" />
                <span className="hidden capitalize sm:inline">
                  {platform.toLowerCase()}
                </span>
              </span>
            ))}
          </div>
          <dl className="flex items-center gap-8 text-center md:text-left">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="order-2 mt-1 text-xs text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="order-1 font-heading text-2xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </section>
  );
}
