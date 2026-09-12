"use client";

import { CalendarClockIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { getScheduleErrorActions } from "@/lib/composer-media";

/**
 * Stage H7: Schedule dialog moved 1:1 from NewPostComposer (date/time
 * inputs, live summary, validation error with Open draft, scheduling
 * state on Confirm).
 */
export function ScheduleDialog({
  open,
  scheduleDate,
  scheduleTime,
  minDate,
  scheduledIso,
  scheduleError,
  savedId,
  scheduling,
  canSave,
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
  minDate: string;
  scheduledIso: string | null;
  scheduleError: string | null;
  savedId: string | null;
  scheduling: boolean;
  canSave: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenDraft: (postId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            One scheduled time for the whole post — it applies to all selected
            platforms, which publish together.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="schedule-date">Date</FieldLabel>
              <input
                id="schedule-date"
                type="date"
                value={scheduleDate}
                min={minDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="schedule-time">Time</FieldLabel>
              <input
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => onTimeChange(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Cannot schedule</AlertTitle>
              <AlertDescription>{scheduleError}</AlertDescription>
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
