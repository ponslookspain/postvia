"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClockIcon,
  CheckIcon,
  ClapperboardIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { cn } from "cn";
import { validateMediaInput } from "@/lib/media";
import { waitForMediaRegistration } from "@/lib/media-registration";
import {
  BULK_INTERVAL_PRESETS,
  BULK_MAX_VIDEOS,
  BULK_TIMEZONES,
  buildBulkPostBody,
  bulkTextLimit,
  computeBulkSchedule,
  partitionDuplicateAdds,
  shouldAcceptRunRequest,
  validateBulkConfig,
  validateBulkVideoForAccountsDetailed,
  zonedTimeToIso,
  type BulkAccountRef,
  type BulkCapabilityIssue,
} from "@/lib/bulk-schedule";
import { bulkItemOperationId, newOperationId } from "@/lib/idempotency";
import { reportError } from "@/lib/diagnostics";
import { getPlan, type PlanId } from "@/lib/plans";
import { getPlatformCapabilities } from "@/lib/platforms/capabilities";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer, PageSections } from "@/components/layout/PageContainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { ChannelStrip } from "../new/_components/ChannelStrip";
import { ScheduleDatePicker } from "../new/_components/ScheduleDatePicker";
import { BulkVideoRow } from "./BulkVideoRow";

type ItemStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "registering"
  | "scheduling"
  | "scheduled"
  | "failed";

