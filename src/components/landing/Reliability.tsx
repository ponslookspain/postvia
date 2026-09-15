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
            Know what published. Not just what you clicked.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Every account has its own status, so a partial failure stays
            visible and recoverable instead of disappearing into the
            background.
          </p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <h3 className="text-base font-medium">
              One post. Every outcome visible.
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
              If Instagram and Threads publish while X fails, you see that
              exact state — and can retry only what failed.
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
