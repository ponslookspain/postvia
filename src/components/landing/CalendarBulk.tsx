import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ProductShot } from "@/components/landing/ProductShot";

const week = [
  { day: "Mon 4", title: "Launch teaser", status: "PUBLISHED" },
  { day: "Mon 11", title: "Launch day video", status: "SCHEDULED" },
  { day: "Mon 18", title: "Behind the scenes", status: "SCHEDULED" },
] as const;

const bulkSteps = [
  {
    title: "Upload",
    text: "Drop up to 10 videos in one batch.",
  },
  {
    title: "Configure",
    text: "Pick a start date, timezone, and interval between posts.",
  },
  {
    title: "Review",
    text: "Check each video with its own scheduled slot and progress.",
  },
  {
    title: "Schedule",
    text: "Confirm once — each video becomes its own scheduled post on the calendar.",
  },
] as const;

export function CalendarBulk() {
  return (
    <section
      id="calendar"
      aria-labelledby="calendar-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-8 md:py-20"
    >
      <div className="max-w-2xl">
        <h2
          id="calendar-heading"
          className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          See the month. Queue the week.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          A visual calendar for everything scheduled, plus bulk video
          scheduling when one post at a time is too slow.
        </p>
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Content calendar</h3>
            <Badge variant="secondary">Included on all plans</Badge>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {week.map((entry) => (
              <li
                key={entry.day}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">
                    {entry.day} · 09:00
                  </span>
                  <span className="block truncate text-sm font-medium">
                    {entry.title}
                  </span>
                </span>
                <StatusBadge status={entry.status} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Drag a draft or scheduled post to another day to reschedule it.
          </p>
          <div className="mt-4">
            <ProductShot
              src="/landing/calendar.svg"
              alt="Postvia content calendar month grid with scheduled post chips"
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Bulk video scheduling</h3>
            <Badge variant="outline">Growth and Scale</Badge>
          </div>
          <ol className="mt-4 flex flex-col gap-3" aria-label="Bulk workflow">
            {bulkSteps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
                >
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium">
                    {step.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {step.text}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Up to 10 videos per batch. The Free plan does not include bulk —
            scheduling one post at a time is unlimited within its monthly
            quota.
          </p>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/signup?plan=growth" />}
            className="mt-4"
          >
            Compare Growth and Scale
          </Button>
        </div>
      </div>
    </section>
  );
}
