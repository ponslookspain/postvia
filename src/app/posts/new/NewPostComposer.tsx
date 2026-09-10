"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X_POST_CHAR_LIMIT,
  THREADS_POST_CHAR_LIMIT,
  threadsPostUrl,
  isFutureIso,
} from "@/lib/utils";
import { validateMediaInput } from "@/lib/media";

type Platform = "X" | "THREADS";

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

function uploadFileToPost(
  postId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(null);
        return;
      }
      let message = "Upload failed";
      try {
        const data = JSON.parse(xhr.responseText);
        if (typeof data?.error === "string") message = data.error;
      } catch {
        // fall back to generic message
      }
      resolve(message);
    };
    xhr.onerror = () => resolve("Network error. Please try again.");
    const form = new FormData();
    form.append("postId", postId);
    form.append("file", file);
    xhr.send(form);
  });
}

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: "X", label: "X" },
  { value: "THREADS", label: "Threads" },
];

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

export default function NewPostComposer({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [mediaUploadNote, setMediaUploadNote] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("THREADS");
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

  const charLimit =
    platform === "THREADS" ? THREADS_POST_CHAR_LIMIT : X_POST_CHAR_LIMIT;
  const charCount = text.length;
  const isOverLimit = charCount > charLimit;
  const canSave = text.trim().length > 0 && !isOverLimit && !saving;
  const canPublish =
    text.trim().length > 0 && !isOverLimit && !publishing && !saving;
  const schedulingForX = platform === "X";

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
        body: JSON.stringify({ text: text.trim(), platform }),
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
        body: JSON.stringify({
          text: text.trim(),
          platform,
          scheduledAt: scheduledIso,
        }),
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
        body: JSON.stringify({ text: text.trim(), platform }),
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

      const result = await publishRes.json();

      if (publishRes.ok) {
        setPublishResult({
          ok: true,
          platform: result.platform || platform,
          externalPostId: result.externalPostId,
          username: result.username,
        });
        setSavedId(postData.id);
      } else {
        setPublishResult({
          ok: false,
          platform,
          error: result.error || "Publication failed",
        });
        setSavedId(postData.id);
      }
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
            What do you want to publish?
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
              Platform: {platform === "THREADS" ? "Threads" : "X (Twitter)"}
            </span>
            <span
              className={`text-xs font-mono ${
                isOverLimit
                  ? "text-red-600 font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {charCount} / {charLimit}
            </span>
          </div>
          {isOverLimit && (
            <p className="text-xs text-red-600 mt-1">
              Post exceeds the {charLimit} character limit for{" "}
              {platform === "THREADS" ? "Threads" : "X"}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Platform</label>
          <div className="flex items-center gap-2">
            {PLATFORM_OPTIONS.map((option) => {
              const active = platform === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPlatform(option.value);
                    setScheduleMode(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-foreground text-primary-foreground border-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
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
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
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
                })}
              </p>
            )}
            {scheduleError && (
              <p className="text-xs text-red-600 mt-3">{scheduleError}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Preview</label>
          <div className="border border-border rounded-lg p-5 max-w-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-foreground text-primary-foreground flex items-center justify-center">
                {platform === "THREADS" ? (
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
                    <circle cx="15" cy="9" r="0.75" fill="currentColor" stroke="none" />
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
              <div>
                <p className="text-sm font-semibold">{userName}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">
              {text || (
                <span className="text-muted-foreground">
                  Your post will appear here...
                </span>
              )}
            </p>
          </div>
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