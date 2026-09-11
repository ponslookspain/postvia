"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X_POST_CHAR_LIMIT,
  THREADS_POST_CHAR_LIMIT,
  threadsPostUrl,
  formatPlatformName,
} from "@/lib/utils";
import {
  localInputToIso,
  localDateInputValue,
  localTimeInputValue,
} from "@/lib/schedule";

interface Post {
  id: string;
  text: string;
  status: string;
  errorMessage?: string | null;
  username?: string | null;
  createdAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  targets: {
    id: string;
    platform: string;
    socialAccount?: { username: string } | null;
    externalPostId?: string | null;
    status: string;
    errorMessage?: string | null;
  }[];
  media: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    type: "IMAGE" | "VIDEO";
    createdAt: string;
  }[];
}

const PUBLISH_POLL_MS = 2000;
const PUBLISH_POLL_TIMEOUT_MS = 330_000;

// Publish/retry respond 202 while the work continues server-side.
// Poll the real per-target statuses from the DB instead of assuming success.
async function pollUntilSettled(
  postId: string,
  applySnapshot: (data: Partial<Post>) => void
): Promise<void> {
  const deadline = Date.now() + PUBLISH_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, PUBLISH_POLL_MS));
    try {
      const res = await fetch(`/api/posts/${postId}`);
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<Post>;
      applySnapshot(data);
      if (data.status && data.status !== "PUBLISHING") return;
    } catch {
      // transient error: keep polling until the deadline
    }
  }
}

async function startBackgroundAction(
  path: string,
  body?: unknown
): Promise<{ started: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 202 || res.ok) return { started: true };
    const data = await res.json().catch(() => null);
    return {
      started: false,
      error:
        typeof data?.error === "string" ? data.error : "Publication failed",
    };
  } catch {
    return { started: false, error: "Network error" };
  }
}

