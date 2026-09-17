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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { reportError } from "@/lib/diagnostics";

/**
 * Row actions as the `DropdownMenu` primitive. Only existing endpoints are used:
 * detail page, retry, delete. There is no duplicate endpoint, so
 * Duplicate is intentionally absent.
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

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label={`Actions for post`}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <MoreHorizontalIcon className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild onClick={() => setMenuOpen(false)}>
            <Link href={`/posts/${id}`}>
              {canEdit ? (
                <PencilIcon aria-hidden="true" />
              ) : (
                <EyeIcon aria-hidden="true" />
              )}
              {canEdit ? "Edit" : "View"}
            </Link>
          </DropdownMenuItem>
          {canRetry && (
            <DropdownMenuItem
              disabled={retrying}
              onSelect={() => void handleRetry()}
            >
              {retrying ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <RotateCcwIcon aria-hidden="true" />
              )}
              {retrying ? "Retrying…" : "Retry"}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false);
                setDeleteOpen(true);
              }}
              className="text-error [&_svg]:text-error"
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
