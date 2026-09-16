"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { reportError } from "@/lib/diagnostics";

/**
 * Row actions behind a single menu trigger built on the Popover
 * primitive. Only existing endpoints are used: detail page, retry, delete.
 * There is no duplicate endpoint, so Duplicate is intentionally absent.
 */
export function PostRowMenu({
  id,
  status,
  onDeleted,
}: {
  id: string;
  status: string;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = status === "DRAFT";
  const canRetry = status === "FAILED";
  const canDelete =
    status === "DRAFT" || status === "SCHEDULED" || status === "FAILED";

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/posts/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Retry failed");
      toast.add({ title: "Retrying post", type: "success" });
      setMenuOpen(false);
      router.refresh();
    } catch (error) {
      reportError("posts-client", "retry post failed", error, { postId: id });
      toast.add({
        title: "Unable to retry post",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.add({ title: "Post deleted", type: "success" });
      setDeleteOpen(false);
      setMenuOpen(false);
      onDeleted?.(id);
      router.refresh();
    } catch (error) {
      reportError("posts-client", "delete post failed", error, { postId: id });
      toast.add({
        title: "Unable to delete post",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  const itemClassName =
    "flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          aria-label={`Actions for post`}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <MoreHorizontalIcon className="size-5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1.5">
          <div role="menu" aria-label="Post actions" className="flex flex-col">
            <Link
              href={`/posts/${id}`}
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className={itemClassName}
            >
              {canEdit ? (
                <PencilIcon aria-hidden="true" />
              ) : (
                <EyeIcon aria-hidden="true" />
              )}
              {canEdit ? "Edit" : "View"}
            </Link>
            {canRetry && (
              <button
                type="button"
                role="menuitem"
                disabled={retrying}
                onClick={() => void handleRetry()}
                className={cn(itemClassName, "text-left disabled:opacity-50")}
              >
                {retrying ? (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <RotateCcwIcon aria-hidden="true" />
                )}
                {retrying ? "Retrying…" : "Retry"}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
                className={cn(
                  itemClassName,
                  "text-destructive [&_svg]:text-destructive"
                )}
              >
                <Trash2Icon aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

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
              {deleting ? "Deleting…" : "Delete post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
