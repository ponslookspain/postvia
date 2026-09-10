"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X_POST_CHAR_LIMIT,
  THREADS_POST_CHAR_LIMIT,
  threadsPostUrl,
  formatPlatformName,
} from "@/lib/utils";

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
    platform: string;
    externalPostId?: string | null;
    status: string;
    errorMessage?: string | null;
  }[];
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
    try {
      const res = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        const now = new Date().toISOString();
        setPost((prev) => ({
          ...prev,
          status: "PUBLISHED",
          publishedAt: now,
          errorMessage: null,
          targets: prev.targets.map((t) =>
            t.platform === platform
              ? {
                  ...t,
                  status: "PUBLISHED",
                  externalPostId: data.externalPostId,
                  publishedAt: now,
                  errorMessage: null,
                }
              : t
          ),
        }));
      } else {
        setPost((prev) => ({
          ...prev,
          status: "FAILED",
          errorMessage: data.error || "Publication failed",
          targets: prev.targets.map((t) =>
            t.platform === platform
              ? { ...t, status: "FAILED", errorMessage: data.error }
              : t
          ),
        }));
      }
    } catch {
      setPost((prev) => ({
        ...prev,
        status: "FAILED",
        errorMessage: "Network error",
      }));
    } finally {
      setPublishing(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/posts/${id}/retry`, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        const now = new Date().toISOString();
        setPost((prev) => ({
          ...prev,
          status: "PUBLISHED",
          publishedAt: now,
          errorMessage: null,
          targets: prev.targets.map((t) =>
            t.platform === platform
              ? {
                  ...t,
                  status: "PUBLISHED",
                  externalPostId: data.externalPostId,
                  publishedAt: now,
                  errorMessage: null,
                }
              : t
          ),
        }));
      } else {
        setPost((prev) => ({
          ...prev,
          status: "FAILED",
          errorMessage: data.error || "Publication failed",
          targets: prev.targets.map((t) =>
            t.platform === platform
              ? { ...t, status: "FAILED", errorMessage: data.error }
              : t
          ),
        }));
      }
    } catch {
      setPost((prev) => ({
        ...prev,
        status: "FAILED",
        errorMessage: "Network error",
      }));
    } finally {
      setRetrying(false);
    }
  }

  const statusColors: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SCHEDULED: "bg-amber-50 text-amber-700",
    PUBLISHING: "bg-blue-50 text-blue-700",
    PUBLISHED: "bg-green-50 text-green-700",
    FAILED: "bg-red-50 text-red-700",
  };

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
                  onClick={handleRetry}
                  disabled={retrying}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {retrying ? "Retrying..." : "Retry"}
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
