import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Reveal } from "@/components/landing/Reveal";

const week = [
  { day: "Mon 4 · 09:00", title: "Launch teaser", status: "PUBLISHED" },
  { day: "Mon 11 · 09:00", title: "Launch day video", status: "SCHEDULED" },
  { day: "Mon 18 · 09:00", title: "Behind the scenes", status: "SCHEDULED" },
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

/**
 * PLAN chapter: the content calendar plus bulk scheduling.
 * Calendar reads as a week agenda with real status language;
 * bulk reads as a numbered procedure, not a second card grid.
 */
export function CalendarBulk() {
  return (
    <section
      id="calendar"
      aria-labelledby="calendar-heading"
      className="scroll-mt-20"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">
            In detail · Plan
          </p>
          <h2
            id="calendar-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Plan the month. Fill the week in minutes.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            See your upcoming posts on one calendar, then use bulk
            scheduling when you have a batch of videos ready to go.
          </p>
        </Reveal>

        <div className="mt-10 grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6">
          <Reveal>
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-heading text-base font-medium">
                    This week
                  </h3>
                  <Badge variant="soft">Content calendar</Badge>
                </div>
                <ul className="mt-4 flex flex-col gap-2">
                  {week.map((entry) => (
                    <li
                      key={entry.title}
                      className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs text-muted-foreground">
                          {entry.day}
                        </span>
                        <span className="block truncate text-sm font-medium">
                          {entry.title}
                        </span>
                      </span>
                      <StatusBadge status={entry.status} />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Drag a draft or scheduled post to another day to reschedule
                  it — the grid never reflows.
                </p>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-2xl bg-panel p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-heading text-base font-medium">
                  Bulk video scheduling
                </h3>
                <Badge variant="outline">Growth and Scale</Badge>
              </div>
              <ol
                className="mt-5 flex flex-col gap-0 border-t border-border"
                aria-label="Bulk workflow"
              >
                {bulkSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex items-start gap-3 border-b border-border py-3.5"
                  >
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
                Free keeps the same calendar workflow for individual posts.
              </p>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="#pricing" />}
                className="mt-4"
              >
                Compare plans
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
