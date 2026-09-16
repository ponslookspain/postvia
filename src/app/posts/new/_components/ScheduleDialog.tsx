"use client";

import Link from "next/link";
import { CalendarClockIcon, TriangleAlertIcon } from "lucide-react";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getScheduleErrorActions } from "@/lib/composer-media";
import { ScheduleDatePicker } from "./ScheduleDatePicker";

/**
 * The single scheduling editor. Date (calendar popover) and time are
 * chosen here exactly once; Confirm writes them to the shared composer
 * state, closes, and the Publish card shows a compact summary with an
 * Edit action that reopens this same dialog with existing values.
 */
export function ScheduleDialog({
  open,
  scheduleDate,
  scheduleTime,
  scheduledIso,
  scheduleError,
  savedId,
  scheduling,
  canSave,
  textPresent,
  overLimit,
  mediaError,
  hasSelection,
  quotaBlocked,
  quotaReason,
  onDateChange,
  onTimeChange,
  onOpenChange,
  onCancel,
  onConfirm,
  onOpenDraft,
}: {
  open: boolean;
  scheduleDate: string;
  scheduleTime: string;
  scheduledIso: string | null;
  scheduleError: string | null;
  savedId: string | null;
  scheduling: boolean;
  canSave: boolean;
  textPresent: boolean;
  overLimit: boolean;
  mediaError: boolean;
  hasSelection: boolean;
  quotaBlocked: boolean;
  quotaReason: string | null;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenDraft: (postId: string) => void;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Explains a disabled Confirm using the same flags canSave is built
  // from — no new validation logic. Date/time is advisory: it never
  // disables the button, but the user should see it before confirming.
  const blockReason = !hasSelection
    ? "Select at least one account to schedule this post."
    : !textPresent
      ? "Add some post content before scheduling."
      : overLimit
        ? "The post exceeds the character limit for one or more platforms."
        : mediaError
          ? "Fix the media issues before scheduling."
          : !scheduleDate || !scheduleTime
            ? "Choose a date and time."
            : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            One scheduled time for the whole post — it applies to all selected
            platforms, which publish together. Times use {timeZone}.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="schedule-date">Date</FieldLabel>
              <ScheduleDatePicker
                id="schedule-date"
                value={scheduleDate}
                onChange={onDateChange}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="schedule-time">Time</FieldLabel>
              <Input
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => onTimeChange(e.target.value)}
              />
            </Field>
          </div>
          {scheduledIso && (
            <FieldDescription>
              Will be published on{" "}
              {new Date(scheduledIso).toLocaleString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              — this schedule applies to all selected platforms.
            </FieldDescription>
          )}
          {scheduleError && (
            <Alert color="error" variant="outline">
              <TriangleAlertIcon />
              <AlertContent>
                <AlertTitle>Cannot schedule</AlertTitle>
                <AlertDescription>{scheduleError}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          {scheduleError &&
            getScheduleErrorActions(savedId).includes("open-draft") &&
            savedId && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenDraft(savedId)}
                >
                  Open draft
                </Button>
              </div>
            )}
          {quotaBlocked ? (
            <p className="text-label leading-5 text-muted-foreground">
              {quotaReason ?? "This plan includes a fixed number of posts per month."}{" "}
              <Link
                href="/billing"
                className="underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Manage plan
              </Link>
            </p>
          ) : (
            blockReason && (
              <p
                role="status"
                className="text-label leading-5 text-muted-foreground"
              >
                {blockReason}
              </p>
            )
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canSave || scheduling}>
            {scheduling && <Spinner data-icon="inline-start" />}
            <CalendarClockIcon data-icon="inline-start" />
            {scheduling ? "Scheduling..." : "Confirm schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
