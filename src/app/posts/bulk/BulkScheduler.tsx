"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClockIcon,
  CheckIcon,
  CircleCheckIcon,
  ClapperboardIcon,
  OctagonXIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { validateMediaInput } from "@/lib/media";
import {
  BULK_INTERVAL_PRESETS,
  BULK_MAX_VIDEOS,
  BULK_TIMEZONES,
  buildBulkPostBody,
  computeBulkSchedule,
  partitionDuplicateAdds,
  shouldAcceptRunRequest,
  validateBulkConfig,
  validateBulkVideoForAccounts,
  zonedTimeToIso,
  type BulkAccountRef,
} from "@/lib/bulk-schedule";
import type { PlanId } from "@/lib/plans";
import { PlatformIcon } from "@/components/PlatformIcon";
import { UpgradeCta } from "@/components/billing/BillingWidgets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

type ItemStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "registering"
  | "scheduling"
  | "done"
  | "error";

type BulkItem = {
  key: string;
  file: File;
  progress: number;
  status: ItemStatus;
  error?: string;
  postId?: string;
  scheduledIso?: string;
};

// Upload/status polling windows mirror the manual composer (same pipeline).
const MEDIA_REGISTER_TIMEOUT_MS = 20_000;
const MEDIA_REGISTER_POLL_MS = 500;

let itemKeyCounter = 0;

function nextItemKey(): string {
  itemKeyCounter += 1;
  return `bulk-${itemKeyCounter}-${Date.now()}`;
}

function subscribeNoop(): () => void {
  return () => {};
}

/** Browser timezone for the default schedule zone (SSR-safe: UTC). */
function useDetectedTimeZone(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return BULK_TIMEZONES.includes(zone) ? zone : "UTC";
    },
    () => "UTC"
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatInZone(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function waitForMediaRegistration(
  postId: string,
  pathname: string
): Promise<string | null> {
  const deadline = Date.now() + MEDIA_REGISTER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(
      `/api/media/status?postId=${encodeURIComponent(postId)}&pathname=${encodeURIComponent(pathname)}`
    );
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        exists?: boolean;
      } | null;
      if (data?.exists) return null;
    }
    await new Promise((r) => setTimeout(r, MEDIA_REGISTER_POLL_MS));
  }
  return "Upload did not finish registering in time. Please try again.";
}

