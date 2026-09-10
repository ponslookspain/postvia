"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X_POST_CHAR_LIMIT } from "@/lib/utils";

type PublishResult = {
  ok: boolean;
  externalPostId?: string;
  username?: string;
  error?: string;
};

export default function NewPostPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null
  );

  const charCount = text.length;
  const isOverLimit = charCount > X_POST_CHAR_LIMIT;
  const canSave = text.trim().length > 0 && !isOverLimit && !saving;
  const canPublish =
    text.trim().length > 0 && !isOverLimit && !publishing && !saving;

  async function handleSaveDraft() {
    if (!canSave) return;
    setSaving(true);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const data = await res.json();
      setSavedId(data.id);
      setSaved(true);
    } catch {
      alert("Failed to save draft. Please try again.");
    } finally {
      setSaving(false);
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
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!createRes.ok) throw new Error("Failed to create post");
      const postData = await createRes.json();

      const publishRes = await fetch(`/api/posts/${postData.id}/publish`, {
        method: "POST",
      });

      const result = await publishRes.json();

      if (publishRes.ok) {
        setPublishResult({
          ok: true,
          externalPostId: result.externalPostId,
          username: result.username,
        });
        setSavedId(postData.id);
      } else {
        setPublishResult({
          ok: false,
          error: result.error || "Publication failed",
        });
        setSavedId(postData.id);
      }
    } catch {
      setPublishResult({
        ok: false,
        error: "Network error. Please try again.",
      });
    } finally {
      setPublishing(false);
    }
  }

  if (publishResult) {
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
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{publishResult.username} · Published
              </div>
              <div className="flex items-center justify-center gap-3">
                {publishResult.externalPostId && (
                  <a
                    href={`https://x.com/i/status/${publishResult.externalPostId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                  >
                    View on X
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
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setSaved(false);
                setSavedId(null);
                setText("");
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
              Platform: X (Twitter)
            </span>
            <span
              className={`text-xs font-mono ${
                isOverLimit
                  ? "text-red-600 font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {charCount} / {X_POST_CHAR_LIMIT}
            </span>
          </div>
          {isOverLimit && (
            <p className="text-xs text-red-600 mt-1">
              Post exceeds the {X_POST_CHAR_LIMIT} character limit for X
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Platform</label>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-medium bg-foreground text-primary-foreground">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              X
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Preview</label>
          <div className="border border-border rounded-lg p-5 max-w-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-primary-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold">Demo User</p>
                <p className="text-xs text-muted-foreground">@postvia</p>
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

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={!canSave}
            className="px-5 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save draft"}
          </button>
          <button
            onClick={handlePublish}
            disabled={!canPublish}
            className="px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publishing ? "Publishing..." : "Publish now"}
          </button>
        </div>
      </div>
    </div>
  );
}
