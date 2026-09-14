import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";

const targets = [
  {
    platform: "INSTAGRAM",
    user: "@studio",
    status: "PUBLISHED",
  },
  {
    platform: "THREADS",
    user: "@studio",
    status: "PUBLISHED",
  },
  {
    platform: "TIKTOK",
    user: "@studio.clips",
    status: "PUBLISHING",
  },
  {
    platform: "X",
    user: "@studio",
    status: "FAILED",
  },
] as const;

const guarantees = [
  {
    title: "Individual retry",
    text: "Failed targets retry on their own — published ones are never reposted.",
  },
  {
    title: "Partial-publish transparency",
    text: "Partially published posts show exactly which networks succeeded.",
  },
  {
    title: "No-double-post protection",
    text: "Retries resume the same publish job instead of creating a duplicate.",
  },
  {
    title: "Scheduling recovery",
    text: "Interrupted scheduled posts are recovered automatically — never lost, never posted twice.",
  },
] as const;

export function Reliability() {
  return (
    <section
      id="reliability"
      aria-labelledby="reliability-heading"
      className="border-y border-border bg-muted/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <h2
            id="reliability-heading"
            className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Know exactly what happened.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Every connected account reports its own status. Failures get a
            retry — not a mystery.
          </p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <h3 className="text-base font-medium">
              One post, four honest outcomes
            </h3>
            <ul className="mt-4 flex flex-col gap-2">
              {targets.map((target) => (
                <li
                  key={target.platform}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <PlatformIcon platform={target.platform} />
                    <span className="truncate text-sm">{target.user}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={target.status} />
                    {target.status === "FAILED" && (
                      <Badge variant="outline">Retry</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              The X target failed here; Instagram and Threads are already
              published and stay untouched while X retries.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {guarantees.map((guarantee) => (
              <li
                key={guarantee.title}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h3 className="text-base font-medium">{guarantee.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {guarantee.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