type BulkItem = {
  key: string;
  /**
   * Stable batch slot assigned once when the item enters the batch.
   * Survives removals and retry-only runs: the idempotency key derives
   * from (batchId, slot), never from the list position.
   */
  slot: number;
  file: File;
  /** Local thumbnail URL for image items (revoked on remove/unmount). */
  previewUrl: string | null;
  progress: number;
  status: ItemStatus;
  error?: string;
  postId?: string;
  scheduledIso?: string;
};

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
  const abortRef = useRef<AbortController | null>(null);
  // Batch idempotency: one batch id per component lifetime, one stable
  // slot per item. Every create carries bulkItemOperationId(batchId, slot)
  // so a double-submit — even two runs interleaved — collapses onto the
  // same Post rows server-side instead of creating 2N posts.
  const batchIdRef = useRef<string | null>(null);
  const slotCounterRef = useRef(0);
  function getBatchId(): string {
    if (!batchIdRef.current) batchIdRef.current = newOperationId();
    return batchIdRef.current;
  }

  const itemsRef = useRef<BulkItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);
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

  // Capability gate per file, same registry rules as the manual composer
  // plus the global file gate (size/type). Fully attributed per file and
  // per account BEFORE any upload starts: "clip.mp4 — X: <reason>".
  // Keyed by item key so two items sharing a filename stay independent.
  const { bulkIssues, fileProblems, problemPlatforms }: {
    bulkIssues: BulkCapabilityIssue[];
    fileProblems: Map<string, string[]>;
    problemPlatforms: Map<string, string[]>;
  } = useMemo(() => {
    const all: BulkCapabilityIssue[] = [];
    const problems = new Map<string, string[]>();
    const platforms = new Map<string, string[]>();
    for (const item of items) {
      const issues = validateBulkVideoForAccountsDetailed(
        { name: item.file.name, mimeType: item.file.type, size: item.file.size },
        selectedAccounts
      );
      all.push(...issues);
      if (issues.length > 0) {
        problems.set(
          item.key,
          issues.map((issue) => issue.message)
        );
        platforms.set(item.key, [
          ...new Set(issues.map((issue) => issue.platformLabel)),
        ]);
      }
    }
    return { bulkIssues: all, fileProblems: problems, problemPlatforms: platforms };
  }, [items, selectedAccounts]);

  const doneCount = items.filter((item) => item.status === "scheduled").length;
  const errorCount = items.filter((item) => item.status === "failed").length;
  const activeCount = items.filter(
    (item) => item.status !== "scheduled" && item.status !== "failed"
  ).length;

  function appendFiles(files: File[]) {
    // Slots and preview URLs are assigned outside the state updater
    // (updaters must stay pure and may re-run); gaps from room-capping
    // are harmless. Preview URLs are revoked on remove/unmount.
    const withSlots = files.map((file) => ({
      file,
      slot: slotCounterRef.current++,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    }));
    setItems((prev) => {
      const room = batchCap - prev.length;
      const capped = withSlots.slice(0, Math.max(0, room));
      if (files.length > capped.length) {
        for (const skipped of withSlots.slice(capped.length)) {
          if (skipped.previewUrl) URL.revokeObjectURL(skipped.previewUrl);
        }
        toast.add({
          title: "Batch is full",
          description: `A batch holds at most ${batchCap} files.`,
          type: "warning",
        });
      }
      return [
        ...prev,
        ...capped.map(({ file, slot, previewUrl }) => ({
          key: nextItemKey(),
          slot,
          file,
          previewUrl,
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
      if (!validation.ok) {
        toast.add({
          title: "File skipped",
          description: `${file.name}: ${validation.error}`,
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
    setItems((prev) => {
      const item = prev.find((entry) => entry.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((entry) => entry.key !== key);
    });
  }

  function patchItem(key: string, patch: Partial<BulkItem>) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  async function uploadOneVideo(
    postId: string,
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
    onRegistering?: () => void
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
      // The reserved pathname is the server truth (signed scope +
      // webhook registration key): the SDK echo is ignored so a
      // re-encoded/non-ASCII echo can never desync registration polling
      // from the stored object.
      await uploadPresigned(pathname, file, {
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
      // Bytes are stored; now waiting on the server webhook to register
      // the Media row — a distinct, visible stage.
      onRegistering?.();
      return await waitForMediaRegistration({ postId, pathname, signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload error";
      reportError("bulk-client", "upload video failed", error, { postId });
      return `Upload failed: ${message}`;
    }
  }

  async function processItem(
    item: BulkItem,
    scheduledIso: string,
    batchSize: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    if (signal?.aborted) {
      patchItem(item.key, { status: "failed", error: "Batch canceled." });
      return false;
    }
    // 1. Draft first: an aborted batch leaves harmless drafts, never
    //    half-broken scheduled posts. The idempotency key is stable per
    //    (batch, slot): a retried or double-submitted item replays onto
    //    its own existing draft instead of creating a second post.
    patchItem(item.key, { status: "creating", error: undefined });
    let postId: string;
    try {
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildBulkPostBody({ text, accountIds: selectedAccountIds }),
          // Attests the whole batch size so the server can enforce the
          // plan's bulk gate per item; the monthly quota backstops the rest.
          bulkBatchSize: batchSize,
          clientOperationId: bulkItemOperationId(getBatchId(), item.slot),
        }),
      });
      const created = await createRes.json().catch(() => null);
      if (!createRes.ok || typeof created?.id !== "string") {
        patchItem(item.key, {
          status: "failed",
          error: "Unable to create this post. Please try again.",
        });
        return false;
      }
      postId = created.id;
    } catch (error) {
      reportError("bulk-client", "create bulk post failed", error);
      patchItem(item.key, { status: "failed", error: "Unable to create this post. Please try again." });
      return false;
    }
    patchItem(item.key, { postId });

    // 2. Upload the file through the standard secure pipeline.
    patchItem(item.key, { status: "uploading", progress: 0 });
    const uploadError = await uploadOneVideo(
      postId,
      item.file,
      (percent) => patchItem(item.key, { progress: percent }),
      signal,
      () => patchItem(item.key, { status: "registering" })
    );
    if (uploadError) {
      // No half-broken scheduled post: remove the draft (and its blob).
      await fetch(`/api/posts/${postId}`, { method: "DELETE" }).catch(() => null);
      patchItem(item.key, { status: "failed", error: "Unable to upload this file. Please try again." });
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
      await scheduleRes.json().catch(() => null);
      if (!scheduleRes.ok) {
        await fetch(`/api/posts/${postId}`, { method: "DELETE" }).catch(() => null);
        patchItem(item.key, {
          status: "failed",
          error: "Unable to schedule this post. Please try again.",
        });
        return false;
      }
    } catch {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" }).catch(() => null);
      patchItem(item.key, { status: "failed", error: "Unable to schedule this post. Please try again." });
      return false;
    }
    patchItem(item.key, { status: "scheduled", progress: 100, scheduledIso });
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
        "Some files are not supported by the selected accounts. Remove them or change accounts."
      );
      return;
    }
    // The shared text must fit every selected platform (TikTok photo
    // posts narrow to the 90-character title cap). Server re-validates;
    // this fails fast before any draft exists. Empty text fails here too:
    // bulk carries no per-target overrides, so a description-only post is
    // impossible and the server would 400 every item after creating
    // doomed drafts.
    {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        setConfigError("Add post text before starting the batch.");
        return;
      }
      const hasVideo = items.some((item) =>
        item.file.type.startsWith("video/")
      );
      const hasImage = items.some((item) =>
        item.file.type.startsWith("image/")
      );
      for (const account of selectedAccounts) {
        const limit = bulkTextLimit(account.platform, {
          hasVideo,
          hasImage,
        });
        if (Array.from(trimmed).length > limit) {
          const label = getPlatformCapabilities(account.platform).label;
          setConfigError(
            `Post text is too long for ${label} (max ${limit} characters). Shorten it or remove that account.`
          );
          return;
        }
      }
    }
    if (startIso === null) {
      setConfigError("Choose a valid start date and time.");
      return;
    }
    const queue = items.filter((item) =>
      retryOnly ? item.status === "failed" : item.status !== "scheduled"
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
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    runningRef.current = true;
    setFinished(false);
    let succeeded = 0;
    try {
      for (const item of queue) {
        if (controller.signal.aborted) break;
        const index = items.findIndex((entry) => entry.key === item.key);
        const iso = isos[index];
        if (!iso) {
          patchItem(item.key, { status: "failed", error: "Could not compute schedule." });
          continue;
        }
        if (await processItem(item, iso, queue.length, controller.signal)) succeeded++;
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      setFinished(true);
      abortRef.current = null;
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
      <PageContainer size="wide">
        <PageHeader
          title="Bulk scheduling"
          description="Upload images or videos and schedule one post per file, spaced by a fixed interval. Publishing runs on the regular schedule engine."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:py-14">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
            >
              <ClapperboardIcon className="size-6" />
            </span>
            <div className="flex max-w-md flex-col gap-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-balance">
                No media accounts connected
              </h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                Connect a profile that supports media to schedule a batch.
              </p>
            </div>
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/accounts" />}
              className="min-h-11 w-full sm:w-auto"
            >
              Connect account
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (!billing.bulk) {
    const upgradeName = billing.upgradeTo
      ? getPlan(billing.upgradeTo).name
      : null;
    return (
      <PageContainer size="wide">
        <PageHeader
          title="Bulk scheduling"
          description="Upload images or videos and schedule one post per file, spaced by a fixed interval. Publishing runs on the regular schedule engine."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:py-14">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
            >
              <ClapperboardIcon className="size-6" />
            </span>
            <div className="flex max-w-md flex-col gap-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-balance">
                Bulk scheduling needs a bigger plan
              </h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                Bulk scheduling is not included in your current plan.
                {upgradeName
                  ? ` Upgrade to ${upgradeName} to unlock it.`
                  : " Manage your plan to unlock it."}
              </p>
            </div>
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/billing" />}
              className="min-h-11 w-full sm:w-auto"
            >
              {upgradeName ? `Upgrade to ${upgradeName}` : "Manage plan"}
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Bulk scheduling"
        description="Upload images or videos and schedule one post per file, spaced by a fixed interval. Publishing runs on the regular schedule engine."
        actions={
          <Badge variant="secondary" className="tabular-nums">
            {items.length}/{batchCap} files
          </Badge>
        }
      />

      <ol
        aria-label="Batch progress"
        className="mb-8 flex items-center gap-2"
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

      <PageSections className="gap-8">
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
        <section aria-labelledby="bulk-media">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Media</CardTitle>
              <CardDescription>
                Images or video, up to {batchCap} files per batch. Each
                file is uploaded separately with its own progress.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary" className="tabular-nums">
                  {items.length}/{batchCap}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {items.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={running}
                  className="h-20 w-full flex-col gap-1 border-dashed py-3"
                >
                  <UploadIcon data-icon="inline-start" />
                  Add media
                  <span className="text-xs font-normal text-muted-foreground">
                    Images or video, up to {batchCap} files per batch
                  </span>
                </Button>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((item, index) => (
                    <BulkVideoRow
                      key={item.key}
                      name={item.file.name}
                      sizeLabel={formatFileSize(item.file.size)}
                      status={item.status}
                      progress={item.progress}
                      error={item.error ?? null}
                      problems={fileProblems.get(item.key) ?? []}
                      problemPlatforms={problemPlatforms.get(item.key) ?? []}
                      timeLabel={
                        schedule.length > 0
                          ? formatInZone(schedule[index] ?? "", timeZone)
                          : null
                      }
                      previewUrl={item.previewUrl}
                      isVideo={!item.file.type.startsWith("image/")}
                      running={running}
                      onRemove={() => removeItem(item.key)}
                    />
                  ))}
                </ul>
              )}
              {items.length > 0 && items.length < batchCap && !running && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={running}
                  className="h-14 w-full flex-row gap-1.5 border-dashed"
                >
                  <UploadIcon data-icon="inline-start" />
                  Add more media
                </Button>
              )}
              {pendingDupes.length > 0 && (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertTitle>Video already in this batch</AlertTitle>
                  <AlertDescription>
                    <span className="block max-w-full truncate">
                      {pendingDupes.map((file) => file.name).join(", ")}
                    </span>
                    Add{" "}
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
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.m4v,.webm,.mov"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="bulk-content">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>
                The same text is used for every post in the batch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="bulk-text" className="sr-only">
                  Post text
                </FieldLabel>
                <Textarea
                  id="bulk-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write something worth publishing..."
                  rows={3}
                  className="min-h-24 text-[15px] leading-relaxed"
                />
              </Field>
            </CardContent>
          </Card>
        </section>

        <ChannelStrip
          accounts={accounts.map((account) => ({
            ...account,
            implemented: true,
          }))}
          selectedAccountIds={selectedAccountIds}
          targetOverrides={{}}
          disabled={running}
          mediaErrors={[]}
          onToggle={(accountId, checked) => {
            if (running) return;
            setSelectedAccountIds((current) =>
              checked
                ? [...current, accountId]
                : current.filter((id) => id !== accountId)
            );
          }}
        />

        <section aria-labelledby="bulk-schedule">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>
                First post goes out at the start time, the rest follow
                spaced by the interval.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
              <div
                aria-live="polite"
                className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] leading-5 text-muted-foreground tabular-nums"
              >
                <CalendarClockIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <p className="min-w-0">
                  {!scheduleDate || !scheduleTime ? (
                    "Choose a start date and time."
                  ) : !startIso || schedule.length === 0 ? (
                    "Pick a valid future start — the schedule appears here."
                  ) : (
                    <>
                      First post {formatInZone(startIso, timeZone)} → then
                      every{" "}
                      {intervalMinutes >= 60
                        ? `${intervalMinutes / 60}h`
                        : `${intervalMinutes}m`}{" "}
                      · {schedule.length}{" "}
                      {schedule.length === 1 ? "post" : "posts"} · last{" "}
                      {formatInZone(
                        schedule[schedule.length - 1] ?? "",
                        timeZone
                      )}{" "}
                      · {timeZone.replaceAll("_", " ")}
                    </>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bulk-date">Start date</FieldLabel>
                  <ScheduleDatePicker
                    id="bulk-date"
                    value={scheduleDate}
                    disabled={running}
                    onChange={setScheduleDate}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <span
                      role="group"
                      aria-label="Interval presets"
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      {BULK_INTERVAL_PRESETS.map((preset) => {
                        const active = intervalMinutes === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            disabled={running}
                            aria-pressed={active}
                            onClick={() => setIntervalMinutes(preset)}
                            className={cn(
                              "h-6 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40",
                              active
                                ? "border-signal/60 bg-signal/[0.07] text-signal"
                                : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                            )}
                          >
                            {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                          </button>
                        );
                      })}
                    </span>
                  </FieldDescription>
                </Field>
              </div>
              {fileProblems.size > 0 && (
                <Alert>
                  <TriangleAlertIcon className="text-warning" />
                  <AlertTitle>Unsupported combination</AlertTitle>
                  <AlertDescription>
                    <span className="mb-1 block">
                      Fix these before scheduling — nothing has been uploaded yet.
                    </span>
                    <ul className="flex list-disc flex-col gap-0.5 pl-4">
                      {bulkIssues.slice(0, 8).map((issue) => (
                        <li key={`${issue.fileName}-${issue.accountId}`}>
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                    {bulkIssues.length > 8 && (
                      <span className="mt-1 block">
                        …and {bulkIssues.length - 8} more.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {configError && (
                <Alert>
                  <TriangleAlertIcon className="text-warning" />
                  <AlertTitle>Cannot start batch</AlertTitle>
                  <AlertDescription>{configError}</AlertDescription>
                </Alert>
              )}
              </FieldGroup>
            </CardContent>
          </Card>
        </section>

        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Batch</CardTitle>
              <CardDescription>
                {items.length === 0
                  ? "Add media to build the schedule."
                  : startIso
                    ? `First post ${formatInZone(startIso, timeZone)}.`
                    : "Choose a start date and time."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Media</dt>
                  <dd className="font-medium tabular-nums">
                    {items.length}/{batchCap}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Accounts</dt>
                  <dd className="font-medium tabular-nums">
                    {selectedAccountIds.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Interval</dt>
                  <dd className="font-medium tabular-nums">
                    {intervalMinutes >= 60
                      ? `${intervalMinutes / 60}h`
                      : `${intervalMinutes}m`}
                  </dd>
                </div>
              </dl>
              <Button
                size="lg"
                onClick={() => void handleRun(false)}
                disabled={running || items.length === 0 || !configValidation.ok || fileProblems.size > 0}
                className="min-h-11 w-full"
              >
                {running && <Spinner data-icon="inline-start" />}
                {!running && <CalendarClockIcon data-icon="inline-start" />}
                {running
                  ? `Scheduling… ${doneCount + errorCount}/${items.length}`
                  : `Schedule ${items.length} ${items.length === 1 ? "post" : "posts"}`}
              </Button>
              {errorCount > 0 && !running && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => void handleRun(true)}
                  className="min-h-11 w-full"
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Retry {errorCount} failed
                </Button>
              )}
              {running && activeCount > 0 && (
                <Progress
                  value={Math.round(((doneCount + errorCount) / items.length) * 100)}
                  aria-label="Batch progress"
                />
              )}
              {running && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => abortRef.current?.abort()}
                  className="min-h-11 w-full"
                >
                  Cancel batch
                </Button>
              )}
              {finished && !allDone && (
                <Alert>
                  <AlertTitle>Batch partially scheduled</AlertTitle>
                  <AlertDescription>
                    {doneCount} of {items.length} posts scheduled. Retry the
                    failed items or remove them.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </PageSections>
    </PageContainer>
  );
}