export default function PostDetailPage({
  params,
  post: initialPost,
}: {
  params: Promise<{ id: string }>;
  post: Post;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialPost.text);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const target = post.targets[0];
  const platform = target?.platform ?? "X";
  const externalPostId = target?.externalPostId;
  const charLimit =
    platform === "THREADS" ? THREADS_POST_CHAR_LIMIT : X_POST_CHAR_LIMIT;

  const charCount = text.length;
  const isOverLimit = charCount > charLimit;
  const canSave = text.trim().length > 0 && !isOverLimit && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setPost((prev) => ({ ...prev, text: data.text }));
      setEditing(false);
    } catch {
      alert("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this post?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/posts");
    } catch {
      alert("Failed to delete post.");
      setDeleting(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    const result = await startBackgroundAction(`/api/posts/${id}/publish`);
    if (!result.started) {
      setPost((prev) => ({ ...prev, errorMessage: result.error }));
    } else {
      await pollUntilSettled(id, (data) =>
        setPost((prev) => ({ ...prev, ...data }))
      );
    }
    setPublishing(false);
  }

  async function handleDeleteMedia(mediaId: string) {
    setDeletingMediaId(mediaId);
    try {
      const res = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete media");
      setPost((prev) => ({
        ...prev,
        media: prev.media.filter((m) => m.id !== mediaId),
      }));
    } catch {
      alert("Failed to delete media.");
    } finally {
      setDeletingMediaId(null);
    }
  }

  async function handleRetry(targetId?: string) {
    setRetrying(true);
    const result = await startBackgroundAction(
      `/api/posts/${id}/retry`,
      targetId ? { targetId } : {}
    );
    if (!result.started) {
      setPost((prev) => ({ ...prev, errorMessage: result.error }));
    } else {
      await pollUntilSettled(id, (data) =>
        setPost((prev) => ({ ...prev, ...data }))
      );
    }
    setRetrying(false);
  }

  function openReschedule() {
    const base = post.scheduledAt
      ? new Date(post.scheduledAt)
      : new Date(Date.now() + 60 * 60 * 1000);
    setRescheduleDate(localDateInputValue(base));
    setRescheduleTime(localTimeInputValue(base));
    setRescheduleError(null);
    setRescheduleOpen(true);
  }

  async function sendScheduledAt(value: string | null) {
    setRescheduling(true);
    setRescheduleError(null);
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRescheduleError(data.error || "Failed to reschedule.");
        return false;
      }
      setPost((prev) => ({ ...prev, ...data }));
      setRescheduleOpen(false);
      return true;
    } catch {
      setRescheduleError("Network error. Please try again.");
      return false;
    } finally {
      setRescheduling(false);
    }
  }

  async function handleRescheduleSave() {
    const iso = localInputToIso(rescheduleDate, rescheduleTime);
    if (!iso) {
      setRescheduleError("Please choose a valid date and time.");
      return;
    }
    await sendScheduledAt(iso);
  }

  async function handleUnschedule() {
    await sendScheduledAt(null);
  }

  const statusColors: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SCHEDULED: "bg-amber-50 text-amber-700",
    PUBLISHING: "bg-blue-50 text-blue-700",
    PUBLISHED: "bg-green-50 text-green-700",
    PARTIALLY_PUBLISHED: "bg-amber-50 text-amber-700",
    FAILED: "bg-red-50 text-red-700",
  };

  function targetPostUrl(targetItem: Post["targets"][number]): string | null {
    if (!targetItem.externalPostId) return null;
    const handle = targetItem.socialAccount?.username;
    if (targetItem.platform === "THREADS") {
      return threadsPostUrl(handle ?? post.username ?? "", targetItem.externalPostId);
    }
    if (targetItem.platform === "X") {
      return `https://x.com/i/status/${targetItem.externalPostId}`;
    }
    if (targetItem.platform === "TIKTOK" && handle) {
      return `https://www.tiktok.com/@${handle}/video/${targetItem.externalPostId}`;
    }
    return null;
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-8">Post</h1>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Text</label>
          {editing ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="w-full border border-border rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  Platform: {formatPlatformName(platform)}
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
                  Post exceeds the {charLimit} character limit
                </p>
              )}
            </>
          ) : (
            <div className="border border-border rounded-lg p-4">
              <p className="text-sm whitespace-pre-wrap break-words">
                {post.text}
              </p>
            </div>
          )}
        </div>

        {post.media.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2">Media</label>
            <div className="flex flex-wrap gap-3">
              {post.media.map((item) => (
                <div key={item.id} className="relative w-40 h-40">
                  <div className="w-40 h-40 rounded-md border border-border overflow-hidden bg-muted">
                    {item.type === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/media/${item.id}`}
                        alt={item.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={`/api/media/${item.id}`}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteMedia(item.id)}
                    disabled={deletingMediaId === item.id}
                    aria-label={`Remove ${item.filename}`}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-foreground text-primary-foreground flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40"
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
                  <p className="text-xs text-muted-foreground mt-1 w-40 truncate">
                    {item.filename}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Platform</label>
            <p className="text-sm">{formatPlatformName(platform)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <span
              className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${
                statusColors[post.status] ?? ""
              }`}
            >
              {post.status.charAt(0) + post.status.slice(1).toLowerCase()}
            </span>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Created</label>
            <p className="text-sm">
              {new Date(post.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {post.scheduledAt && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Scheduled for
              </label>
              <p className="text-sm text-amber-700">
                {new Date(post.scheduledAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Published</label>
            <p className="text-sm text-muted-foreground">
              {post.publishedAt
                ? new Date(post.publishedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </p>
          </div>
          {externalPostId && (
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                External ID
              </label>
              <p className="text-sm text-muted-foreground font-mono">
                {externalPostId}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Publishing targets</label>
          <div className="space-y-2">
            {post.targets.map((targetItem) => (
              <div
                key={targetItem.id}
                className="flex items-center justify-between border border-border rounded-md px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatPlatformName(targetItem.platform)}
                    {targetItem.socialAccount?.username
                      ? ` @${targetItem.socialAccount.username}`
                      : ""}
                  </p>
                  {targetItem.errorMessage && (
                    <p className="text-xs text-red-600">{targetItem.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {targetItem.status === "PUBLISHED" && targetPostUrl(targetItem) && (
                    <a
                      href={targetPostUrl(targetItem)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline hover:text-foreground text-muted-foreground"
                    >
                      View
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {targetItem.status.toLowerCase()}
                  </span>
                  {targetItem.status === "FAILED" && (
                    <button
                      onClick={() => handleRetry(targetItem.id)}
                      disabled={retrying}
                      className="px-3 py-1 text-xs border border-border rounded-md hover:bg-muted disabled:opacity-40"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {rescheduleOpen &&
          (post.status === "DRAFT" || post.status === "SCHEDULED") &&
          platform === "THREADS" && (
            <div className="border border-border rounded-lg p-5">
              <label className="block text-sm font-medium mb-3">
                {post.status === "SCHEDULED"
                  ? "Change scheduled time"
                  : "Schedule this post"}
              </label>
              <div className="flex items-start gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    min={localDateInputValue(new Date())}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20 focus:border-foreground/30"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Times are interpreted in your local timezone (
                {Intl.DateTimeFormat().resolvedOptions().timeZone}).
              </p>
              {rescheduleError && (
                <p className="text-xs text-red-600 mt-3">{rescheduleError}</p>
              )}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleRescheduleSave}
                  disabled={rescheduling || !rescheduleDate || !rescheduleTime}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {rescheduling ? "Saving..." : "Save time"}
                </button>
                {post.status === "SCHEDULED" && (
                  <button
                    onClick={handleUnschedule}
                    disabled={rescheduling}
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    Remove schedule
                  </button>
                )}
                <button
                  onClick={() => setRescheduleOpen(false)}
                  disabled={rescheduling}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        {post.status === "FAILED" && post.errorMessage && (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50">
            <p className="text-sm font-medium text-red-700 mb-1">
              Publication failed
            </p>
            <p className="text-sm text-red-600">{post.errorMessage}</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setText(post.text);
                }}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {post.status === "DRAFT" && (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {publishing ? "Publishing..." : "Publish now"}
                  </button>
                </>
              )}

              {post.status === "PUBLISHED" && externalPostId && (
                <a
                  href={
                    platform === "THREADS"
                      ? threadsPostUrl(post.username ?? "", externalPostId)
                      : `https://x.com/i/status/${externalPostId}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                >
                  View on {platform === "THREADS" ? "Threads" : "X"}
                </a>
              )}

              {post.status === "FAILED" && (
                <button
                  onClick={() => handleRetry()}
                  disabled={retrying}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {retrying ? "Retrying..." : "Retry"}
                </button>
              )}

              {(post.status === "DRAFT" ||
                post.status === "SCHEDULED") &&
                platform === "THREADS" && (
                  <button
                    onClick={openReschedule}
                    disabled={rescheduling || publishing}
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    {post.status === "SCHEDULED" ? "Reschedule" : "Schedule"}
                  </button>
                )}

              {(post.status === "DRAFT" ||
                post.status === "SCHEDULED" ||
                post.status === "FAILED") && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
