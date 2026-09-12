"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImagePlusIcon,
  OctagonXIcon,
  PencilIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  TriangleAlertIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { threadsPostUrl, isFutureIso } from "@/lib/utils";
import { validateMediaInput } from "@/lib/media";
import {
  buildComposerPreviews,
  buildComposerMediaErrors,
} from "@/lib/composer-previews";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import type { Platform } from "@prisma/client";

type PublishResult = {
  ok: boolean;
  platform?: Platform;
  externalPostId?: string;
  username?: string;
  error?: string;
};

type DraftMedia = {
  key: string;
  file: File;
  previewUrl: string;
  kind: "IMAGE" | "VIDEO";
  name: string;
  size: number;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

type ConnectedAccount = {
  id: string;
  platform: Platform;
  username: string;
  implemented: boolean;
};

type TargetOverrideState = Record<
  string,
  { text?: string; title?: string; settings?: Record<string, unknown> }
>;

type TiktokCreatorInfo = {
  username: string;
  nickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

const MAX_MEDIA = 4;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let mediaKeyCounter = 0;

function nextMediaKey(): string {
  mediaKeyCounter += 1;
  return `media-${mediaKeyCounter}-${Date.now()}`;
}

type PrepareResponse = {
  pathname: string;
};

const MEDIA_REGISTER_TIMEOUT_MS = 20_000;
const MEDIA_REGISTER_POLL_MS = 500;

const PUBLISH_POLL_MS = 2000;
const PUBLISH_POLL_TIMEOUT_MS = 330_000;

type SettledPost = {
  status: string;
  errorMessage?: string | null;
  targets: {
    status: string;
    platform: Platform;
    externalPostId: string | null;
    errorMessage?: string | null;
    socialAccount?: { username: string } | null;
  }[];
};

async function waitForPostSettled(postId: string): Promise<SettledPost | null> {
  const deadline = Date.now() + PUBLISH_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, PUBLISH_POLL_MS));
    try {
      const res = await fetch(`/api/posts/${postId}`);
      if (!res.ok) continue;
      const post = (await res.json()) as SettledPost;
      if (post.status !== "PUBLISHING") return post;
    } catch {
      // transient network hiccup: keep polling until the deadline
    }
  }
  return null;
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
        let storedPathname = pathname;
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
          storedPathname = uploaded.pathname || pathname;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown upload error";
          resolve(`Upload failed: ${message}`);
          return;
        }
        onProgress(100);

        // Step 3: the server registers the Media row from the verified
        // blob.upload-completed webhook; wait for it before publishing.
        resolve(await waitForMediaRegistration(postId, storedPathname));
      } catch {
        resolve("Network error. Please try again.");
      }
    })();
  });
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

