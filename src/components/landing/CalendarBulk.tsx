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
    text: "Add up to 10 videos in one batch.",
  },
  {
    title: "Configure",
    text: "Choose the start date, timezone, and interval between posts.",
  },
  {
    title: "Review",
    text: "Check every video and its scheduled time before confirming.",
  },
  {
    title: "Schedule",
    text: "Create the batch once. Each video becomes its own scheduled post.",
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
          Plan the month. Fill the week in minutes.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          See your upcoming posts on one calendar, then use bulk scheduling
          when you have a batch of videos ready to go.
        </p>
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Content calendar</h3>
            <Badge variant="secondary">All plans</Badge>
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
            See scheduled posts in context and drag them to another day when
            plans change.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
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
            Bulk scheduling is available on Growth and Scale. Free keeps the
            same calendar workflow for individual posts.
          </p>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="#pricing" />}
            className="mt-4"
          >
            Compare plans
          </Button>
        </div>
      </div>
    </section>
  );
}
