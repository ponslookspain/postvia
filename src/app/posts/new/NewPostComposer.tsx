"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  CalendarClockIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  HourglassIcon,
  OctagonXIcon,
  PencilIcon,
  RotateCcwIcon,
  UsersIcon,
} from "lucide-react";
import { threadsPostUrl, isFutureIso } from "@/lib/utils";
import type { PlanId } from "@/lib/plans";
import { parsePlanParam } from "@/lib/plans";
import {
  buildComposerPreviewModel,
  buildComposerPreviews,
  buildComposerMediaErrors,
  countCharacters,
  firstBlockingPreviewError,
  hasBlockingFileIssues,
  hasBlockingPreviewErrors,
} from "@/lib/composer-previews";
import {
  pollPostSettled,
  type PollProgress,
  type SettledPost,
} from "@/lib/publish-poll";
import { waitForMediaRegistration } from "@/lib/media-registration";
import {
  canSubmitComposer,
  continueEditingFromSaved,
  defaultSelectedAccountIds,
  getFailedPublishActions,
  isComposerDirty,
  mapWithConcurrencyLimit,
  MEDIA_UPLOAD_CONCURRENCY,
  planMediaAdd,
  resolveScheduleClick,
  runScheduleFlow,
  selectMediaForUpload,
  type ScheduleFlowDenial,
} from "@/lib/composer-media";
import { createSingleFlight, newOperationId } from "@/lib/idempotency";
import { reportError } from "@/lib/diagnostics";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyBlock } from "@/components/StateBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { ChannelStrip } from "./_components/ChannelStrip";
import { ChannelCustomizer } from "./_components/ChannelCustomizer";
import { ComposerCard } from "./_components/ComposerCard";
import { PreviewRail } from "./_components/PreviewRail";
import { PublishCard } from "./_components/PublishCard";
import { MobileComposerBar } from "./_components/MobileComposerBar";
import { useTikTokCreatorInfo } from "./_components/useTikTokCreatorInfo";

/**
 * Schedule dialog loads on demand (C3): it owns the calendar picker
 * (react-day-picker), which otherwise ships in the initial composer
 * bundle even though the dialog opens only on explicit click. Rendered
 * conditionally so the chunk fetches on first open; the dialog is fully
 * controlled so remounting loses no state.
 *
 * C6 bundle verdict (measured 2026-09-15, Next.js 16.3.4 production
 * build): /posts/new initial client JS is 508.3 KB in 17 chunks with
 * this split vs 582.6 KB in 16 chunks with a static import (-74.3 KB,
 * -12.8%, deferred to first dialog open). date-fns stays server-only
 * (dashboard analytics); lucide-react ships per-icon (unused icons
 * absent from all chunks); no dependency was added for optimization.
 * Retained as-is: /posts/bulk renders the same picker inline on first
 * paint, so the library must stay initial there — lazy-loading it
 * would harm UX. No further split is justified by measurement.
 */
const ScheduleDialog = dynamic(
  () =>
    import("./_components/ScheduleDialog").then((mod) => mod.ScheduleDialog),
  { loading: () => null }
);

import type { Platform } from "@prisma/client";
import type {
  ConnectedAccount,
  DraftMedia,
  PublishResult,
  TargetOverrideState,
} from "./_components/types";

const MAX_MEDIA = 4;

let mediaKeyCounter = 0;

function nextMediaKey(): string {
  mediaKeyCounter += 1;
  return `media-${mediaKeyCounter}-${Date.now()}`;
}

type PrepareResponse = {
  pathname: string;
};

function uploadFileToPost(
  postId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    (async () => {
      try {
        onProgress(0);

        // Step 1: the server reserves an authorized, ASCII-only,
        // user/post-scoped pathname (session + ownership + limits checked).
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
          resolve(
            typeof data?.error === "string"
              ? data.error
              : "Failed to prepare upload"
          );
          return;
        }
        const { pathname } = (await prepRes.json()) as PrepareResponse;

        // Step 2: official Vercel Blob client upload for private stores.
        // The SDK is imported lazily so its chunk stays out of the
        // composer's initial bundle until a file is actually uploaded.
        // The reserved pathname is the server truth (signed scope +
        // webhook registration key): the SDK echo is ignored so a
        // re-encoded/non-ASCII echo can never desync registration polling
        // from the stored object.
        try {
          const { uploadPresigned } = await import("@vercel/blob/client");
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
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown upload error";
          resolve(`Upload failed: ${message}`);
          return;
        }
        onProgress(100);

        // Step 3: the server registers the Media row from the verified
        // blob.upload-completed webhook; wait for it before publishing.
        resolve(await waitForMediaRegistration({ postId, pathname }));
      } catch (error) {
        reportError("composer-client", "upload file failed", error, {
          postId,
        });
        resolve("Unable to upload this file. Please try again.");
      }
    })();
  });
}

