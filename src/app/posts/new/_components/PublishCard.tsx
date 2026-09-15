"use client";

import {
  CalendarClockIcon,
  SaveIcon,
  SendIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { UpgradeCta } from "@/components/billing/BillingWidgets";
import { parseDateKey } from "./ScheduleDatePicker";
import type { PlanId } from "@/lib/plans";
import {
  formatElapsed,
  publishPhaseLabel,
  type PollProgress,
} from "@/lib/publish-poll";

/**
 * Single publishing hub. Publish now, Schedule and Save draft live
 * here. Scheduling is edited once in the Schedule dialog; this card
 * shows a compact summary of the chosen date and time with an Edit
 * action that reopens the same dialog. No second schedule UI.
 */
export function PublishCard({
  quotaBlocked,
  quotaError,
  quotaUpgradeTo,
  schedulingForX,
  scheduleMode,
  scheduleDate,
  scheduleTime,
  xScheduleHint,
  publishing,
  publishProgress,
  canSave,
  canPublish,
  publishBlockedReason,
  saving,
  scheduling,
  onSaveDraft,
  onScheduleClick,
  onPublish,
  onAbort,
  onDismissXHint,
}: {
  quotaBlocked: boolean;
  quotaError: { reason: string; upgradeTo: PlanId | null } | null;
  quotaUpgradeTo: PlanId | null;
  schedulingForX: boolean;
  scheduleMode: boolean;
  scheduleDate: string;
  scheduleTime: string;
  xScheduleHint: boolean;
  publishing: boolean;
  publishProgress: PollProgress | null;
  canSave: boolean;
  canPublish: boolean;
  publishBlockedReason: string | null;
  saving: boolean;
  scheduling: boolean;
  onSaveDraft: () => void;
  onScheduleClick: () => void;
  onPublish: () => void;
  onAbort: () => void;
  onDismissXHint: () => void;
}) {
  const selectedDate = parseDateKey(scheduleDate);
  const hasSchedule = scheduleDate !== "" || scheduleTime !== "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish</CardTitle>
        <CardDescription>
          Save a draft, schedule it, or publish right away.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(quotaBlocked || quotaError) && (
          <Alert>
            <AlertTitle>Monthly post limit reached</AlertTitle>
            <AlertDescription>
              <UpgradeCta
                reason={
                  quotaError?.reason ??
                  "This plan includes a fixed number of posts per month."
                }
                upgradeTo={quotaError?.upgradeTo ?? quotaUpgradeTo}
              />
            </AlertDescription>
          </Alert>
        )}
        {schedulingForX && scheduleMode && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Scheduling unavailable</AlertTitle>
            <AlertDescription>
              Scheduling for X is not available yet. Choose Threads to schedule
              a post.
            </AlertDescription>
          </Alert>
        )}
        {schedulingForX && xScheduleHint && !scheduleMode && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Scheduling unavailable</AlertTitle>
            <AlertDescription>
              Scheduling for X is not available yet. Select a Threads account
              to schedule, or publish to X now.
            </AlertDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onDismissXHint}
              aria-label="Dismiss scheduling notice"
              className="absolute top-2 right-2"
            >
              <XIcon />
            </Button>
          </Alert>
        )}
        {schedulingForX && !scheduleMode && (
          <FieldDescription>
            Scheduling is available for Threads. Publish to X is available now.
          </FieldDescription>
        )}
        {publishBlockedReason && !publishing && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Complete required fields</AlertTitle>
            <AlertDescription>{publishBlockedReason}</AlertDescription>
          </Alert>
        )}
        {/* Rail action stack; on mobile the fixed bottom bar owns these actions. */}
        <div className="hidden flex-col gap-2 lg:flex">
          <Button
            size="lg"
            onClick={onPublish}
            disabled={!canPublish}
            className="w-full"
          >
            {publishing && <Spinner data-icon="inline-start" />}
            {!publishing && <SendIcon data-icon="inline-start" />}
            {publishing ? "Publishing..." : "Publish now"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={onScheduleClick}
            disabled={scheduling}
            title={
              schedulingForX
                ? "Scheduling for X is not available yet. Use Threads."
                : "Schedule this post"
            }
            className="w-full"
          >
            <CalendarClockIcon data-icon="inline-start" />
            {scheduling ? "Scheduling..." : "Schedule"}
          </Button>
          {hasSchedule && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
              <p className="min-w-0 truncate text-[13px] text-muted-foreground tabular-nums">
                Scheduled for{" "}
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  : "no date"}
                {" · "}
                {scheduleTime || "no time"}
              </p>
              <Button
                type="button"
                variant="link"
                onClick={onScheduleClick}
                disabled={scheduling}
                className="h-auto shrink-0 p-0 text-[13px]"
              >
                Edit
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="lg"
            onClick={onSaveDraft}
            disabled={!canSave}
            className="w-full"
          >
            {saving && <Spinner data-icon="inline-start" />}
            <SaveIcon data-icon="inline-start" />
            {saving ? "Saving..." : "Save draft"}
          </Button>
        </div>
        {publishing && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {publishPhaseLabel(publishProgress)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatElapsed(publishProgress?.elapsedMs ?? 0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Cancel only stops waiting here — publishing continues on the
              server.
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAbort}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Publishing uploads media first, then publishes to every selected
        platform.
      </CardFooter>
    </Card>
  );
}
