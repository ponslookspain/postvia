"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { threadsPostUrl, isFutureIso } from "@/lib/utils";
import { validateMediaInput } from "@/lib/media";
import {
  buildComposerPreviews,
  buildComposerMediaErrors,
} from "@/lib/composer-previews";

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
        alert(validation.error);
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
        alert(`You can attach up to ${MAX_MEDIA} files per post.`);
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
      alert("Failed to save draft. Please try again.");
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
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-8">Create post</h1>
        <div className="border border-border rounded-lg p-8 text-center">
          {publishResult.ok ? (
            <>
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">Published successfully</p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
                {isThreads ? (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="8.5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="15" cy="9" r="0.75" fill="currentColor" stroke="none" />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                )}
                @{publishResult.username} · Published
              </div>
              <div className="flex items-center justify-center gap-3">
                {publishResult.externalPostId && publishResult.username && (
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
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                  >
                    View on {isThreads ? "Threads" : "X"}
                  </a>
                )}
                <button
                  onClick={() => router.push(`/posts/${savedId}`)}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                >
                  View post
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">Publication failed</p>
              <p className="text-sm text-muted-foreground mb-6">
                {publishResult.error}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setPublishResult(null);
                    setSavedId(null);
                  }}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                >
                  Try again
                </button>
                {savedId && (
                  <button
                    onClick={() => router.push(`/posts/${savedId}`)}
                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                  >
                    View post
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (saved && savedId && scheduledAt) {
    const scheduledLocal = new Date(scheduledAt);
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-8">Create post</h1>
        <div className="border border-border rounded-lg p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium mb-2">Post scheduled</p>
          <p className="text-sm text-muted-foreground mb-6">
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
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setSaved(false);
                setScheduledAt(null);
                setText("");
                setScheduleDate("");
                setScheduleTime("");
                setScheduleMode(false);
                clearMedia();
              }}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Create another
            </button>
            <button
              onClick={() => router.push(`/posts/${savedId}`)}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
            >
              View post
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (saved && savedId) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-8">Create post</h1>
        <div className="border border-border rounded-lg p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-lg font-medium mb-6">Draft saved</p>
          {mediaUploadNote && (
            <p className="text-sm text-amber-600 mb-6 mx-auto max-w-md">
              {mediaUploadNote}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setSaved(false);
                setSavedId(null);
                setText("");
                clearMedia();
              }}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Edit post
            </button>
            <button
              onClick={() => router.push(`/posts/${savedId}`)}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
            >
              View post
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-8">Create post</h1>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Post content
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write something..."
            rows={5}
            className="w-full border border-border rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30 placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              Used by every selected platform unless customized
            </span>
            <span
              className={`text-xs font-mono ${
                hasOverLimit
                  ? "text-red-600 font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {charCount} chars
            </span>
          </div>
          {hasOverLimit && (
            <p className="text-xs text-red-600 mt-1">
              Too long for{" "}
              {previews
                .filter((preview) => preview.overLimit)
                .map((preview) => `${preview.label} (${preview.maxLength})`)
                .join(", ")}
              . Shorten the text or use Customize in the preview below.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Publish to</label>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Connect a social account before creating a post.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                const selected = selectedAccountIds.includes(account.id);
                const blockedByMedia = media.length > 0 && account.platform === "X";
                const disabled = !account.implemented || blockedByMedia;
                const overrideEntry = targetOverrides[account.id];
                const customized = Boolean(
                  overrideEntry &&
                    (overrideEntry.text ||
                      overrideEntry.title ||
                      (overrideEntry.settings &&
                        Object.keys(overrideEntry.settings).length > 0))
                );
                return (
                  <div key={account.id} className="border border-border rounded-md p-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled || saving || publishing || scheduling}
                        onChange={(event) =>
                          toggleAccountSelection(account.id, event.target.checked)
                        }
                      />
                      <span className="text-sm font-medium">
                        {account.platform} @{account.username}
                      </span>
                      {selected && customized && (
                        <span className="text-xs text-amber-700">
                          Customized
                        </span>
                      )}
                      {!account.implemented && (
                        <span className="text-xs text-muted-foreground">Soon</span>
                      )}
                      {blockedByMedia && (
                        <span className="text-xs text-red-600">
                          X media publishing is not available
                        </span>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
          {selectedAccountIds.length === 0 && (
            <p className="text-xs text-red-600 mt-2">
              Select at least one connected account.
            </p>
          )}
          {mediaErrors.map((message) => (
            <p key={message} className="text-xs text-red-600 mt-2">
              {message}
            </p>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Media</label>
          <div className="flex flex-wrap items-start gap-3">
            {media.map((item) => (
              <div key={item.key}>
                <div className="relative w-28 h-28 rounded-md border border-border overflow-hidden bg-muted">
                  {item.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={item.previewUrl}
                      className="w-full h-full object-cover"
                      muted
                    />
                  )}
                  {item.status === "uploading" && (
                    <div className="absolute inset-0 bg-foreground/60 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-white">
                        {item.progress}%
                      </span>
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 bg-red-600/40 flex items-center justify-center">
                      <span className="text-xs font-medium text-white">
                        Failed
                      </span>
                    </div>
                  )}
                  {item.status !== "uploading" && (
                    <button
                      type="button"
                      onClick={() => removeMedia(item.key)}
                      aria-label={`Remove ${item.name}`}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-foreground text-primary-foreground flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 w-28 truncate">
                  {item.name} · {formatFileSize(item.size)}
                </p>
              </div>
            ))}
            {media.length < MAX_MEDIA && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || publishing || scheduling}
                className="w-28 h-28 rounded-md border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                <svg
                  className="w-5 h-5 mb-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-xs">Add media</span>
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            JPG, PNG, WebP or GIF images up to 10 MB; MP4 or WebM videos up to
            100 MB.
          </p>
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

        {scheduleMode && !schedulingForX && (
          <div className="border border-border rounded-lg p-5">
            <label className="block text-sm font-medium mb-3">
              Schedule date and time
            </label>
            <p className="text-xs text-muted-foreground mb-3 -mt-1">
              One scheduled time for the whole post — it applies to all
              selected platforms, which publish together.
            </p>
            <div className="flex items-start gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  min={toLocalInputValue(new Date())}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30"
                />
              </div>
            </div>
            {scheduledIso && (
              <p className="text-xs text-muted-foreground mt-3">
                Will be published on{" "}
                {new Date(scheduledIso).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                — this schedule applies to all selected platforms.
              </p>
            )}
            {scheduleError && (
              <p className="text-xs text-red-600 mt-3">{scheduleError}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">
            Previews
            <span className="ml-2 font-normal text-muted-foreground">
              {previews.length === 0
                ? "Select a platform above to see its preview"
                : `${previews.length} selected`}
            </span>
          </label>
          {previews.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {previews.map((preview) => {
                const isCustomizing = customizingIds.includes(preview.accountId);
                return (
                  <div
                    key={preview.accountId}
                    className="border border-border rounded-lg p-4"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-foreground text-primary-foreground flex items-center justify-center">
                        {preview.platform === "THREADS" ? (
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <circle cx="12" cy="12" r="8.5" />
                            <circle cx="12" cy="12" r="4" />
                            <circle
                              cx="15"
                              cy="9"
                              r="0.75"
                              fill="currentColor"
                              stroke="none"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {userName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {preview.label} · @{preview.username}
                        </p>
                      </div>
                    </div>
                    {isCustomizing ? (
                      <div>
                        <textarea
                          value={
                            (preview.platform === "TIKTOK"
                              ? targetOverrides[preview.accountId]?.title
                              : targetOverrides[preview.accountId]?.text) ??
                            preview.text
                          }
                          rows={4}
                          placeholder={
                            preview.platform === "TIKTOK"
                              ? "Title / caption for TikTok"
                              : `Text for ${preview.label}`
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            updateOverride(
                              preview.accountId,
                              preview.platform === "TIKTOK"
                                ? { title: value }
                                : { text: value }
                            );
                          }}
                          className="w-full border border-border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30"
                        />
                        {preview.platform === "TIKTOK" && (
                          <div className="mt-3 space-y-2">
                            {(() => {
                              const info = creatorInfos[preview.accountId];
                              const settings =
                                targetOverrides[preview.accountId]?.settings ??
                                {};
                              const privacyOptions =
                                info && info.privacyLevelOptions.length > 0
                                  ? info.privacyLevelOptions
                                  : ["SELF_ONLY"];
                              const currentPrivacy =
                                typeof settings.privacy_level === "string"
                                  ? settings.privacy_level
                                  : privacyOptions[0];
                              const setSetting = (
                                patch: Record<string, unknown>
                              ) =>
                                updateOverride(preview.accountId, {
                                  settings: { ...settings, ...patch },
                                });
                              const allowToggle = (
                                key: "disable_comment" | "disable_duet" | "disable_stitch",
                                creatorDisabled: boolean | undefined,
                                label: string
                              ) => (
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={
                                      settings[key] !== true &&
                                      !creatorDisabled
                                    }
                                    disabled={Boolean(creatorDisabled)}
                                    onChange={(event) =>
                                      setSetting({
                                        [key]: !event.target.checked,
                                      })
                                    }
                                  />
                                  {label}
                                  {creatorDisabled && (
                                    <span className="text-muted-foreground">
                                      (off in account privacy settings)
                                    </span>
                                  )}
                                </label>
                              );
                              return (
                                <>
                                  {info ? (
                                    <>
                                      <label className="block text-xs font-medium text-muted-foreground">
                                        Privacy
                                        <select
                                          value={currentPrivacy}
                                          onChange={(event) =>
                                            setSetting({
                                              privacy_level: event.target.value,
                                            })
                                          }
                                          className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                                        >
                                          {privacyOptions.map((option) => (
                                            <option key={option} value={option}>
                                              {option
                                                .replaceAll("_", " ")
                                                .toLowerCase()
                                                .replace(/^./, (c) =>
                                                  c.toUpperCase()
                                                )}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
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
                                      <label className="block text-xs font-medium text-muted-foreground">
                                        Cover timestamp (ms, optional)
                                        <input
                                          type="number"
                                          min={0}
                                          step={1000}
                                          value={
                                            typeof settings.video_cover_timestamp_ms ===
                                            "number"
                                              ? String(settings.video_cover_timestamp_ms)
                                              : ""
                                          }
                                          onChange={(event) => {
                                            const raw = event.target.value;
                                            setSetting({
                                              video_cover_timestamp_ms:
                                                raw === ""
                                                  ? undefined
                                                  : Math.max(0, Math.floor(Number(raw) || 0)),
                                            });
                                          }}
                                          className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      {info.maxVideoPostDurationSec > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                          Max video length for this account:{" "}
                                          {info.maxVideoPostDurationSec}s
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-amber-700">
                                      TikTok posting options unavailable (default:
                                      private post). Retry or reconnect TikTok.
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span
                            className={`text-xs font-mono ${
                              preview.overLimit
                                ? "text-red-600 font-medium"
                                : "text-muted-foreground"
                            }`}
                          >
                            {preview.text.length} / {preview.maxLength}
                          </span>
                          <div className="flex items-center gap-3">
                            {targetOverrides[preview.accountId] && (
                              <button
                                type="button"
                                onClick={() =>
                                  clearTargetOverride(preview.accountId)
                                }
                                className="text-xs text-muted-foreground underline hover:text-foreground"
                              >
                                Use global
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setCustomizingIds((current) =>
                                  current.filter(
                                    (id) => id !== preview.accountId
                                  )
                                )
                              }
                              className="text-xs font-medium"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                        {preview.overLimit && (
                          <p className="text-xs text-red-600 mt-1">
                            Exceeds the {preview.maxLength} character limit for{" "}
                            {preview.label}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        {media.length > 0 && (
                          <div className="flex gap-1.5 mb-2">
                            {media.slice(0, 4).map((item) =>
                              item.kind === "IMAGE" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={item.key}
                                  src={item.previewUrl}
                                  alt={item.name}
                                  className="w-10 h-10 rounded object-cover border border-border"
                                />
                              ) : (
                                <video
                                  key={item.key}
                                  src={item.previewUrl}
                                  muted
                                  className="w-10 h-10 rounded object-cover border border-border"
                                />
                              )
                            )}
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {preview.text || (
                            <span className="text-muted-foreground">
                              Your post will appear here...
                            </span>
                          )}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          <span
                            className={`text-xs font-mono ${
                              preview.overLimit
                                ? "text-red-600 font-medium"
                                : "text-muted-foreground"
                            }`}
                          >
                            {preview.text.length} / {preview.maxLength}
                            {preview.customized && (
                              <span className="ml-2 text-amber-700">
                                custom text
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomizingIds((current) => [
                                ...current,
                                preview.accountId,
                              ])
                            }
                            disabled={saving || publishing || scheduling}
                            className="px-2 py-1 text-xs border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
                          >
                            {preview.customized
                              ? `Edit for ${preview.label}`
                              : "Customize"}
                          </button>
                        </div>
                        {preview.overLimit && (
                          <p className="text-xs text-red-600 mt-1">
                            Exceeds the {preview.maxLength} character limit for{" "}
                            {preview.label}. Click Customize to shorten it just
                            for this platform.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {schedulingForX && scheduleMode && (
            <p className="text-xs text-amber-600">
              Scheduling for X is not available yet. Choose Threads to schedule
              a post.
            </p>
          )}
          {schedulingForX && !scheduleMode && (
            <p className="text-xs text-muted-foreground">
              Scheduling is available for Threads. Publish to X is available
              now.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={!canSave}
              className="px-5 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save draft"}
            </button>
            <button
              onClick={() => {
                if (schedulingForX) return;
                setScheduleMode((v) => !v);
                setScheduleError(null);
              }}
              disabled={schedulingForX || scheduling}
              title={
                schedulingForX
                  ? "Scheduling for X is not available yet. Use Threads."
                  : "Schedule this post"
              }
              className={`px-5 py-2.5 text-sm font-medium border rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                scheduleMode
                  ? "bg-foreground text-primary-foreground border-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {scheduling ? "Scheduling..." : "Schedule"}
            </button>
            <button
              onClick={handlePublish}
              disabled={!canPublish}
              className="px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {publishing ? "Publishing..." : "Publish now"}
            </button>
          </div>

          {scheduleMode && !schedulingForX && (
            <button
              onClick={handleSchedule}
              disabled={!canSave || scheduling}
              className="px-5 py-2.5 text-sm font-medium bg-amber-500 text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed self-start"
            >
              Confirm schedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