export default function NewPostComposer({
  userName,
  accounts,
}: {
  userName: string;
  accounts: ConnectedAccount[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() =>
    accounts
      .filter((account) => account.implemented && account.platform === "THREADS")
      .map((account) => account.id)
  );
  const [targetOverrides, setTargetOverrides] = useState<TargetOverrideState>({});
  const [customizingIds, setCustomizingIds] = useState<string[]>([]);
  const [creatorInfos, setCreatorInfos] = useState<
    Record<string, TiktokCreatorInfo | null>
  >({});
  const requestedCreatorInfo = useRef<Set<string>>(new Set());
  const [mediaUploadNote, setMediaUploadNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null
  );
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  const selectedAccounts = accounts.filter((account) =>
    selectedAccountIds.includes(account.id)
  );
  const platform: Platform = selectedAccounts[0]?.platform ?? "THREADS";
  const charCount = text.length;
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
    media.map((item) => ({ type: item.kind, mimeType: item.file.type }))
  );
  const hasMediaError = mediaErrors.length > 0;
  const canSave =
    text.trim().length > 0 &&
    !hasOverLimit &&
    !hasMediaError &&
    selectedAccountIds.length > 0 &&
    !saving;
  const canPublish =
    text.trim().length > 0 &&
    !hasOverLimit &&
    !hasMediaError &&
    selectedAccountIds.length > 0 &&
    !publishing &&
    !saving;
  const schedulingForX = selectedAccounts.some((account) => account.platform === "X");

  useEffect(() => {
    for (const account of selectedAccounts) {
      if (account.platform !== "TIKTOK") continue;
      if (requestedCreatorInfo.current.has(account.id)) continue;
      requestedCreatorInfo.current.add(account.id);
      fetch(
        `/api/social/tiktok/creator-info?accountId=${encodeURIComponent(account.id)}`
      )
        .then((response) =>
          response.ok
            ? (response.json() as Promise<TiktokCreatorInfo | null>)
            : null
        )
        .then((info) =>
          setCreatorInfos((current) => ({ ...current, [account.id]: info }))
        )
        .catch(() =>
          setCreatorInfos((current) => ({ ...current, [account.id]: null }))
        );
    }
  }, [selectedAccounts]);

  function buildPostBody(nextScheduledAt?: string) {
    return {
      text: text.trim(),
      platform,
      hasMedia: media.length > 0,
      accountIds: selectedAccountIds,
      targets: selectedAccountIds.map((accountId) => {
        const account = accounts.find((item) => item.id === accountId);
        const override = targetOverrides[accountId];
        if (!override) return { accountId, overrides: null };
        const content =
          account?.platform === "TIKTOK"
            ? override.title
              ? { title: override.title }
              : {}
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
      settings?: Record<string, unknown>;
    }
  ) {
    setTargetOverrides((current) => {
      const next = { ...current };
      const merged = { ...(next[accountId] ?? {}), ...patch };
      const hasText = Boolean(merged.text);
      const hasTitle = Boolean(merged.title);
      const hasSettings = Boolean(
        merged.settings && Object.keys(merged.settings).length > 0
      );
      if (!hasText && !hasTitle && !hasSettings) {
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

  function toggleAccountSelection(accountId: string, checked: boolean) {
    setSelectedAccountIds((current) =>
      checked ? [...current, accountId] : current.filter((id) => id !== accountId)
    );
    if (!checked) {
      clearTargetOverride(accountId);
      setCustomizingIds((current) => current.filter((id) => id !== accountId));
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
    const pending: DraftMedia[] = [];
    for (const file of files) {
      const validation = validateMediaInput(file.type, file.size);
      if (!validation.ok) {
        toast.add({
          title: "File not added",
          description: validation.error,
          type: "error",
        });
        continue;
      }
      pending.push({
        key: nextMediaKey(),
        file,
        previewUrl: URL.createObjectURL(file),
        kind: validation.kind,
        name: file.name,
        size: file.size,
        status: "pending",
        progress: 0,
      });
    }
    if (pending.length === 0) return;
    setSelectedAccountIds((current) =>
      current.filter(
        (id) => accounts.find((account) => account.id === id)?.platform !== "X"
      )
    );
    setMedia((prev) => {
      if (prev.length + pending.length > MAX_MEDIA) {
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

  async function uploadMediaForPost(postId: string): Promise<string[]> {
    const items = media;
    const errors: string[] = [];
    for (const item of items) {
      setMedia((prev) =>
        prev.map((m) =>
          m.key === item.key
            ? { ...m, status: "uploading", progress: 0, error: undefined }
            : m
        )
      );
      const error = await uploadFileToPost(
        postId,
        item.file,
        (percent) =>
          setMedia((prev) =>
            prev.map((m) => (m.key === item.key ? { ...m, progress: percent } : m))
          )
      );
      if (error) {
        errors.push(`${item.name}: ${error}`);
        setMedia((prev) =>
          prev.map((m) =>
            m.key === item.key ? { ...m, status: "error", error } : m
          )
        );
      } else {
        setMedia((prev) =>
          prev.map((m) => (m.key === item.key ? { ...m, status: "done" } : m))
        );
      }
    }
    return errors;
  }

  async function handleSaveDraft() {
    if (!canSave) return;
    setSaving(true);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPostBody()),
      });

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
    } catch {
      toast.add({
        title: "Failed to save draft",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
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

    setScheduling(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPostBody(scheduledIso)),
      });

      const data = await res.json();

      if (!res.ok) {
        setScheduleError(data.error || "Failed to schedule post.");
        return;
      }

      if (media.length > 0) {
        const errors = await uploadMediaForPost(data.id);
        if (errors.length > 0) {
          setScheduleError(
            `Failed to upload media: ${errors[0]}. The post was not scheduled. You can retry from the saved draft.`
          );
          setSavedId(data.id);
          return;
        }
      }

      setSavedId(data.id);
      setScheduledAt(scheduledIso);
      setScheduleMode(false);
    } catch {
      setScheduleError("Failed to schedule post. Please try again.");
    } finally {
      setScheduling(false);
    }
  }

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    setPublishResult(null);

    try {
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPostBody()),
      });

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
      const settled = await waitForPostSettled(postData.id);
      if (!settled) {
        setPublishResult({
          ok: false,
          platform,
          error:
            "Still publishing on some platforms. Open the post to watch progress.",
        });
      } else if (settled.status === "PUBLISHED") {
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
    } catch {
      setPublishResult({
        ok: false,
        platform,
        error: "Network error. Please try again.",
      });
    } finally {
      setPublishing(false);
    }
  }

  if (publishResult) {
    const resultPlatform = publishResult.platform ?? "X";
    const isThreads = resultPlatform === "THREADS";
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <h1 className="mb-6 text-2xl font-semibold">Create post</h1>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {publishResult.ok ? (
                    <CircleCheckIcon />
                  ) : (
                    <OctagonXIcon />
                  )}
                </EmptyMedia>
                <EmptyTitle>
                  {publishResult.ok
                    ? "Published successfully"
                    : "Publication failed"}
                </EmptyTitle>
                <EmptyDescription>
                  {publishResult.ok ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-flex size-4 items-center justify-center [&_svg]:size-4">
                        <PlatformIcon platform={resultPlatform} />
                      </span>
                      @{publishResult.username} · Published
                    </span>
                  ) : (
                    publishResult.error
                  )}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
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
                        setPublishResult(null);
                        setSavedId(null);
                      }}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      Try again
                    </Button>
                  )}
                  {savedId && (
                    <Button
                      size="sm"
                      onClick={() => router.push(`/posts/${savedId}`)}
                    >
                      View post
                    </Button>
                  )}
                </div>
              </EmptyContent>
            </Empty>
      </div>
    );
  }

  if (saved && savedId && scheduledAt) {    const scheduledLocal = new Date(scheduledAt);
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <h1 className="mb-6 text-2xl font-semibold">Create post</h1>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClockIcon />
                </EmptyMedia>
                <EmptyTitle>Post scheduled</EmptyTitle>
                <EmptyDescription>
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
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
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
                </div>
              </EmptyContent>
            </Empty>
      </div>
    );
  }

  if (saved && savedId) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <h1 className="mb-6 text-2xl font-semibold">Create post</h1>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleCheckIcon />
                </EmptyMedia>
                <EmptyTitle>Draft saved</EmptyTitle>
                {mediaUploadNote && (
                  <EmptyDescription>{mediaUploadNote}</EmptyDescription>
                )}
              </EmptyHeader>
              <EmptyContent>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSaved(false);
                      setSavedId(null);
                      setText("");
                      clearMedia();
                    }}
                  >
                    <PencilIcon data-icon="inline-start" />
                    Edit post
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/posts/${savedId}`)}
                  >
                    View post
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Create post</h1>
        {selectedAccountIds.length > 0 && (
          <Badge variant="secondary">
            <UsersIcon data-icon="inline-start" />
            {selectedAccountIds.length} selected
          </Badge>
        )}
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="composer-content">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="composer-content" className="text-lg font-medium">
                  Post content
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used by every selected platform unless customized
                </p>
              </div>
              <Badge variant={hasOverLimit ? "destructive" : "secondary"}>
                {charCount} chars
              </Badge>
            </div>
            <div>
              <Field data-invalid={hasOverLimit || undefined}>
                <FieldLabel htmlFor="composer-text" className="sr-only">
                  Post content
                </FieldLabel>
                <Textarea
                  id="composer-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write something..."
                  rows={5}
                  aria-invalid={hasOverLimit || undefined}
                />
                {hasOverLimit ? (
                  <FieldError>
                    Too long for{" "}
                    {previews
                      .filter((preview) => preview.overLimit)
                      .map(
                        (preview) => `${preview.label} (${preview.maxLength})`
                      )
                      .join(", ")}
                    . Shorten the text or use Customize in the preview below.
                  </FieldError>
                ) : (
                  <FieldDescription>
                    Keep it short — each platform has its own character limit.
                  </FieldDescription>
                )}
              </Field>
            </div>
          </section>

          <section aria-labelledby="composer-targets">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="composer-targets" className="text-lg font-medium">
                  Publish to
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select at least one connected account
                </p>
              </div>
              <Badge variant="secondary">
                {selectedAccountIds.length} selected
              </Badge>
            </div>
            <div className="flex flex-col gap-3">
              {accounts.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <UsersIcon />
                    </EmptyMedia>
                    <EmptyTitle>No connected accounts</EmptyTitle>
                    <EmptyDescription>
                      Connect a social account before creating a post.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <FieldSet>
                  <FieldLegend variant="label" className="sr-only">
                    Publish to
                  </FieldLegend>
                  <FieldGroup className="gap-2">
                    {accounts.map((account) => {
                      const selected = selectedAccountIds.includes(account.id);
                      const blockedByMedia =
                        media.length > 0 && account.platform === "X";
                      const disabled =
                        !account.implemented || blockedByMedia;
                      const overrideEntry = targetOverrides[account.id];
                      const customized = Boolean(
                        overrideEntry &&
                          (overrideEntry.text ||
                            overrideEntry.title ||
                            (overrideEntry.settings &&
                              Object.keys(overrideEntry.settings).length > 0))
                      );
                      return (
                        <Field
                          key={account.id}
                          orientation="horizontal"
                          data-disabled={disabled || undefined}
                        >
                          <Checkbox
                            id={`account-${account.id}`}
                            checked={selected}
                            disabled={
                              disabled || saving || publishing || scheduling
                            }
                            onCheckedChange={(checked) =>
                              toggleAccountSelection(
                                account.id,
                                checked === true
                              )
                            }
                          />
                          <FieldContent>
                            <FieldLabel htmlFor={`account-${account.id}`}>
                              {account.platform} @{account.username}
                            </FieldLabel>
                            {!account.implemented && (
                              <FieldDescription>Coming soon</FieldDescription>
                            )}
                            {account.implemented && blockedByMedia && (
                              <FieldDescription>
                                X media publishing is not available
                              </FieldDescription>
                            )}
                          </FieldContent>
                          {selected && customized && (
                            <Badge variant="secondary">Customized</Badge>
                          )}
                          {!account.implemented && (
                            <Badge variant="outline">Soon</Badge>
                          )}
                        </Field>
                      );
                    })}
                  </FieldGroup>
                </FieldSet>
              )}
              {accounts.length > 0 && selectedAccountIds.length === 0 && (
                <FieldError>Select at least one connected account.</FieldError>
              )}
              {mediaErrors.map((message) => (
                <Alert key={message} variant="destructive">
                  <TriangleAlertIcon />
                  <AlertTitle>Media not supported</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ))}
            </div>
          </section>

          <section aria-labelledby="composer-media">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="composer-media" className="text-lg font-medium">
                  Media
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  JPG, PNG, WebP or GIF images up to 10 MB; MP4 or WebM
                  videos up to 100 MB.
                </p>
              </div>
              <Badge variant="secondary">
                {media.length}/{MAX_MEDIA}
              </Badge>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start gap-3">
                {media.map((item) => (
                  <div key={item.key} className="flex flex-col gap-1.5">
                    <div className="relative size-28 overflow-hidden rounded-md border bg-muted">
                      {item.kind === "IMAGE" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.previewUrl}
                          className="size-full object-cover"
                          muted
                        />
                      )}
                      {item.status === "uploading" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/60 p-2">
                          <span className="text-xs font-medium text-white tabular-nums">
                            {item.progress}%
                          </span>
                          <Progress
                            value={item.progress}
                            aria-label={`Uploading ${item.name}`}
                            className="w-full"
                          />
                        </div>
                      )}
                      {item.status === "error" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-destructive/40">
                          <Badge variant="destructive">Failed</Badge>
                        </div>
                      )}
                      {item.status !== "uploading" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-sm"
                          onClick={() => removeMedia(item.key)}
                          aria-label={`Remove ${item.name}`}
                          className="absolute top-1.5 right-1.5 size-6 rounded-full"
                        >
                          <XIcon />
                        </Button>
                      )}
                    </div>
                    <p className="w-28 truncate text-xs text-muted-foreground">
                      {item.name} · {formatFileSize(item.size)}
                    </p>
                    {item.status === "error" && item.error && (
                      <p className="w-28 text-xs text-destructive">
                        {item.error}
                      </p>
                    )}
                  </div>
                ))}
                {media.length < MAX_MEDIA && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving || publishing || scheduling}
                    className="h-28 w-28 flex-col border-dashed"
                  >
                    <ImagePlusIcon data-icon="inline-start" />
                    Add media
                  </Button>
                )}
              </div>
              {mediaUploadNote && (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertTitle>Media upload</AlertTitle>
                  <AlertDescription>{mediaUploadNote}</AlertDescription>
                </Alert>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.m4v,.webm"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Previews</CardTitle>
              <CardDescription>
                {previews.length === 0
                  ? "Select a platform above to see its preview"
                  : `${previews.length} selected`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previews.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileTextIcon />
                    </EmptyMedia>
                    <EmptyTitle>No previews yet</EmptyTitle>
                    <EmptyDescription>
                      Select a platform above to see how your post will look.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ScrollArea className={previews.length > 3 ? "h-120" : undefined}>
                  <div className="flex flex-col gap-4">
                    {previews.map((preview) => {
                      const isCustomizing = customizingIds.includes(
                        preview.accountId
                      );
                      return (
                        <div
                          key={preview.accountId}
                          className="flex flex-col gap-3 rounded-lg border p-4"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback aria-label={preview.label}>
                                <span className="flex size-4 items-center justify-center [&_svg]:size-4">
                                  <PlatformIcon platform={preview.platform} />
                                </span>
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {userName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {preview.label} · @{preview.username}
                              </p>
                            </div>
                            {preview.customized && (
                              <Badge variant="secondary">Custom</Badge>
                            )}
                          </div>
                          <Separator />
                          {isCustomizing ? (
                            <FieldGroup className="gap-3">
                              <Field
                                data-invalid={preview.overLimit || undefined}
                              >
                                <FieldLabel
                                  htmlFor={`custom-${preview.accountId}`}
                                >
                                  {preview.platform === "TIKTOK"
                                    ? "Title / caption for TikTok"
                                    : `Text for ${preview.label}`}
                                </FieldLabel>
                                <Textarea
                                  id={`custom-${preview.accountId}`}
                                  value={
                                    (preview.platform === "TIKTOK"
                                      ? targetOverrides[preview.accountId]
                                          ?.title
                                      : targetOverrides[preview.accountId]
                                          ?.text) ?? preview.text
                                  }
                                  rows={4}
                                  placeholder={
                                    preview.platform === "TIKTOK"
                                      ? "Title / caption for TikTok"
                                      : `Text for ${preview.label}`
                                  }
                                  aria-invalid={preview.overLimit || undefined}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    updateOverride(
                                      preview.accountId,
                                      preview.platform === "TIKTOK"
                                        ? { title: value }
                                        : { text: value }
                                    );
                                  }}
                                />
                                <FieldDescription>
                                  {preview.text.length} / {preview.maxLength}
                                </FieldDescription>
                                {preview.overLimit && (
                                  <FieldError>
                                    Exceeds the {preview.maxLength} character
                                    limit for {preview.label}
                                  </FieldError>
                                )}
                              </Field>
                              {preview.platform === "TIKTOK" && (
                                <div className="flex flex-col gap-3">
                                  {(() => {
                                    const info =
                                      creatorInfos[preview.accountId];
                                    const settings =
                                      targetOverrides[preview.accountId]
                                        ?.settings ?? {};
                                    const privacyOptions =
                                      info &&
                                      info.privacyLevelOptions.length > 0
                                        ? info.privacyLevelOptions
                                        : ["SELF_ONLY"];
                                    const currentPrivacy =
                                      typeof settings.privacy_level ===
                                      "string"
                                        ? settings.privacy_level
                                        : privacyOptions[0];
                                    const setSetting = (
                                      patch: Record<string, unknown>
                                    ) =>
                                      updateOverride(preview.accountId, {
                                        settings: { ...settings, ...patch },
                                      });
                                    const allowToggle = (
                                      key:
                                        | "disable_comment"
                                        | "disable_duet"
                                        | "disable_stitch",
                                      creatorDisabled: boolean | undefined,
                                      label: string
                                    ) => (
                                      <Field
                                        orientation="horizontal"
                                        key={key}
                                        data-disabled={
                                          creatorDisabled || undefined
                                        }
                                      >
                                        <Switch
                                          id={`${preview.accountId}-${key}`}
                                          checked={
                                            settings[key] !== true &&
                                            !creatorDisabled
                                          }
                                          disabled={Boolean(creatorDisabled)}
                                          onCheckedChange={(checked) =>
                                            setSetting({
                                              [key]: !checked,
                                            })
                                          }
                                        />
                                        <FieldContent>
                                          <FieldLabel
                                            htmlFor={`${preview.accountId}-${key}`}
                                          >
                                            {label}
                                          </FieldLabel>
                                          {creatorDisabled && (
                                            <FieldDescription>
                                              Off in account privacy settings
                                            </FieldDescription>
                                          )}
                                        </FieldContent>
                                      </Field>
                                    );
                                    if (info === undefined) {
                                      return (
                                        <div className="flex flex-col gap-2">
                                          <Skeleton className="h-8 w-full" />
                                          <Skeleton className="h-4 w-2/3" />
                                        </div>
                                      );
                                    }
                                    return (
                                      <>
                                        {info ? (
                                          <>
                                            <Field>
                                              <FieldLabel
                                                htmlFor={`${preview.accountId}-privacy`}
                                              >
                                                Privacy
                                              </FieldLabel>
                                              <Select
                                                value={currentPrivacy}
                                                onValueChange={(
                                                  value: unknown
                                                ) =>
                                                  setSetting({
                                                    privacy_level:
                                                      String(value),
                                                  })
                                                }
                                              >
                                                <SelectTrigger
                                                  id={`${preview.accountId}-privacy`}
                                                  className="w-full"
                                                >
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectGroup>
                                                    {privacyOptions.map(
                                                      (option) => (
                                                        <SelectItem
                                                          key={option}
                                                          value={option}
                                                        >
                                                          {option
                                                            .replaceAll(
                                                              "_",
                                                              " "
                                                            )
                                                            .toLowerCase()
                                                            .replace(/^./, (c) =>
                                                              c.toUpperCase()
                                                            )}
                                                        </SelectItem>
                                                      )
                                                    )}
                                                  </SelectGroup>
                                                </SelectContent>
                                              </Select>
                                            </Field>
                                            {allowToggle(
                                              "disable_comment",
                                              info.commentDisabled,
                                              "Allow comments"
                                            )}
                                            {allowToggle(
                                              "disable_duet",
                                              info.duetDisabled,
                                              "Allow Duet"
                                            )}
                                            {allowToggle(
                                              "disable_stitch",
                                              info.stitchDisabled,
                                              "Allow Stitch"
                                            )}
                                            <Field>
                                              <FieldLabel
                                                htmlFor={`${preview.accountId}-cover`}
                                              >
                                                Cover timestamp (ms, optional)
                                              </FieldLabel>
                                              <input
                                                id={`${preview.accountId}-cover`}
                                                type="number"
                                                min={0}
                                                step={1000}
                                                value={
                                                  typeof settings.video_cover_timestamp_ms ===
                                                  "number"
                                                    ? String(
                                                        settings.video_cover_timestamp_ms
                                                      )
                                                    : ""
                                                }
                                                onChange={(event) => {
                                                  const raw =
                                                    event.target.value;
                                                  setSetting({
                                                    video_cover_timestamp_ms:
                                                      raw === ""
                                                        ? undefined
                                                        : Math.max(
                                                            0,
                                                            Math.floor(
                                                              Number(raw) || 0
                                                            )
                                                          ),
                                                  });
                                                }}
                                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                              />
                                            </Field>
                                            {info.maxVideoPostDurationSec >
                                              0 && (
                                              <FieldDescription>
                                                Max video length for this
                                                account:{" "}
                                                {
                                                  info.maxVideoPostDurationSec
                                                }
                                                s
                                              </FieldDescription>
                                            )}
                                          </>
                                        ) : (
                                          <Alert>
                                            <TriangleAlertIcon />
                                            <AlertTitle>
                                              TikTok options unavailable
                                            </AlertTitle>
                                            <AlertDescription>
                                              TikTok posting options unavailable
                                              (default: private post). Retry or
                                              reconnect TikTok.
                                            </AlertDescription>
                                          </Alert>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                              <div className="flex items-center justify-end gap-2">
                                {targetOverrides[preview.accountId] && (
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    onClick={() =>
                                      clearTargetOverride(preview.accountId)
                                    }
                                  >
                                    Use global
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setCustomizingIds((current) =>
                                      current.filter(
                                        (id) => id !== preview.accountId
                                      )
                                    )
                                  }
                                >
                                  Done
                                </Button>
                              </div>
                            </FieldGroup>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {media.length > 0 && (
                                <div className="flex gap-1.5">
                                  {media.slice(0, 4).map((item) =>
                                    item.kind === "IMAGE" ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        key={item.key}
                                        src={item.previewUrl}
                                        alt={item.name}
                                        className="size-10 rounded border object-cover"
                                      />
                                    ) : (
                                      <video
                                        key={item.key}
                                        src={item.previewUrl}
                                        muted
                                        className="size-10 rounded border object-cover"
                                      />
                                    )
                                  )}
                                </div>
                              )}
                              <p className="text-sm break-words whitespace-pre-wrap">
                                {preview.text || (
                                  <span className="text-muted-foreground">
                                    Your post will appear here...
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center justify-between gap-2">
                                <FieldDescription>
                                  {preview.text.length} / {preview.maxLength}
                                </FieldDescription>
                                {preview.customized && (
                                  <Badge variant="secondary">custom text</Badge>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={saving || publishing || scheduling}
                                  onClick={() =>
                                    setCustomizingIds((current) => [
                                      ...current,
                                      preview.accountId,
                                    ])
                                  }
                                >
                                  <PencilIcon data-icon="inline-start" />
                                  {preview.customized
                                    ? `Edit for ${preview.label}`
                                    : "Customize"}
                                </Button>
                              </div>
                              {preview.overLimit && (
                                <FieldError>
                                  Exceeds the {preview.maxLength} character
                                  limit for {preview.label}. Click Customize to
                                  shorten it just for this platform.
                                </FieldError>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Publish</CardTitle>
              <CardDescription>
                Save a draft, schedule it, or publish right away.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {schedulingForX && scheduleMode && (
                <Alert variant="destructive">
                  <TriangleAlertIcon />
                  <AlertTitle>Scheduling unavailable</AlertTitle>
                  <AlertDescription>
                    Scheduling for X is not available yet. Choose Threads to
                    schedule a post.
                  </AlertDescription>
                </Alert>
              )}
              {schedulingForX && !scheduleMode && (
                <FieldDescription>
                  Scheduling is available for Threads. Publish to X is
                  available now.
                </FieldDescription>
              )}
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!canSave}
                  className="flex-1"
                >
                  {saving && <Spinner data-icon="inline-start" />}
                  <SaveIcon data-icon="inline-start" />
                  {saving ? "Saving..." : "Save draft"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (schedulingForX) return;
                    setScheduleMode(true);
                    setScheduleError(null);
                  }}
                  disabled={schedulingForX || scheduling}
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
                  onClick={handlePublish}
                  disabled={!canPublish}
                  className="flex-1"
                >
                  {publishing && <Spinner data-icon="inline-start" />}
                  {!publishing && <SendIcon data-icon="inline-start" />}
                  {publishing ? "Publishing..." : "Publish now"}
                </Button>
              </div>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
              Publishing uploads media first, then publishes to every selected
              platform.
            </CardFooter>
          </Card>
        </div>
      </div>

      <Dialog
        open={scheduleMode && !schedulingForX}
        onOpenChange={(open) => {
          if (!open) {
            setScheduleMode(false);
            setScheduleError(null);
          } else {
            setScheduleMode(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule post</DialogTitle>
            <DialogDescription>
              One scheduled time for the whole post — it applies to all
              selected platforms, which publish together.
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
                  min={toLocalInputValue(new Date())}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="schedule-time">Time</FieldLabel>
                <input
                  id="schedule-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
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
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setScheduleMode(false);
                setScheduleError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={!canSave || scheduling}
            >
              {scheduling && <Spinner data-icon="inline-start" />}
              <CalendarClockIcon data-icon="inline-start" />
              {scheduling ? "Scheduling..." : "Confirm schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
