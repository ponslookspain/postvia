"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

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
  const [deleteOpen, setDeleteOpen] = useState(false);
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
      toast.add({
        title: "Failed to save changes",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/posts");
    } catch {
      toast.add({
        title: "Failed to delete post",
        description: "Please try again.",
        type: "error",
      });
      setDeleting(false);
      setDeleteOpen(false);
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
      toast.add({
        title: "Failed to delete media",
        description: "Please try again.",
        type: "error",
      });
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
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <PageHeader
        title="Post"
        description={`Created ${new Date(post.createdAt).toLocaleDateString(
          "en-GB",
          { day: "numeric", month: "short", year: "numeric" }
        )}`}
        actions={<StatusBadge status={post.status} />}
      />

      <FieldGroup className="gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Text</CardTitle>
            {!editing && (
              <CardDescription>
                Platform: {formatPlatformName(platform)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <FieldGroup>
                <Field data-invalid={isOverLimit || undefined}>
                  <FieldLabel htmlFor="post-text" className="sr-only">
                    Post text
                  </FieldLabel>
                  <Textarea
                    id="post-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    aria-invalid={isOverLimit || undefined}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <FieldDescription>
                      Platform: {formatPlatformName(platform)}
                    </FieldDescription>
                    <Badge
                      variant={isOverLimit ? "destructive" : "secondary"}
                    >
                      {charCount} / {charLimit}
                    </Badge>
                  </div>
                  {isOverLimit && (
                    <FieldError>
                      Post exceeds the {charLimit} character limit
                    </FieldError>
                  )}
                </Field>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => void handleSave()} disabled={!canSave}>
                    {saving && <Spinner data-icon="inline-start" />}
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setText(post.text);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            ) : (
              <p className="text-sm break-words whitespace-pre-wrap">
                {post.text}
              </p>
            )}
          </CardContent>
        </Card>

        {post.media.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
              <CardDescription>
                {post.media.length}{" "}
                {post.media.length === 1 ? "file" : "files"} attached
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-start gap-3">
                {post.media.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1.5">
                    <div className="relative size-40 overflow-hidden rounded-md border border-border bg-muted">
                      {item.type === "IMAGE" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/media/${item.id}`}
                          alt={item.filename}
                          className="size-full object-cover"
                        />
                      ) : (
                        <video
                          src={`/api/media/${item.id}`}
                          className="size-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => void handleDeleteMedia(item.id)}
                        disabled={deletingMediaId === item.id}
                        aria-label={`Remove ${item.filename}`}
                        className="absolute top-1.5 right-1.5 size-6 rounded-full"
                      >
                        {deletingMediaId === item.id ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <span aria-hidden="true" className="text-sm leading-none">
                            ×
                          </span>
                        )}
                      </Button>
                    </div>
                    <p className="w-40 truncate text-xs text-muted-foreground">
                      {item.filename}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="mb-1 text-sm font-medium">Platform</dt>
                <dd className="text-sm">{formatPlatformName(platform)}</dd>
              </div>
              <div>
                <dt className="mb-1 text-sm font-medium">Status</dt>
                <dd>
                  <StatusBadge status={post.status} />
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-sm font-medium">Created</dt>
                <dd className="text-sm">
                  {new Date(post.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              {post.scheduledAt && (
                <div>
                  <dt className="mb-1 text-sm font-medium">Scheduled for</dt>
                  <dd className="text-sm">
                    {new Date(post.scheduledAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </dd>
                </div>
              )}
              <div>
                <dt className="mb-1 text-sm font-medium">Published</dt>
                <dd className="text-sm text-muted-foreground">
                  {post.publishedAt
                    ? new Date(post.publishedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </dd>
              </div>
              {externalPostId && (
                <div className="col-span-2">
                  <dt className="mb-1 text-sm font-medium">External ID</dt>
                  <dd className="text-sm text-muted-foreground font-mono">
                    {externalPostId}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publishing targets</CardTitle>
            <CardDescription>
              One row per connected account this post goes to
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {post.targets.map((targetItem) => (
              <div
                key={targetItem.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {formatPlatformName(targetItem.platform)}
                    {targetItem.socialAccount?.username
                      ? ` @${targetItem.socialAccount.username}`
                      : ""}
                  </p>
                  {targetItem.errorMessage && (
                    <p className="text-xs text-destructive">
                      {targetItem.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {targetItem.status === "PUBLISHED" &&
                    targetPostUrl(targetItem) && (
                      <a
                        href={targetPostUrl(targetItem)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        View
                      </a>
                    )}
                  <Badge variant="secondary">
                    {targetItem.status.toLowerCase()}
                  </Badge>
                  {targetItem.status === "FAILED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRetry(targetItem.id)}
                      disabled={retrying}
                    >
                      {retrying && <Spinner data-icon="inline-start" />}
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {post.status === "FAILED" && post.errorMessage && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Publication failed</AlertTitle>
            <AlertDescription>{post.errorMessage}</AlertDescription>
          </Alert>
        )}

        {!editing && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {post.status === "DRAFT" && (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
                <Button
                  onClick={() => void handlePublish()}
                  disabled={publishing}
                >
                  {publishing && <Spinner data-icon="inline-start" />}
                  {!publishing && <SendIcon data-icon="inline-start" />}
                  {publishing ? "Publishing..." : "Publish now"}
                </Button>
              </>
            )}

            {post.status === "PUBLISHED" && externalPostId && (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={
                      platform === "THREADS"
                        ? threadsPostUrl(post.username ?? "", externalPostId)
                        : `https://x.com/i/status/${externalPostId}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                View on {platform === "THREADS" ? "Threads" : "X"}
              </Button>
            )}

            {post.status === "FAILED" && (
              <Button
                onClick={() => void handleRetry()}
                disabled={retrying}
              >
                {retrying && <Spinner data-icon="inline-start" />}
                {retrying ? "Retrying..." : "Retry"}
              </Button>
            )}

            {(post.status === "DRAFT" || post.status === "SCHEDULED") &&
              platform === "THREADS" && (
                <Button
                  variant="outline"
                  onClick={openReschedule}
                  disabled={rescheduling || publishing}
                >
                  {post.status === "SCHEDULED" ? "Reschedule" : "Schedule"}
                </Button>
              )}

            {(post.status === "DRAFT" ||
              post.status === "SCHEDULED" ||
              post.status === "FAILED") && (
              <Button
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={deleting}
              >
                {deleting && <Spinner data-icon="inline-start" />}
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            )}
          </div>
        )}
      </FieldGroup>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {post.status === "SCHEDULED"
                ? "Change scheduled time"
                : "Schedule this post"}
            </DialogTitle>
            <DialogDescription>
              Times are interpreted in your local timezone (
              {Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="reschedule-date">Date</FieldLabel>
                <input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  min={localDateInputValue(new Date())}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="reschedule-time">Time</FieldLabel>
                <input
                  id="reschedule-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Field>
            </div>
            {rescheduleError && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>Cannot save time</AlertTitle>
                <AlertDescription>{rescheduleError}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
          <DialogFooter>
            {post.status === "SCHEDULED" && (
              <Button
                variant="outline"
                onClick={() => void handleUnschedule()}
                disabled={rescheduling}
                className="mr-auto"
              >
                Remove schedule
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setRescheduleOpen(false)}
              disabled={rescheduling}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRescheduleSave()}
              disabled={rescheduling || !rescheduleDate || !rescheduleTime}
            >
              {rescheduling && <Spinner data-icon="inline-start" />}
              {rescheduling ? "Saving..." : "Save time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The post and its media will be
              permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting && <Spinner data-icon="inline-start" />}
              {deleting ? "Deleting..." : "Delete post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