function parseScheduleDenial(data: {
  code?: unknown;
  reason?: unknown;
  upgradeTo?: unknown;
} | null): ScheduleFlowDenial | null {
  if (!data || data.code !== "UPGRADE_REQUIRED") return null;
  return {
    reason:
      typeof data.reason === "string" ? data.reason : "Plan limit reached.",
    upgradeTo: parsePlanParam(data.upgradeTo),
  };
}

export default function NewPostComposer({
  userName,
  accounts,
  quota,
}: {
  userName: string;
  accounts: ConnectedAccount[];
  quota: { postsLeft: number | null; upgradeTo: PlanId | null };
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() =>
    defaultSelectedAccountIds(accounts)
  );
  const [targetOverrides, setTargetOverrides] = useState<TargetOverrideState>({});
  const [customizingIds, setCustomizingIds] = useState<string[]>([]);
  const [mediaUploadNote, setMediaUploadNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PollProgress | null>(
    null
  );
  // Post id the user stopped waiting for: publishing continues server-side.
  const [publishWatchId, setPublishWatchId] = useState<string | null>(null);
  const publishAbortRef = useRef<AbortController | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null
  );
  const [scheduleMode, setScheduleMode] = useState(false);
  const [xScheduleHint, setXScheduleHint] = useState(false);
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  // Single-open accordion state for the preview rail. `false` collapses
  // everything; `null` follows the automatic default below.
  const [expandedPreviewId, setExpandedPreviewId] = useState<
    string | false | null
  >(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<{
    reason: string;
    upgradeTo: PlanId | null;
  } | null>(null);

  // Idempotency key for this editing session: minted once, reused by every
  // retry / double-submit of the same user action so POST /api/posts
  // collapses repeats into one row. Rotated after each terminal success —
  // the next explicit action is a new operation with a new key.
  const operationIdRef = useRef<string | null>(null);
  function getOperationId(): string {
    if (!operationIdRef.current) {
      operationIdRef.current = newOperationId();
    }
    return operationIdRef.current;
  }
  function rotateOperationId(): void {
    operationIdRef.current = newOperationId();
  }
  // Synchronous single-flight guards. React state (`scheduling`, …) flips
  // only on the next render, so two clicks in the same tick would both
  // pass a state check and fire two POSTs; a ref read + set is
  // synchronous, so the second entrant always loses. One guard per action.
  const flightRefs = useRef({
    schedule: createSingleFlight(),
    save: createSingleFlight(),
    publish: createSingleFlight(),
  });

  const quotaBlocked = quota.postsLeft !== null && quota.postsLeft <= 0;

  const selectedAccounts = accounts.filter((account) =>
    selectedAccountIds.includes(account.id)
  );
  const platform: Platform = selectedAccounts[0]?.platform ?? "THREADS";
  const charCount = countCharacters(text);
  const previews = buildComposerPreviews(
    selectedAccounts,
    text,
    selectedAccountIds.map((accountId) => {
      const account = accounts.find((item) => item.id === accountId);
      const override = targetOverrides[accountId];
      return {
        accountId,
        text: account?.platform === "TIKTOK" ? override?.title : override?.text,
      };
    })
  );
  const hasOverLimit = previews.some((preview) => preview.overLimit);
  const mediaErrors = buildComposerMediaErrors(
    selectedAccounts,
    media.map((item) => ({
      type: item.kind,
      mimeType: item.file.type,
      size: item.file.size,
    }))
  );
  const hasMediaError = mediaErrors.length > 0;
  // Stage 2B: single-preview presentation model. Derived from the same
  // composer state as the gating pipeline above — no second store.
  // The gating pipeline (hasOverLimit/canSave/canPublish) intentionally
  // keeps its existing semantics.
  const previewModels = buildComposerPreviewModel({
    accounts: selectedAccounts,
    globalText: text,
    overrides: selectedAccountIds.map((accountId) => {
      const account = accounts.find((item) => item.id === accountId);
      const override = targetOverrides[accountId];
      return {
        accountId,
        text: account?.platform === "TIKTOK" ? override?.title : override?.text,
        description:
          account?.platform === "TIKTOK" ? override?.description : undefined,
      };
    }),
    overrideSettings: Object.fromEntries(
      selectedAccountIds.map((accountId) => [
        accountId,
        targetOverrides[accountId]?.settings ?? {},
      ])
    ),
    media: media.map((item) => ({
      type: item.kind,
      mimeType: item.file.type,
      name: item.name,
      size: item.size,
    })),
  });
  // One rail item per selected account, in selection order. Read-only
  // presentation data only — gating and override state stay untouched.
  const railItems = previewModels.map((model) => {
    const account = accounts.find((item) => item.id === model.accountId);
    const override = targetOverrides[model.accountId];
    return {
      model,
      identityLabel: model.label,
      identityUsername: account?.username ?? "",
      customText:
        account?.platform === "TIKTOK" ? override?.title : override?.text,
      hasOverride: Boolean(override),
    };
  });
  // Effective accordion expansion: an explicit choice wins when its
  // account is still selected, otherwise the first blocking-error
  // preview opens, else the first preview. Stale ids after deselect
  // fall back to the default instead of leaving everything shut.
  const railAccountIds = railItems.map((item) => item.model.accountId);
  const autoExpandedId =
    railItems.find((item) => item.model.validation.errors.length > 0)
      ?.model.accountId ??
    railItems[0]?.model.accountId ??
    null;
  const effectiveExpandedId =
    expandedPreviewId === false
      ? null
      : expandedPreviewId !== null && railAccountIds.includes(expandedPreviewId)
        ? expandedPreviewId
        : autoExpandedId;
  function togglePreviewExpanded(accountId: string) {
    setExpandedPreviewId(
      effectiveExpandedId === accountId ? false : accountId
    );
  }
  // Quota is known upfront from props: an exhausted plan disables every
  // submit path before any request, with the reason shown in the Publish
  // card. The server 403 stays as defense-in-depth.
  // Per-file media issues (today: oversized files only) block submit too —
  // an unregistered oversized file can never publish.
  const hasBlockingFileIssue = hasBlockingFileIssues(previewModels);
  // Targets the server would fail deterministically (e.g. a TikTok target
  // without title/description) block Publish now, with the first blocking
  // message shown in the Publish card. Drafts stay saveable.
  const hasBlockingPreviewError = hasBlockingPreviewErrors(previewModels);
  const publishBlockedReason = hasBlockingPreviewError
    ? firstBlockingPreviewError(previewModels)
    : null;
  // Description-only TikTok photo posts carry no global text: a
  // non-empty photo description counts as content for submit gating
  // (the server accepts empty text for TikTok-description targets).
  const descriptionPresent = previewModels.some(
    (model) =>
      model.platform === "TIKTOK" &&
      model.tiktokMode === "photo" &&
      model.description.trim().length > 0
  );
  const canSave = canSubmitComposer({
    textPresent: text.trim().length > 0,
    descriptionPresent,
    overLimit: hasOverLimit,
    mediaError: hasMediaError || hasBlockingFileIssue,
    hasSelection: selectedAccountIds.length > 0,
    busy: saving,
    quotaBlocked,
  });
  const canPublish = canSubmitComposer({
    textPresent: text.trim().length > 0,
    descriptionPresent,
    overLimit: hasOverLimit,
    mediaError: hasMediaError || hasBlockingFileIssue,
    hasSelection: selectedAccountIds.length > 0,
    busy: publishing || saving,
    quotaBlocked,
    previewError: hasBlockingPreviewError,
  });
  const schedulingForX = selectedAccounts.some((account) => account.platform === "X");
  const { creatorInfos, creatorInfoErrors, retryCreatorInfo, resetForAccount } =
    useTikTokCreatorInfo(selectedAccounts);

  // Unmount stops client polling only; the server keeps publishing.
  useEffect(() => {
    return () => {
      publishAbortRef.current?.abort();
    };
  }, []);

  // Warn before losing unsaved composer content (refresh, tab close).
  // Active only in the editor branch with content the server lacks;
  // terminal screens (saved/published/scheduled) hold server state.
  const isEditing =
    !publishWatchId && !publishResult && !(saved && savedId);
  const isDirty = isComposerDirty({
    text,
    mediaCount: media.length,
    selectedAccountIds,
    initialAccountIds: defaultSelectedAccountIds(accounts),
    hasOverrides: Object.keys(targetOverrides).length > 0,
  });
  useEffect(() => {
    if (!isEditing || !isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isEditing, isDirty]);

  function buildPostBody(nextScheduledAt?: string) {
    return {
      text: text.trim(),
      platform,
      hasMedia: media.length > 0,
      mediaCount: media.length,
      clientOperationId: getOperationId(),
      accountIds: selectedAccountIds,
      targets: selectedAccountIds.map((accountId) => {
        const account = accounts.find((item) => item.id === accountId);
        const override = targetOverrides[accountId];
        if (!override) return { accountId, overrides: null };
        // TikTok video publishes the title as its caption; TikTok photo
        // publishes title + description as separate post_info fields.
        // The description is never sent for video (unsupported parameter).
        const content =
          account?.platform === "TIKTOK"
            ? {
                ...(override.title ? { title: override.title } : {}),
                ...(override.description
                  ? { description: override.description }
                  : {}),
              }
            : override.text
              ? { text: override.text }
              : {};
        const settings = override.settings ?? {};
        const hasContent = Object.keys(content).length > 0;
        const hasSettings = Object.keys(settings).length > 0;
        return {
          accountId,
          overrides:
            hasContent || hasSettings ? { content, settings } : null,
        };
      }),
      ...(nextScheduledAt ? { scheduledAt: nextScheduledAt } : {}),
    };
  }

  function updateOverride(
    accountId: string,
    patch: {
      text?: string;
      title?: string;
      description?: string;
      settings?: Record<string, unknown>;
    }
  ) {
    setTargetOverrides((current) => {
      const next = { ...current };
      const merged = { ...(next[accountId] ?? {}), ...patch };
      const hasText = Boolean(merged.text);
      const hasTitle = Boolean(merged.title);
      const hasDescription = Boolean(merged.description);
      const hasSettings = Boolean(
        merged.settings && Object.keys(merged.settings).length > 0
      );
      if (!hasText && !hasTitle && !hasDescription && !hasSettings) {
        delete next[accountId];
      } else {
        next[accountId] = merged;
      }
      return next;
    });
  }

  function clearTargetOverride(accountId: string) {
    setTargetOverrides((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
  }

  /**
   * Opens the per-channel editor in the center workspace for the given
   * account and scrolls it into view. Used by the read-only preview
   * rail (and the mobile preview sheet) instead of editing in place.
   */
  function handleCustomize(accountId: string) {
    setCustomizingIds((current) =>
      current.includes(accountId) ? current : [...current, accountId]
    );
    requestAnimationFrame(() => {
      document
        .getElementById(`customize-${accountId}`)
        ?.scrollIntoView({ block: "start" });
    });
  }

  function toggleAccountSelection(accountId: string, checked: boolean) {
    setSelectedAccountIds((current) =>
      checked ? [...current, accountId] : current.filter((id) => id !== accountId)
    );
    // Any selection change dismisses the X-scheduling hint.
    setXScheduleHint(false);
    if (!checked) {
      clearTargetOverride(accountId);
      setCustomizingIds((current) => current.filter((id) => id !== accountId));
      // Drop cached TikTok options so reselecting refetches fresh ones.
      if (
        accounts.find((account) => account.id === accountId)?.platform ===
        "TIKTOK"
      ) {
        resetForAccount(accountId);
      }
    }
  }

  function getScheduledIso(): string | null {
    if (!scheduleDate || !scheduleTime) return null;
    const local = new Date(`${scheduleDate}T${scheduleTime}`);
    if (Number.isNaN(local.getTime())) return null;
    return local.toISOString();
  }

  const scheduledIso = getScheduledIso();

  function clearMedia() {
    setMedia((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    setMediaUploadNote(null);
  }

  function addFiles(files: File[]) {
    // Decide everything before any side effect: no object URLs and no
    // selection change happen unless files are actually added.
    const plan = planMediaAdd({
      files,
      existingCount: media.length,
      maxMedia: MAX_MEDIA,
      selectedAccountIds,
      accounts,
    });
    for (const item of plan.rejected) {
      toast.add({
        title: "File not added",
        description: `${item.name}: ${item.error}`,
        type: "error",
        // Urgent announcement: Base UI only mirrors high-priority
        // toasts into a role="alert" live region.
        priority: "high",
      });
    }
    if (plan.limitExceeded) {
      toast.add({
        title: "Too many files",
        description: `You can attach up to ${MAX_MEDIA} files per post.`,
        type: "warning",
      });
      return;
    }
    if (plan.accepted.length === 0) return;
    // Adding media never deselects a platform: every implemented network
    // (Threads, Instagram, TikTok, X) accepts media, and any
    // platform-specific incompatibility surfaces as an explicit
    // validation error instead of silently changing the selection.
    if (plan.deselectAccountIds.length > 0) {
      const deselect = new Set(plan.deselectAccountIds);
      setSelectedAccountIds((current) =>
        current.filter((id) => !deselect.has(id))
      );
    }
    const pending: DraftMedia[] = plan.accepted.map((entry) => ({
      key: nextMediaKey(),
      file: entry.file as File,
      previewUrl: URL.createObjectURL(entry.file as File),
      kind: entry.kind,
      name: entry.file.name,
      size: entry.file.size,
      status: "pending",
      progress: 0,
    }));
    setMedia((prev) => {
      // Backstop for a same-tick double submit: never exceed the limit,
      // and revoke the just-created URLs when rejecting.
      if (prev.length + pending.length > MAX_MEDIA) {
        for (const item of pending) URL.revokeObjectURL(item.previewUrl);
        toast.add({
          title: "Too many files",
          description: `You can attach up to ${MAX_MEDIA} files per post.`,
          type: "warning",
        });
        return prev;
      }
      return [...prev, ...pending];
    });
  }

  function removeMedia(key: string) {
    setMedia((prev) => {
      const item = prev.find((m) => m.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((m) => m.key !== key);
    });
  }

  async function uploadMediaForPost(
    postId: string,
    onlyKeys?: readonly string[]
  ): Promise<string[]> {
    const items = selectMediaForUpload(media, postId, onlyKeys);
    for (const item of items) {
      setMedia((prev) =>
        prev.map((m) =>
          m.key === item.key
            ? { ...m, status: "uploading", progress: 0, error: undefined }
            : m
        )
      );
    }
    const outcomes = await mapWithConcurrencyLimit(
      items,
      MEDIA_UPLOAD_CONCURRENCY,
      async (item) => {
        const error = await uploadFileToPost(
          postId,
          item.file,
          (percent) =>
            setMedia((prev) =>
              prev.map((m) =>
                m.key === item.key ? { ...m, progress: percent } : m
              )
            )
        );
        if (error) {
          setMedia((prev) =>
            prev.map((m) =>
              m.key === item.key ? { ...m, status: "error", error } : m
            )
          );
          return `${item.name}: ${error}`;
        }
        setMedia((prev) =>
          prev.map((m) =>
            m.key === item.key
              ? { ...m, status: "done", registeredPostId: postId }
              : m
          )
        );
        return null;
      }
    );
    return outcomes.filter((entry): entry is string => entry !== null);
  }

  async function retryFailedMedia(key: string) {
    // Retry needs a draft to upload to: every failed item implies a
    // previous attempt, which always stored its post id.
    if (!savedId) return;
    await uploadMediaForPost(savedId, [key]);
  }

  async function readDenial(
    res: Response
  ): Promise<{ reason: string; upgradeTo: PlanId | null } | null> {
    if (res.status !== 403) return null;
    const data = await res.json().catch(() => null);
    if (data && data.code === "UPGRADE_REQUIRED") {
      return {
        reason:
          typeof data.reason === "string" ? data.reason : "Plan limit reached.",
        upgradeTo: parsePlanParam(data.upgradeTo),
      };
    }
    return null;
  }

  async function handleSaveDraft() {
    if (!canSave) return;
    // Single-flight FIRST, before any await: a second click in the same
    // tick must not reach the POST below.
    if (!flightRefs.current.save.tryAcquire()) return;
    setSaving(true);
    setQuotaError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPostBody()),
      });

      const denial = await readDenial(res.clone());
      if (denial) {
        setQuotaError(denial);
        return;
      }
      if (!res.ok) throw new Error("Failed to save");

      const data = await res.json();
      if (media.length > 0) {
        const errors = await uploadMediaForPost(data.id);
        setMediaUploadNote(
          errors.length > 0
            ? `Draft saved but some media could not be uploaded: ${errors.join("; ")}`
            : null
        );
      }
      setSavedId(data.id);
      setSaved(true);
      // Terminal success: the next explicit save is a new operation.
      // Failures keep the key so a retry replays onto the same draft.
      rotateOperationId();
    } catch (error) {
      reportError("composer-client", "save draft failed", error);
      toast.add({
        title: "Unable to save draft",
        description: "Please try again.",
        type: "error",
        priority: "high",
      });
    } finally {
      setSaving(false);
      flightRefs.current.save.release();
    }
  }

  function handleScheduleClick() {
    // X-only never opens the dialog and never no-ops: it
    // shows the inline explanation above instead.
    if (resolveScheduleClick(schedulingForX) === "show-x-hint") {
      setXScheduleHint(true);
      return;
    }
    setScheduleMode(true);
    setScheduleError(null);
  }

  async function handleSchedule() {
    setScheduleError(null);
    if (!schedulingForX && (!scheduleDate || !scheduleTime)) {
      setScheduleError("Please choose a date and time.");
      return;
    }
    if (
      !scheduledIso ||
      !isFutureIso(scheduledIso)
    ) {
      setScheduleError(
        "Scheduled time must be in the future. Please pick another date or time."
      );
      return;
    }

    // Single-flight AFTER sync validation, BEFORE any await: two clicks
    // (dialog Confirm + card button, desktop + mobile bar) in the same
    // tick must yield one POST, not two.
    if (!flightRefs.current.schedule.tryAcquire()) return;
    setScheduling(true);
    try {
      // Safe order: create a DRAFT first, upload + register media, and only
      // then apply the schedule via PATCH. A post must never sit in
      // SCHEDULED with unregistered or failed media.
      const result = await runScheduleFlow({
        scheduledIso,
        hasMedia: media.length > 0,
        createDraft: async () => {
          const res = await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPostBody()),
          });
          const data = (await res.json().catch(() => null)) as {
            id?: unknown;
            error?: unknown;
            code?: unknown;
            reason?: unknown;
            upgradeTo?: unknown;
          } | null;
          if (!res.ok) {
            const denial =
              res.status === 403 ? parseScheduleDenial(data) : null;
            if (denial) return { ok: false as const, denial };
            return {
              ok: false as const,
              error:
                typeof data?.error === "string"
                  ? data.error
                  : "Failed to schedule post.",
            };
          }
          if (typeof data?.id !== "string") {
            return {
              ok: false as const,
              error: "Failed to schedule post.",
            };
          }
          return { ok: true as const, id: data.id };
        },
        uploadMedia: (postId) => uploadMediaForPost(postId),
        applySchedule: async (postId, iso) => {
          const res = await fetch(`/api/posts/${postId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduledAt: iso }),
          });
          const data = (await res.json().catch(() => null)) as {
            error?: unknown;
            code?: unknown;
            reason?: unknown;
            upgradeTo?: unknown;
          } | null;
          if (!res.ok) {
            const denial =
              res.status === 403 ? parseScheduleDenial(data) : null;
            if (denial) return { ok: false as const, denial };
            return {
              ok: false as const,
              error:
                typeof data?.error === "string"
                  ? data.error
                  : "Failed to schedule post.",
            };
          }
          return { ok: true as const };
        },
      });

      if (result.outcome === "denied") {
        setQuotaError(result.denial);
        setScheduleMode(false);
        return;
      }
      if (result.outcome === "failed-before-create") {
        setScheduleError(result.error);
        return;
      }
      if (result.outcome === "failed-as-draft") {
        setScheduleError(
          `${result.error} The post was saved as a draft, not scheduled. Adjust the media and confirm again.`
        );
        setSavedId(result.postId);
        return;
      }
      setSavedId(result.postId);
      setScheduledAt(scheduledIso);
      setScheduleMode(false);
      // Terminal success: the next explicit schedule is a new operation.
      // Every failure path above keeps the key, so confirming again
      // replays onto the same draft instead of creating a second post.
      rotateOperationId();
    } catch (error) {
      reportError("composer-client", "schedule failed", error);
      setScheduleError("Failed to schedule post. Please try again.");
    } finally {
      setScheduling(false);
      flightRefs.current.schedule.release();
    }
  }

  async function handlePublish() {
    if (!canPublish) return;
    if (!flightRefs.current.publish.tryAcquire()) return;
    setPublishing(true);
    setPublishResult(null);
    setPublishWatchId(null);
    setPublishProgress(null);
    setQuotaError(null);
    const aborter = new AbortController();
    publishAbortRef.current = aborter;

    try {
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPostBody()),
      });

      const denial = await readDenial(createRes.clone());
      if (denial) {
        setQuotaError(denial);
        return;
      }
      if (!createRes.ok) throw new Error("Failed to create post");
      const postData = await createRes.json();

      if (media.length > 0) {
        const errors = await uploadMediaForPost(postData.id);
        if (errors.length > 0) {
          setPublishResult({
            ok: false,
            platform,
            error: `Failed to upload media: ${errors[0]}. The post was not published. You can retry from the saved draft.`,
          });
          setSavedId(postData.id);
          return;
        }
      }

      const publishRes = await fetch(`/api/posts/${postData.id}/publish`, {
        method: "POST",
      });

      if (!publishRes.ok && publishRes.status !== 202) {
        const result = await publishRes.json().catch(() => null);
        setPublishResult({
          ok: false,
          platform,
          error:
            typeof result?.error === "string"
              ? result.error
              : "Publication failed",
        });
        setSavedId(postData.id);
        return;
      }

      // 202: publishing continues server-side (waitUntil); poll the real
      // target statuses from the database instead of assuming success.
      // Cancel only stops this client polling — the server keeps going.
      const poll = await pollPostSettled({
        postId: postData.id,
        signal: aborter.signal,
        fetchPost: async (postId) => {
          const res = await fetch(`/api/posts/${postId}`);
          if (!res.ok) return null;
          return (await res.json()) as SettledPost;
        },
        onProgress: (progress) => setPublishProgress(progress),
      });
      if (poll.outcome === "aborted") {
        setSavedId(postData.id);
        setPublishWatchId(postData.id);
        return;
      }
      if (poll.outcome === "timeout") {
        setPublishResult({
          ok: false,
          platform,
          error:
            "Still publishing on some platforms. Open the post to watch progress.",
        });
        setSavedId(postData.id);
        return;
      }
      const settled = poll.post;
      if (settled.status === "PUBLISHED") {
        const done = (settled.targets ?? []).find(
          (t: { status: string }) => t.status === "PUBLISHED"
        );
        setPublishResult({
          ok: true,
          platform: done?.platform ?? platform,
          externalPostId: done?.externalPostId ?? undefined,
          username: done?.socialAccount?.username ?? undefined,
        });
      } else {
        const failedNotes = (settled.targets ?? [])
          .filter((t: { status: string }) => t.status === "FAILED")
          .map(
            (t: { platform: string; errorMessage?: string | null }) =>
              `${t.platform}: ${t.errorMessage || "failed"}`
          )
          .join("; ");
        setPublishResult({
          ok: false,
          platform,
          error:
            settled.status === "PARTIALLY_PUBLISHED"
              ? `Published to some platforms; others failed (${failedNotes || "see post"}). Open the post to retry.`
              : settled.errorMessage ||
                failedNotes ||
                "Publication failed",
        });
      }
      setSavedId(postData.id);
      // The post now exists server-side regardless of the publish outcome;
      // the next explicit publish is a new operation with a new key.
      rotateOperationId();
    } catch (error) {
      reportError("composer-client", "publish failed", error, {
        platform,
      });
      setPublishResult({
        ok: false,
        platform,
        error: "Unable to publish. Please try again.",
      });
    } finally {
      publishAbortRef.current = null;
      setPublishing(false);
      flightRefs.current.publish.release();
    }
  }

  if (publishWatchId) {
    const watchId = publishWatchId;
    return (
      <PageContainer size="narrow">
        <PageHeader title="Create post" />
        <EmptyBlock
          icon={<HourglassIcon />}
          title="Still publishing"
          description="Publishing continues on the server. Open the post to watch progress."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPublishWatchId(null)}
              >
                Back to editor
              </Button>
              <Button
                size="sm"
                onClick={() => router.push(`/posts/${watchId}`)}
              >
                View post
              </Button>
            </>
          }
        />
      </PageContainer>
    );
  }

  if (publishResult) {
    const resultPlatform = publishResult.platform ?? "X";
    const isThreads = resultPlatform === "THREADS";
    // Draft recovery: a failed publish with a saved draft must keep both
    // "Try again" and the link to the draft.
    const openDraftId = getFailedPublishActions(savedId).includes("open-draft")
      ? savedId
      : null;
    return (
      <PageContainer size="narrow">
        <PageHeader title="Create post" />
        <EmptyBlock
          icon={publishResult.ok ? <CircleCheckIcon /> : <OctagonXIcon />}
          title={
            publishResult.ok ? "Published successfully" : "Publication failed"
          }
          description={
            publishResult.ok ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-flex size-4 items-center justify-center [&_svg]:size-4">
                  <PlatformIcon platform={resultPlatform} />
                </span>
                @{publishResult.username} · Published
              </span>
            ) : (
              publishResult.error
            )
          }
          actions={
            <>
              {publishResult.ok &&
                publishResult.externalPostId &&
                publishResult.username && (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <a
                        href={
                          isThreads
                            ? threadsPostUrl(
                                publishResult.username,
                                publishResult.externalPostId
                              )
                            : `https://x.com/i/status/${publishResult.externalPostId}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      View on {isThreads ? "Threads" : "X"}
                      <ExternalLinkIcon data-icon="inline-end" />
                    </span>
                  </Button>
                )}
              {!publishResult.ok && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Keep savedId: the draft is the recovery path, and
                    // the "View post" action below must survive.
                    setPublishResult(null);
                  }}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Try again
                </Button>
              )}
              {openDraftId && (
                <Button
                  size="sm"
                  onClick={() => router.push(`/posts/${openDraftId}`)}
                >
                  View post
                </Button>
              )}
            </>
          }
        />
      </PageContainer>
    );
  }

  if (saved && savedId && scheduledAt) {    const scheduledLocal = new Date(scheduledAt);
    return (
      <PageContainer size="narrow">
        <PageHeader title="Create post" />
        <EmptyBlock
          icon={<CalendarClockIcon />}
          title="Post scheduled"
          description={
            <>
              {scheduledLocal.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              ·{" "}
              {scheduledLocal.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </>
          }
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSaved(false);
                  setScheduledAt(null);
                  setText("");
                  setScheduleDate("");
                  setScheduleTime("");
                  setScheduleMode(false);
                  clearMedia();
                }}
              >
                Create another
              </Button>
              <Button
                size="sm"
                onClick={() => router.push(`/posts/${savedId}`)}
              >
                View post
              </Button>
            </>
          }
        />
      </PageContainer>
    );
  }

  if (saved && savedId) {
    return (
      <PageContainer size="narrow">
        <PageHeader title="Create post" />
        <EmptyBlock
          icon={<CircleCheckIcon />}
          title="Draft saved"
          description={mediaUploadNote ?? undefined}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  // Back to editing with the draft content intact:
                  // text and media state are deliberately untouched.
                  continueEditingFromSaved({ setSaved, setSavedId })
                }
              >
                <PencilIcon data-icon="inline-start" />
                Continue editing
              </Button>
              <Button
                size="sm"
                onClick={() => router.push(`/posts/${savedId}`)}
              >
                View post
              </Button>
            </>
          }
        />
      </PageContainer>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[88rem] px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create post
          </h1>
          <p className="mt-1 max-w-[68ch] text-sm leading-5 text-muted-foreground">
            Write once, publish to every selected channel.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedAccountIds.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              <UsersIcon data-icon="inline-start" />
              {selectedAccountIds.length} selected
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreviewSheetOpen(true)}
            className="lg:hidden"
          >
            <EyeIcon data-icon="inline-start" />
            Preview
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ChannelStrip
            accounts={accounts}
            selectedAccountIds={selectedAccountIds}
            targetOverrides={targetOverrides}
            disabled={saving || publishing || scheduling}
            mediaErrors={mediaErrors}
            onToggle={toggleAccountSelection}
          />

          <ComposerCard
            text={text}
            onTextChange={setText}
            charCount={charCount}
            hasOverLimit={hasOverLimit}
            overLimitLabels={previews
              .filter((preview) => preview.overLimit)
              .map(
                (preview) => `${preview.label} (${preview.maxLength})`
              )}
            media={media}
            maxMedia={MAX_MEDIA}
            disabled={saving || publishing || scheduling}
            mediaUploadNote={mediaUploadNote}
            canRetry={savedId !== null}
            onAddFiles={addFiles}
            onRemove={removeMedia}
            onRetry={(key) => void retryFailedMedia(key)}
          />

          <ChannelCustomizer
            selectedAccounts={selectedAccounts}
            previewModels={previewModels}
            targetOverrides={targetOverrides}
            customizingIds={customizingIds}
            creatorInfos={creatorInfos}
            creatorInfoErrors={creatorInfoErrors}
            disabled={saving || publishing || scheduling}
            onExpand={handleCustomize}
            onCollapse={(accountId) =>
              setCustomizingIds((current) =>
                current.filter((id) => id !== accountId)
              )
            }
            onClearOverride={clearTargetOverride}
            onCustomTextChange={(accountId, targetPlatform, value) =>
              updateOverride(
                accountId,
                targetPlatform === "TIKTOK" ? { title: value } : { text: value }
              )
            }
            onCustomDescriptionChange={(accountId, value) =>
              updateOverride(accountId, { description: value })
            }
            onSettings={(accountId, patch) =>
              updateOverride(accountId, { settings: patch })
            }
            onRetryCreatorInfo={retryCreatorInfo}
            onOpenAccounts={() => router.push("/accounts")}
          />

          <div className="lg:sticky lg:top-4 lg:z-20">
            <PublishCard
              quotaBlocked={quotaBlocked}
              quotaError={quotaError}
              quotaUpgradeTo={quota.upgradeTo}
              schedulingForX={schedulingForX}
              scheduleMode={scheduleMode}
              scheduleDate={scheduleDate}
              scheduleTime={scheduleTime}
              xScheduleHint={xScheduleHint}
              publishing={publishing}
              publishProgress={publishProgress}
              canSave={canSave}
              canPublish={canPublish}
              publishBlockedReason={publishBlockedReason}
              saving={saving}
              scheduling={scheduling}
              onSaveDraft={handleSaveDraft}
              onScheduleClick={handleScheduleClick}
              onPublish={handlePublish}
              onAbort={() => publishAbortRef.current?.abort()}
              onDismissXHint={() => setXScheduleHint(false)}
            />
          </div>
        </div>

        <aside className="hidden min-w-0 lg:block" aria-label="Preview rail">
          <div className="sticky top-6">
            <PreviewRail
              items={railItems}
              userName={userName}
              media={media}
              disabled={saving || publishing || scheduling}
              expandedId={effectiveExpandedId}
              onToggleExpand={togglePreviewExpanded}
              onCustomize={handleCustomize}
            />
          </div>
        </aside>

      </div>

      {scheduleMode && !schedulingForX ? (
        <ScheduleDialog
          open
        scheduleDate={scheduleDate}
        scheduleTime={scheduleTime}
        scheduledIso={scheduledIso}
        scheduleError={scheduleError}
        savedId={savedId}
        scheduling={scheduling}
        canSave={canSave}
        // Content present: global text or a TikTok photo description
        // (description-only posts schedule like text posts).
        textPresent={text.trim().length > 0 || descriptionPresent}
        overLimit={hasOverLimit}
        mediaError={hasMediaError || hasBlockingFileIssue}
        hasSelection={selectedAccountIds.length > 0}
        quotaBlocked={quotaBlocked}
        quotaReason={quotaError?.reason ?? null}
        onDateChange={setScheduleDate}
        onTimeChange={setScheduleTime}
        onOpenChange={(open) => {
          if (!open) {
            setScheduleMode(false);
            setScheduleError(null);
          } else {
            setScheduleMode(true);
          }
        }}
        onCancel={() => {
          setScheduleMode(false);
          setScheduleError(null);
        }}
        onConfirm={handleSchedule}
        onOpenDraft={(postId) => router.push(`/posts/${postId}`)}
        />
      ) : null}
      <Sheet open={previewSheetOpen} onOpenChange={setPreviewSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="px-1 pb-3 text-left">
            <SheetTitle>Preview</SheetTitle>
            <SheetDescription>
              How your post will look on the selected channel.
            </SheetDescription>
          </SheetHeader>
          <PreviewRail
            items={railItems}
            userName={userName}
            media={media}
            disabled={saving || publishing || scheduling}
            expandedId={effectiveExpandedId}
            onToggleExpand={togglePreviewExpanded}
            onCustomize={(accountId) => {
              setPreviewSheetOpen(false);
              handleCustomize(accountId);
            }}
          />
        </SheetContent>
      </Sheet>
      {/* Spacer so the fixed mobile bar never covers content. */}
      <div aria-hidden="true" className="h-20 lg:hidden" />
      <MobileComposerBar
        canSave={canSave}
        canPublish={canPublish}
        saving={saving}
        scheduling={scheduling}
        publishing={publishing}
        schedulingForX={schedulingForX}
        onSaveDraft={handleSaveDraft}
        onScheduleClick={handleScheduleClick}
        onPublish={handlePublish}
      />
    </div>
  );
}
