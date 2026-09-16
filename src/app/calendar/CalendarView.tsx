"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, GripVerticalIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusDot } from "@/components/StatusBadge";
import { EmptyBlock } from "@/components/StateBlock";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { reportError } from "@/lib/diagnostics";
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

/**
 * Fixed grid geometry: every day cell is the same height on every row,
 * so a busy day can never stretch the timetable. Desktop shows at most
 * three compact chips; the rest live behind "+N more", which opens an
 * overlay Popover — the grid never reflows.
 */
const MAX_VISIBLE_CHIPS = 3;

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

/** HH:MM of the post's reference instant (scheduled, published, created). */
function postTime(post: CalendarPost): string {
  const iso = post.scheduledAt ?? post.publishedAt ?? post.createdAt;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChipPlatforms({ post }: { post: CalendarPost }) {
  if (post.targets.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {post.targets.slice(0, 2).map((target) => (
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
  );
}

/**
 * One-line day chip: status dot, time, truncated title, platform marks.
 * Fixed h-6 everywhere — long text truncates instead of growing the cell.
 */
function DayPostChip({
  post,
  draggable,
  dimmed,
  onDragStart,
}: {
  post: CalendarPost;
  draggable: boolean;
  dimmed: boolean;
  onDragStart: (event: React.DragEvent) => void;
}) {
  return (
    <Link
      href={`/posts/${post.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      aria-label={`${post.text || "Untitled post"} (${post.status.toLowerCase()})`}
      className={cn(
        "flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-fill2 px-1.5 outline-none transition-colors hover:border-border hover:bg-fill3 focus-visible:ring-2 focus-visible:ring-primary-focus",
        dimmed && "opacity-50"
      )}
    >
      <StatusDot status={post.status} />
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {postTime(post)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">
        {post.text || "Untitled post"}
      </span>
      <ChipPlatforms post={post} />
    </Link>
  );
}

/** Overflow posts behind "+N more": overlay list, grid stays untouched. */
function DayOverflow({
  label,
  posts,
}: {
  label: string;
  posts: CalendarPost[];
}) {
  return (
    <Popover>
      <PopoverTrigger className="flex h-5 shrink-0 items-center rounded-sm px-0.5 text-left text-[11px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        +{posts.length} more
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={`More posts on ${label}`}
        className="max-h-72 overflow-y-auto"
      >
        <ul className="flex min-w-0 flex-col gap-1">
          {posts.map((post) => (
            <li key={post.id} className="min-w-0">
              <Link
                href={`/posts/${post.id}`}
                className="flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <StatusDot status={post.status} />
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {postTime(post)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {post.text || "Untitled post"}
                </span>
                <ChipPlatforms post={post} />
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
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
    if (droppingId) return;
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
        description: "That day can't take a post. Drop it on another day.",
        type: "warning",
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
      await res.json().catch(() => null);
      if (!res.ok) {
        toast.add({
          title: "Unable to move this post",
          description: "Please try again.",
          type: "error",
        });
        return;
      }
      toast.add({
        title: "Post moved",
        description: local.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: "success",
      });
      router.refresh();
    } catch (error) {
      reportError("calendar-client", "move post failed", error, {
        postId,
      });
      toast.add({
        title: "Unable to move this post",
        description: "Please try again.",
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
          <Button
            nativeButton={false}
            render={<Link href="/posts/new" />}
          >
            <PlusIcon data-icon="inline-start" />
            Create post
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link href={`/calendar?month=${monthKey(prev.year, prev.monthIndex)}`} aria-label="Previous month" />
            }
          >
            <ChevronLeftIcon />
          </Button>
          <h2 className="font-heading min-w-0 truncate px-1 text-lg leading-7 font-semibold tracking-tight tabular-nums">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link href={`/calendar?month=${monthKey(next.year, next.monthIndex)}`} aria-label="Next month" />
            }
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/calendar" />}
        >
          Today
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label={`Posts in ${title}`}>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="bg-background px-2 py-2 text-center text-xs font-medium text-muted-foreground"
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
              const visible = dayPosts.slice(0, MAX_VISIBLE_CHIPS);
              const overflow = dayPosts.slice(MAX_VISIBLE_CHIPS);
              const dayLabel = `${Number(key.slice(8))} ${title}`;
              return (
                <div
                  key={key}
                  aria-label={`${dayLabel}, ${dayPosts.length} posts`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropKey(key);
                  }}
                  onDragLeave={() => setDropKey((current) => (current === key ? null : current))}
                  onDrop={(event) => void dropOnDay(key, event)}
                  className={cn(
                    "flex h-20 flex-col gap-1 overflow-hidden bg-card p-1 sm:h-36 sm:p-1.5",
                    !inMonth && "bg-muted/40 text-muted-foreground",
                    isToday && "bg-primary-accent",
                    isOver && "bg-muted ring-2 ring-inset ring-primary-focus"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
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
                        {visible.map((post) => (
                          <li key={post.id} className="min-w-0">
                            <DayPostChip
                              post={post}
                              draggable={isMovableStatus(post.status)}
                              dimmed={droppingId === post.id}
                              onDragStart={startDrag(post.id)}
                            />
                          </li>
                        ))}
                      </ul>
                      {overflow.length > 0 && (
                        <div className="hidden sm:block">
                          <DayOverflow label={dayLabel} posts={overflow} />
                        </div>
                      )}
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
            <EmptyBlock
              className="mt-4"
              icon={<PlusIcon />}
              title="Nothing scheduled this month"
              description="Create a post or schedule a draft to see it here."
              actions={
                <Button
                  nativeButton={false}
                  render={<Link href="/posts/new" />}
                >
                  <PlusIcon data-icon="inline-start" />
                  Create post
                </Button>
              }
            />
          )}
        </section>

        <aside aria-labelledby="drafts-heading" className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="drafts-heading"
              className="text-sm leading-6 font-medium tracking-tight"
            >
              Unscheduled drafts
            </h2>
            <p
              className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums"
              aria-label={`${drafts.length} unscheduled drafts`}
            >
              {drafts.length}
            </p>
          </div>
          <div className="mt-3">
            {drafts.length === 0 ? (
              <p className="text-sm leading-5 text-muted-foreground">
                No unscheduled drafts. Drag a scheduled post between days
                to move it, or create a new one.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {drafts.map((post) => (
                  <li key={post.id} className="min-w-0">
                    <Link
                      href={`/posts/${post.id}`}
                      draggable
                      onDragStart={startDrag(post.id)}
                      title="Drag onto a day to schedule"
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background p-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                        droppingId === post.id && "opacity-50"
                      )}
                    >
                      <GripVerticalIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 cursor-grab text-muted-foreground"
                      />
                      <StatusDot status={post.status} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {post.text || "Untitled post"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1">
                          <ChipPlatforms post={post} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Only scheduled posts and unscheduled drafts can be moved.
            Times shown in your local timezone.
          </p>
        </aside>
      </div>
    </div>
  );
}
