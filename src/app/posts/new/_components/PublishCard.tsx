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
import type { PlanId } from "@/lib/plans";
import {
  formatElapsed,
  publishPhaseLabel,
  type PollProgress,
} from "@/lib/publish-poll";

/**
 * Stage H6: Publish card moved 1:1 from NewPostComposer (quota alert with
 * UpgradeCta, X-scheduling notices, Save/Schedule/Publish buttons, live
 * publishing progress with elapsed time and Cancel).
 */
export function PublishCard({
  quotaBlocked,
  quotaError,
  quotaUpgradeTo,
  schedulingForX,
  scheduleMode,
  xScheduleHint,
  publishing,
  publishProgress,
  canSave,
  canPublish,
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
  xScheduleHint: boolean;
  publishing: boolean;
  publishProgress: PollProgress | null;
  canSave: boolean;
  canPublish: boolean;
  saving: boolean;
  scheduling: boolean;
  onSaveDraft: () => void;
  onScheduleClick: () => void;
  onPublish: () => void;
  onAbort: () => void;
  onDismissXHint: () => void;
}) {
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
        {/* Desktop action row; on mobile the fixed bottom bar owns these actions. */}
        <div className="hidden flex-col gap-2 sm:flex-row lg:flex lg:flex-col xl:flex-row">
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={!canSave}
            className="flex-1"
          >
            {saving && <Spinner data-icon="inline-start" />}
            <SaveIcon data-icon="inline-start" />
            {saving ? "Saving..." : "Save draft"}
          </Button>
          <Button
            variant="outline"
            onClick={onScheduleClick}
            disabled={scheduling}
            title={
              schedulingForX
                ? "Scheduling for X is not available yet. Use Threads."
                : "Schedule this post"
            }
            className="flex-1"
          >
            <CalendarClockIcon data-icon="inline-start" />
            {scheduling ? "Scheduling..." : "Schedule"}
          </Button>
          <Button
            onClick={onPublish}
            disabled={!canPublish}
            className="flex-1"
          >
            {publishing && <Spinner data-icon="inline-start" />}
            {!publishing && <SendIcon data-icon="inline-start" />}
            {publishing ? "Publishing..." : "Publish now"}
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
