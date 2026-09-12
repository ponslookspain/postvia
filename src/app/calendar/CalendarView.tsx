"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, ClapperboardIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import {
  addMonths,
  bucketCalendarPosts,
  dayKeyInTimeZone,
  dropTimeFor,
  gridDayKeys,
  isMovableStatus,
  monthKey,
  type CalendarPost,
} from "@/lib/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function subscribeViewerTimeZone(): () => void {
  return () => {};
}

/**
 * Viewer IANA timezone. Server snapshot is UTC (matches SSR output, so
 * hydration never mismatches); the client snapshot switches to the real
 * local zone right after hydration and posts re-bucket accordingly.
 */
function useViewerTimeZone(): string {
  return useSyncExternalStore(
    subscribeViewerTimeZone,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC"
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "FAILED" && "bg-destructive",
        status === "DRAFT" && "bg-muted-foreground",
        status === "SCHEDULED" && "bg-primary",
        status === "PUBLISHING" && "animate-pulse bg-primary",
        status === "PUBLISHED" && "border border-primary bg-transparent",
        status === "PARTIALLY_PUBLISHED" && "border border-destructive bg-transparent"
      )}
    />
  );
}

function ChipMeta({ post }: { post: CalendarPost }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
      {post.previewMedia?.type === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media/${post.previewMedia.id}`}
          alt=""
          loading="lazy"
          className="size-6 shrink-0 rounded object-cover"
        />
      ) : post.previewMedia?.type === "VIDEO" ? (
        <ClapperboardIcon className="size-3 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="flex shrink-0 items-center">
        {post.targets.slice(0, 3).map((target) => (
          <span
            key={`${target.platform}-${target.username ?? ""}`}
            title={
              target.username
                ? `${target.platform} @${target.username}`
                : target.platform
            }
            className="flex size-3 items-center justify-center [&_svg]:size-3"
          >
            <PlatformIcon platform={target.platform} className="size-3" />
          </span>
        ))}
      </span>
    </span>
  );
}

export function CalendarView({
  posts,
  year,
  monthIndex,
  userName,
}: {
  posts: CalendarPost[];
  year: number;
  monthIndex: number;
  userName: string;
}) {
  const router = useRouter();
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const timeZone = useViewerTimeZone();

  const buckets = useMemo<Map<string, CalendarPost[]>>(
    () => bucketCalendarPosts(posts, timeZone),
    [posts, timeZone]
  );

  const todayKey = useMemo(
    () => dayKeyInTimeZone(new Date().toISOString(), timeZone),
    [timeZone]
  );

  const keys = useMemo(() => gridDayKeys(year, monthIndex), [year, monthIndex]);
  const title = new Date(year, monthIndex, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const prev = addMonths(year, monthIndex, -1);
  const next = addMonths(year, monthIndex, 1);

  const drafts = useMemo(
    () => posts.filter((post) => post.status === "DRAFT"),
    [posts]
  );

  function startDrag(postId: string) {
    return (event: React.DragEvent) => {
      dragId.current = postId;
      event.dataTransfer.setData("text/plain", postId);
      event.dataTransfer.effectAllowed = "move";
    };
  }

  async function dropOnDay(dayKey: string, event: React.DragEvent) {
    event.preventDefault();
    setDropKey(null);
    const postId =
      dragId.current ?? event.dataTransfer.getData("text/plain") ?? "";
    dragId.current = null;
    if (!postId) return;
    const post = posts.find((p) => p.id === postId);
    if (!post || !isMovableStatus(post.status)) {
      toast.add({
        title: "Cannot move this post",
        description: "Only scheduled posts and unscheduled drafts can be moved.",
        type: "warning",
      });
      return;
    }
    const local = new Date(`${dayKey}T${dropTimeFor(post.scheduledAt)}`);
    if (Number.isNaN(local.getTime())) {
      toast.add({
        title: "Cannot move this post",
        description: "The target date is invalid.",
        type: "error",
      });
      return;
    }
    setDroppingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: local.toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.add({
          title: "Could not reschedule",
          description:
            typeof data?.error === "string" ? data.error : "Please try again.",
          type: "error",
        });
        return;
      }
      toast.add({
        title: post.status === "DRAFT" ? "Post scheduled" : "Post moved",
        description: local.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: "success",
      });
      router.refresh();
    } catch {
      toast.add({
        title: "Could not reschedule",
        description: "Network error. Please try again.",
        type: "error",
      });
    } finally {
      setDroppingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`Publishing schedule for ${userName}`}
        actions={
          <Button nativeButton={false} render={<Link href="/posts/new" />}>
            <PlusIcon data-icon="inline-start" />
            Create post
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/calendar?month=${monthKey(prev.year, prev.monthIndex)}`} aria-label="Previous month" />
            }
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/calendar" />}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/calendar?month=${monthKey(next.year, next.monthIndex)}`} aria-label="Next month" />
            }
          >
            Next
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label={`Posts in ${title}`}>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day.slice(0, 1)}</span>
              </div>
            ))}
            {keys.map((key) => {
              const inMonth = key.slice(0, 7) === monthKey(year, monthIndex);
              const dayPosts = buckets.get(key) ?? [];
              const isToday = key === todayKey;
              const isOver = dropKey === key;
              return (
                <div
                  key={key}
                  aria-label={`${Number(key.slice(8))} ${title}, ${dayPosts.length} posts`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropKey(key);
                  }}
                  onDragLeave={() => setDropKey((current) => (current === key ? null : current))}
                  onDrop={(event) => void dropOnDay(key, event)}
                  className={cn(
                    "flex min-h-16 flex-col gap-1 bg-background p-1 sm:min-h-24 sm:p-1.5",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                    isToday && "bg-muted/50",
                    isOver && "bg-muted ring-2 ring-inset ring-ring/50"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday && "bg-primary font-medium text-primary-foreground"
                    )}
                  >
                    {Number(key.slice(8))}
                  </span>
                  {dayPosts.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-1 px-0.5 sm:hidden" aria-hidden="true">
                        {dayPosts.slice(0, 6).map((post) => (
                          <StatusDot key={post.id} status={post.status} />
                        ))}
                      </div>
                      <ul className="hidden min-w-0 flex-col gap-1 sm:flex">
                        {dayPosts.map((post) => (
                          <li key={post.id} className="min-w-0">
                            <Link
                              href={`/posts/${post.id}`}
                              draggable={isMovableStatus(post.status)}
                              onDragStart={startDrag(post.id)}
                              aria-label={`${post.text || "Untitled post"} (${post.status.toLowerCase()})`}
                              className={cn(
                                "flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                                droppingId === post.id && "opacity-50"
                              )}
                            >
                              <StatusDot status={post.status} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs">
                                  {post.text || "Untitled post"}
                                </span>
                                <ChipMeta post={post} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {[
              ["Scheduled", "SCHEDULED"],
              ["Publishing", "PUBLISHING"],
              ["Published", "PUBLISHED"],
              ["Failed", "FAILED"],
              ["Draft", "DRAFT"],
            ].map(([label, status]) => (
              <span key={status} className="flex items-center gap-1.5">
                <StatusDot status={status} />
                {label}
              </span>
            ))}
          </div>
          {posts.length === 0 && (
            <Empty className="mt-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlusIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing scheduled this month</EmptyTitle>
                <EmptyDescription>
                  Create a post or schedule a draft to see it here.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/posts/new" />}
                >
                  <PlusIcon data-icon="inline-start" />
                  Create post
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </section>

        <aside aria-labelledby="drafts-heading" className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="drafts-heading" className="text-lg font-medium">
              Unscheduled drafts
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {drafts.length}
            </span>
          </div>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unscheduled drafts. Drag a scheduled post between days to
              move it, or create a new one.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {drafts.map((post) => (
                <li key={post.id} className="min-w-0">
                  <Link
                    href={`/posts/${post.id}`}
                    draggable
                    onDragStart={startDrag(post.id)}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background p-3 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                      droppingId === post.id && "opacity-50"
                    )}
                  >
                    <StatusDot status={post.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {post.text || "Untitled post"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Drag onto a day to schedule for 09:00
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Separator className="my-4" />
          <p className="text-xs leading-5 text-muted-foreground">
            Only scheduled posts and drafts can be moved. Publishing,
            published and failed posts stay put. Times shown in your local
            timezone.
          </p>
        </aside>
      </div>
    </div>
  );
}