export function BulkScheduler({
  accounts,
  billing,
}: {
  accounts: BulkAccountRef[];
  billing: {
    bulk: boolean;
    maxBulk: number;
    postsLeft: number | null;
    upgradeTo: PlanId | null;
  };
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedZone = useDetectedTimeZone();

  const [items, setItems] = useState<BulkItem[]>([]);
  const [text, setText] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() =>
    accounts.map((account) => account.id)
  );
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [zoneOverride, setZoneOverride] = useState<string | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(1440);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [pendingDupes, setPendingDupes] = useState<File[]>([]);

  const timeZone = zoneOverride ?? detectedZone;
  const selectedAccounts = accounts.filter((account) =>
    selectedAccountIds.includes(account.id)
  );
  // Plan cap first, system cap as the ceiling — never the other way round.
  const batchCap = Math.min(BULK_MAX_VIDEOS, billing.maxBulk);

  const startIso = useMemo(() => {
    if (!scheduleDate || !scheduleTime) return null;
    return zonedTimeToIso(scheduleDate, scheduleTime, timeZone);
  }, [scheduleDate, scheduleTime, timeZone]);

  const schedule = useMemo(() => {
    if (startIso === null) return [];
    return computeBulkSchedule(
      new Date(startIso).getTime(),
      intervalMinutes,
      items.length
    );
  }, [startIso, intervalMinutes, items.length]);

  const configValidation = validateBulkConfig({
    fileCount: items.length,
    intervalMinutes,
    startUtcMs: startIso ? new Date(startIso).getTime() : null,
    accountCount: selectedAccountIds.length,
  });

  // Capability gate per file, same registry rules as the manual composer.
  const fileProblems = useMemo(() => {
    const problems = new Map<string, string[]>();
    for (const item of items) {
      const errors = validateBulkVideoForAccounts(
        item.file.type,
        selectedAccounts
      );
      if (errors.length > 0) problems.set(item.key, errors);
    }
    return problems;
  }, [items, selectedAccounts]);

  const doneCount = items.filter((item) => item.status === "done").length;
  const errorCount = items.filter((item) => item.status === "error").length;
  const activeCount = items.filter(
    (item) => item.status !== "done" && item.status !== "error"
  ).length;

  function appendFiles(files: File[]) {
    setItems((prev) => {
      const room = batchCap - prev.length;
      const capped = files.slice(0, Math.max(0, room));
      if (files.length > capped.length) {
        toast.add({
          title: "Batch is full",
          description: `A batch holds at most ${batchCap} videos.`,
          type: "warning",
        });
      }
      return [
        ...prev,
        ...capped.map((file) => ({
          key: nextItemKey(),
          file,
          progress: 0,
          status: "queued" as const,
        })),
      ];
    });
    setFinished(false);
  }

  function addFiles(files: File[]) {
    const accepted: File[] = [];
    for (const file of files) {
      const validation = validateMediaInput(file.type, file.size);
      if (!validation.ok || validation.kind !== "VIDEO") {
        toast.add({
          title: "File skipped",
          description: `${file.name}: ${!validation.ok ? validation.error : "Only video files are accepted here."}`,
          type: "warning",
        });
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;
    const keyOf = (file: File) =>
      [file.name, file.size, file.lastModified].join("|");
    const { unique } = partitionDuplicateAdds(
      items.map((item) => {
        const file = item.file;
        return { name: file.name, size: file.size, lastModified: file.lastModified };
      }),
      accepted.map((file) => ({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      }))
    );
    // Consume the split in order so repeated files land on the right side.
    const remaining = new Map<string, number>();
    for (const ref of unique) {
      const key = [ref.name, ref.size, ref.lastModified].join("|");
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    const uniqueFiles: File[] = [];
    const duplicateFiles: File[] = [];
    for (const file of accepted) {
      const left = remaining.get(keyOf(file)) ?? 0;
      if (left > 0) {
        uniqueFiles.push(file);
        remaining.set(keyOf(file), left - 1);
      } else {
        duplicateFiles.push(file);
      }
    }
    appendFiles(uniqueFiles);
    // Repeats need explicit confirmation: each confirmed instance becomes
    // its own scheduled post. The banner holds them until the user decides.
    setPendingDupes(duplicateFiles);
  }

  function confirmPendingDupes() {
    appendFiles(pendingDupes);
    setPendingDupes([]);
  }

  function skipPendingDupes() {
    setPendingDupes([]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function patchItem(key: string, patch: Partial<BulkItem>) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  async function uploadOneVideo(
    postId: string,
    file: File,
    onProgress: (percent: number) => void
  ): Promise<string | null> {
    onProgress(0);
    const prepRes = await fetch("/api/media/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    });
    if (!prepRes.ok) {
      const data = await prepRes.json().catch(() => null);
      return typeof data?.error === "string" ? data.error : "Failed to prepare upload";
    }
    const { pathname } = (await prepRes.json()) as { pathname: string };
    try {
      const { uploadPresigned } = await import("@vercel/blob/client");
      const uploaded = await uploadPresigned(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/media/upload",
        clientPayload: JSON.stringify({
          postId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
        contentType: file.type,
        onUploadProgress: ({ percentage }) =>
          onProgress(Math.min(100, Math.round(percentage))),
      });
      onProgress(100);
      return await waitForMediaRegistration(postId, uploaded.pathname || pathname);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload error";
      return `Upload failed: ${message}`;
    }
  }

  async function processItem(item: BulkItem, scheduledIso: string): Promise<boolean> {
    // 1. Draft first: an aborted batch leaves harmless drafts, never
    //    half-broken scheduled posts.
    patchItem(item.key, { status: "creating", error: undefined });
    let postId: string;
    try {
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildBulkPostBody({ text, accountIds: selectedAccountIds })
        ),
      });
      const created = await createRes.json().catch(() => null);
      if (!createRes.ok || typeof created?.id !== "string") {
        patchItem(item.key, {
          status: "error",
          error:
            typeof created?.error === "string"
              ? created.error
              : "Failed to create post",
        });
        return false;
      }
      postId = created.id;
    } catch {
      patchItem(item.key, { status: "error", error: "Network error. Please try again." });
      return false;
    }
    patchItem(item.key, { postId });

    // 2. Upload the video through the standard secure pipeline.
    patchItem(item.key, { status: "uploading", progress: 0 });
    const uploadError = await uploadOneVideo(postId, item.file, (percent) =>
      patchItem(item.key, { progress: percent })
    );
    if (uploadError) {
      // No half-broken scheduled post: remove the draft (and its blob).
      await fetch(`/api/posts/${postId}`, { method: "DELETE" }).catch(() => null);
      patchItem(item.key, { status: "error", error: uploadError });
      return false;
    }

    // 3. Flip the draft to SCHEDULED through the existing scheduling flow.
    patchItem(item.key, { status: "scheduling" });
    try {
      const scheduleRes = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: scheduledIso }),
      });
      const scheduled = await scheduleRes.json().catch(() => null);
      if (!scheduleRes.ok) {
        await fetch(`/api/posts/${postId}`, { method: "DELETE" }).catch(() => null);
        patchItem(item.key, {
          status: "error",
          error:
            typeof scheduled?.error === "string"
              ? scheduled.error
              : "Failed to schedule post",
        });
        return false;
      }
    } catch {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" }).catch(() => null);
      patchItem(item.key, { status: "error", error: "Network error. Please try again." });
      return false;
    }
    patchItem(item.key, { status: "done", progress: 100, scheduledIso });
    return true;
  }

  async function handleRun(retryOnly: boolean) {
    // Double-submit guard: an accidental second click while a run is in
    // flight is a no-op. Done items are never reprocessed regardless.
    if (!shouldAcceptRunRequest(runningRef.current)) return;
    setConfigError(null);
    if (!configValidation.ok) {
      setConfigError(configValidation.error);
      return;
    }
    if (fileProblems.size > 0) {
      setConfigError(
        "Some videos are not supported by the selected accounts. Remove them or change accounts."
      );
      return;
    }
    if (startIso === null) {
      setConfigError("Choose a valid start date and time.");
      return;
    }
    const queue = items.filter((item) =>
      retryOnly ? item.status === "error" : item.status !== "done"
    );
    if (queue.length === 0) return;
    // Monthly quota is enforced per post server-side; check up front so a
    // run never starts that it cannot finish.
    if (billing.postsLeft !== null && queue.length > billing.postsLeft) {
      setConfigError(
        `Only ${billing.postsLeft} monthly ${billing.postsLeft === 1 ? "post" : "posts"} left — this run needs ${queue.length}.`
      );
      return;
    }
    const isos = computeBulkSchedule(
      new Date(startIso).getTime(),
      intervalMinutes,
      items.length
    );
    setRunning(true);
    runningRef.current = true;
    setFinished(false);
    let succeeded = 0;
    try {
      for (const item of queue) {
        const index = items.findIndex((entry) => entry.key === item.key);
        const iso = isos[index];
        if (!iso) {
          patchItem(item.key, { status: "error", error: "Could not compute schedule." });
          continue;
        }
        if (await processItem(item, iso)) succeeded++;
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      setFinished(true);
    }
    if (succeeded === queue.length && queue.length > 0) {
      const firstIso = isos[items.findIndex((entry) => entry.key === queue[0].key)];
      if (firstIso) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
        }).formatToParts(new Date(firstIso));
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
        toast.add({
          title: `Scheduled ${succeeded} ${succeeded === 1 ? "post" : "posts"}`,
          description: "Opening the calendar with the new posts.",
          type: "success",
        });
        router.push(`/calendar?month=${get("year")}-${get("month")}`);
      }
    }
  }

  const allDone = items.length > 0 && doneCount === items.length;
  const reviewReady =
    items.length > 0 &&
    schedule.length > 0 &&
    configValidation.ok &&
    fileProblems.size === 0 &&
    text.trim().length > 0;
  const currentStep = running ? 4 : items.length === 0 ? 1 : reviewReady ? 3 : 2;
  const steps = ["Upload", "Configure", "Review", "Schedule"];

  if (accounts.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClapperboardIcon />
            </EmptyMedia>
            <EmptyTitle>No video accounts connected</EmptyTitle>
            <EmptyDescription>
              Connect a profile that supports video to schedule a batch.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" nativeButton={false} render={<Link href="/accounts" />}>
              Connect account
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (!billing.bulk) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClapperboardIcon />
            </EmptyMedia>
            <EmptyTitle>Bulk scheduling needs a bigger plan</EmptyTitle>
            <EmptyDescription>
              <UpgradeCta
                reason="Bulk video scheduling is not included in your current plan."
                upgradeTo={billing.upgradeTo}
              />
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Bulk video scheduling</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload several videos and schedule one post per video, spaced by a
          fixed interval. Publishing runs on the regular schedule engine.
        </p>
      </div>

      <ol
        aria-label="Batch progress"
        className="mb-10 flex items-center gap-2"
      >
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const done = stepNumber < currentStep;
          const current = stepNumber === currentStep;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors",
                  done && "bg-primary text-primary-foreground",
                  current && "border border-primary text-foreground",
                  !done && !current && "border border-border text-muted-foreground"
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : stepNumber}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  current || done ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {stepNumber < steps.length && (
                <span aria-hidden="true" className="mx-1 h-px flex-1 bg-border" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="bulk-videos">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="bulk-videos" className="text-lg font-medium">
                Videos
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                MP4 or WebM, up to {batchCap} per batch. Each file is
                uploaded separately with its own progress.
              </p>
            </div>
            <Badge variant="secondary">
              {items.length}/{batchCap}
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-3">
              {items.map((item) => (
                <div key={item.key} className="flex w-36 flex-col gap-1.5">
                  <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    <ClapperboardIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                    {item.status !== "queued" && item.status !== "error" && item.status !== "done" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-foreground/60 p-2">
                        <Spinner data-icon="inline-start" className="text-white" />
                        <span className="text-xs font-medium text-white tabular-nums">
                          {item.status === "uploading" ? `${item.progress}%` : item.status}
                        </span>
                        {item.status === "uploading" && (
                          <Progress value={item.progress} aria-label={`Uploading ${item.file.name}`} className="w-full" />
                        )}
                      </div>
                    )}
                    {item.status === "done" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/70">
                        <CircleCheckIcon className="size-6 text-primary-foreground" aria-hidden="true" />
                      </div>
                    )}
                    {item.status === "error" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-destructive/60">
                        <OctagonXIcon className="size-6 text-white" aria-hidden="true" />
                      </div>
                    )}
                    {!running && item.status !== "done" && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => removeItem(item.key)}
                        aria-label={`Remove ${item.file.name}`}
                        className="absolute top-1.5 right-1.5 size-6 rounded-full"
                      >
                        <XIcon />
                      </Button>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.file.name} · {formatFileSize(item.file.size)}
                  </p>
                  {item.error && (
                    <p className="text-xs text-destructive">{item.error}</p>
                  )}
                </div>
              ))}
              {items.length < batchCap && !running && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 w-36 flex-col border-dashed"
                >
                  <UploadIcon data-icon="inline-start" />
                  Add videos
                </Button>
              )}
            </div>
            {pendingDupes.length > 0 && (
              <Alert>
                <TriangleAlertIcon />
                <AlertTitle>Video already in this batch</AlertTitle>
                <AlertDescription>
                  {pendingDupes.map((file) => file.name).join(", ")} — add{" "}
                  {pendingDupes.length === 1 ? "it" : "them"} again as{" "}
                  {pendingDupes.length === 1 ? "a separate" : "separate"} scheduled{" "}
                  {pendingDupes.length === 1 ? "post" : "posts"}?
                  <span className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={confirmPendingDupes}
                      disabled={running}
                    >
                      Add anyway
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={skipPendingDupes}
                      disabled={running}
                    >
                      Skip
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,.mp4,.m4v,.webm"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>
        </section>

        <section aria-labelledby="bulk-content">
          <h2 id="bulk-content" className="text-lg font-medium">
            Content
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            The same text is used for every post in the batch.
          </p>
          <div>
            <Field>
              <FieldLabel htmlFor="bulk-text">Post text</FieldLabel>
              <Textarea
                id="bulk-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write something..."
                rows={3}
              />
            </Field>
          </div>
        </section>

        <section aria-labelledby="bulk-targets">
          <h2 id="bulk-targets" className="text-lg font-medium">
            Publish to
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Only connected accounts that support video are listed.
          </p>
          <div>
            <FieldSet>
              <FieldLegend variant="label" className="sr-only">
                Publish to
              </FieldLegend>
              <FieldGroup className="gap-2">
                {accounts.map((account) => {
                  const selected = selectedAccountIds.includes(account.id);
                  return (
                    <Field key={account.id} orientation="horizontal">
                      <Checkbox
                        id={`bulk-account-${account.id}`}
                        checked={selected}
                        disabled={running}
                        onCheckedChange={(checked) =>
                          setSelectedAccountIds((current) =>
                            checked === true
                              ? [...current, account.id]
                              : current.filter((id) => id !== account.id)
                          )
                        }
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`bulk-account-${account.id}`}>
                          <span className="flex items-center gap-2">
                            <span className="flex size-4 items-center justify-center [&_svg]:size-4">
                              <PlatformIcon platform={account.platform} className="size-4" />
                            </span>
                            {account.platform} @{account.username}
                          </span>
                        </FieldLabel>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>
          </div>
        </section>

        <section aria-labelledby="bulk-schedule">
          <h2 id="bulk-schedule" className="text-lg font-medium">
            Schedule
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            First post goes out at the start time, the rest follow spaced
            by the interval. All times shown in the selected timezone.
          </p>
          <div>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="bulk-date">Start date</FieldLabel>
                  <Input
                    id="bulk-date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    disabled={running}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bulk-time">Start time</FieldLabel>
                  <Input
                    id="bulk-time"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    disabled={running}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="bulk-tz">Timezone</FieldLabel>
                  <Select
                    value={timeZone}
                    onValueChange={(value: unknown) => setZoneOverride(String(value))}
                    disabled={running}
                  >
                    <SelectTrigger id="bulk-tz" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {BULK_TIMEZONES.map((zone) => (
                          <SelectItem key={zone} value={zone}>
                            {zone.replaceAll("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="bulk-interval">Interval (minutes)</FieldLabel>
                  <Input
                    id="bulk-interval"
                    type="number"
                    min={1}
                    value={Number.isFinite(intervalMinutes) ? intervalMinutes : ""}
                    onChange={(e) =>
                      setIntervalMinutes(Math.floor(Number(e.target.value) || 0))
                    }
                    disabled={running}
                  />
                  <FieldDescription>
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      <span>Presets:</span>
                      {BULK_INTERVAL_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={running}
                          onClick={() => setIntervalMinutes(preset)}
                          className="underline underline-offset-2 hover:text-foreground disabled:opacity-40"
                        >
                          {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                        </button>
                      ))}
                    </span>
                  </FieldDescription>
                </Field>
              </div>
              {fileProblems.size > 0 && (
                <Alert variant="destructive">
                  <TriangleAlertIcon />
                  <AlertTitle>Unsupported combination</AlertTitle>
                  <AlertDescription>
                    {Array.from(fileProblems.values()).flat().join(" ")}
                  </AlertDescription>
                </Alert>
              )}
              {configError && (
                <Alert variant="destructive">
                  <TriangleAlertIcon />
                  <AlertTitle>Cannot start batch</AlertTitle>
                  <AlertDescription>{configError}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>
        </section>

        {items.length > 0 && schedule.length > 0 && (
          <section aria-labelledby="bulk-review">
            <h2 id="bulk-review" className="text-lg font-medium">
              Review
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              One ordinary scheduled post per video. Each stays editable,
              retryable and deletable on its own.
            </p>
            <ul className="flex flex-col gap-2">
              {items.map((item, index) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInZone(schedule[index] ?? "", timeZone)} ·{" "}
                      {selectedAccounts.map((a) => a.platform).join(", ") || "no accounts"}
                    </p>
                  </div>
                  {item.status === "done" ? (
                    <Badge variant="secondary">Scheduled</Badge>
                  ) : item.status === "error" ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : running ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(item.key)}
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => void handleRun(false)}
            disabled={running || items.length === 0 || !configValidation.ok || fileProblems.size > 0}
            className="flex-1"
          >
            {running && <Spinner data-icon="inline-start" />}
            <CalendarClockIcon data-icon="inline-start" />
            {running
              ? `Scheduling… ${doneCount + errorCount}/${items.length}`
              : `Schedule ${items.length} ${items.length === 1 ? "post" : "posts"}`}
          </Button>
          {errorCount > 0 && !running && (
            <Button variant="outline" onClick={() => void handleRun(true)}>
              <RotateCcwIcon data-icon="inline-start" />
              Retry {errorCount} failed
            </Button>
          )}
        </div>
        {finished && !allDone && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Batch partially scheduled</AlertTitle>
            <AlertDescription>
              {doneCount} of {items.length} posts scheduled. Failed items kept
              their errors above — retry them or remove them.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {running && activeCount > 0 && (
        <div className="mt-4">
          <Progress
            value={Math.round(((doneCount + errorCount) / items.length) * 100)}
            aria-label="Batch progress"
          />
        </div>
      )}
    </div>
  );
}
