"use client";

import {
  CircleCheckIcon,
  ClapperboardIcon,
  OctagonXIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

export type BulkVideoStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "registering"
  | "scheduling"
  | "scheduled"
  | "failed";

/**
 * One video row for the unified batch list (upload + review merged).
 * Shows identity, size, live progress/status, the scheduled time once
 * the schedule is computable, and wrapped per-file errors — never
 * truncated-only. Presentational only: slots, uploads, schedule math
 * and removal rules stay in BulkScheduler.
 */
export function BulkVideoRow({
  name,
  sizeLabel,
  status,
  progress,
  error,
  problems,
  timeLabel,
  running,
  onRemove,
}: {
  name: string;
  sizeLabel: string;
  status: BulkVideoStatus;
  progress: number;
  error: string | null;
  problems: string[];
  timeLabel: string | null;
  running: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span
        aria-hidden="true"
        className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
      >
        <ClapperboardIcon className="size-5" />
        {status === "scheduled" && (
          <span className="absolute inset-0 flex items-center justify-center bg-primary/70">
            <CircleCheckIcon className="size-5 text-primary-foreground" />
          </span>
        )}
        {status === "failed" && (
          <span className="absolute inset-0 flex items-center justify-center bg-destructive/60">
            <OctagonXIcon className="size-5 text-white" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
          {sizeLabel}
          {status === "uploading" && ` · ${progress}%`}
          {status !== "queued" &&
            status !== "uploading" &&
            ` · ${status}`}
          {timeLabel && ` · ${timeLabel}`}
        </span>
        {status === "uploading" && (
          <Progress
            value={progress}
            aria-label={`Uploading ${name}`}
            className="mt-1.5 w-full max-w-48"
          />
        )}
        {error && (
          <span className="mt-0.5 block text-xs text-destructive">
            {error}
          </span>
        )}
        {problems.map((message) => (
          <span key={message} className="mt-0.5 block text-xs text-destructive">
            {message}
          </span>
        ))}
      </span>
      {status === "scheduled" ? (
        <Badge variant="secondary" className="shrink-0">
          Scheduled
        </Badge>
      ) : status === "failed" ? (
        <Badge variant="destructive" className="shrink-0">
          Failed
        </Badge>
      ) : running || status !== "queued" ? (
        <Spinner data-icon="inline-start" aria-hidden="true" className="shrink-0" />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="shrink-0"
        >
          <XIcon />
        </Button>
      )}
    </li>
  );
}
