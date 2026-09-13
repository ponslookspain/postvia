"use client";

import { CalendarClockIcon } from "lucide-react";
import { ErrorBlock } from "@/components/StateBlock";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Inline schedule card. Edits the same scheduleDate/scheduleTime state
 * the confirm dialog reads — no second store, no logic changes. The
 * dialog stays as the confirm step; this card is the visible schedule
 * surface with date, time, timezone and validation in one place.
 */
export function ScheduleCard({
  scheduleDate,
  scheduleTime,
  scheduledIso,
  scheduleError,
  scheduling,
  schedulingForX,
  disabled,
  onDateChange,
  onTimeChange,
  onScheduleClick,
}: {
  scheduleDate: string;
  scheduleTime: string;
  scheduledIso: string | null;
  scheduleError: string | null;
  scheduling: boolean;
  schedulingForX: boolean;
  disabled: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onScheduleClick: () => void;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minDate = (() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  })();

  return (
    <section aria-labelledby="composer-schedule">
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            One time for every selected platform. Times use {timeZone}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="composer-schedule-date">Date</FieldLabel>
              <Input
                id="composer-schedule-date"
                type="date"
                value={scheduleDate}
                min={minDate}
                disabled={disabled}
                onChange={(e) => onDateChange(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="composer-schedule-time">Time</FieldLabel>
              <Input
                id="composer-schedule-time"
                type="time"
                value={scheduleTime}
                disabled={disabled}
                onChange={(e) => onTimeChange(e.target.value)}
              />
            </Field>
          </div>
          {scheduledIso && !scheduleError && (
            <FieldDescription>
              Will be published on{" "}
              {new Date(scheduledIso).toLocaleString("en-GB", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </FieldDescription>
          )}
          {scheduleError && (
            <ErrorBlock title="Cannot schedule" description={scheduleError} />
          )}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onScheduleClick}
            disabled={disabled || scheduling}
            className="w-full"
          >
            {scheduling && <Spinner data-icon="inline-start" />}
            {!scheduling && <CalendarClockIcon data-icon="inline-start" />}
            {scheduling
              ? "Scheduling..."
              : schedulingForX
                ? "Schedule (Threads only)"
                : "Review and schedule"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
