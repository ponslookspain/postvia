"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ClapperboardIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { formatPostDate, formatStatusLabel } from "@/lib/utils";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusDot } from "@/components/StatusBadge";
import { EmptyBlock } from "@/components/StateBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PostRowMenu } from "./PostRowMenu";
import { getImplementedPlatforms } from "@/lib/platforms/capabilities";
import { POST_PAGE_DEFAULT } from "@/lib/pagination";

export type PostListItem = {
  id: string;
  text: string;
  status: string;
  createdAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  targets: { id: string; platform: string }[];
  media: { id: string; type: string }[];
  /** Total attached files (only the thumbnail row loads per post). */
  mediaCount: number;
};

// Platform filter options from the single capability registry (E1),
// in shared registry order. Labels render as before (X stays "X").
const PLATFORM_OPTIONS: readonly string[] = getImplementedPlatforms().map(
  (caps) => caps.platform
);

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function MediaThumb({ post }: { post: PostListItem }) {
  const preview = post.media[0];
  if (!preview) {
    return (
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground md:size-16"
      >
        <FileTextIcon className="size-5" />
      </span>
    );
  }
  return (
    <span className="relative block size-14 shrink-0 overflow-hidden rounded-lg bg-muted md:size-16">
      {preview.type === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media/${preview.id}`}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <ClapperboardIcon
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
      )}
      {post.mediaCount > 1 && (
        <span className="absolute right-1 bottom-1 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground tabular-nums">
          +{post.mediaCount - 1}
        </span>
      )}
    </span>
  );
}

/**
 * Normalize one API list row into PostListItem shape. Defensive: the
 * endpoint returns full Prisma rows (extra fields ignored), and anything
 * misshapen is dropped instead of crashing the list.
 */
function normalizeListItem(row: unknown): PostListItem | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const text = typeof r.text === "string" ? r.text : "";
  const status = typeof r.status === "string" ? r.status : "DRAFT";
  const iso = (value: unknown): string | null =>
    typeof value === "string" ? value : null;
  const targets = Array.isArray(r.targets)
    ? r.targets.flatMap((t): { id: string; platform: string }[] => {
        if (!t || typeof t !== "object" || Array.isArray(t)) return [];
        const o = t as Record<string, unknown>;
        return typeof o.id === "string" && typeof o.platform === "string"
          ? [{ id: o.id, platform: o.platform }]
          : [];
      })
    : [];
  const media = Array.isArray(r.media)
    ? r.media.flatMap((m): { id: string; type: string }[] => {
        if (!m || typeof m !== "object" || Array.isArray(m)) return [];
        const o = m as Record<string, unknown>;
        return typeof o.id === "string" && typeof o.type === "string"
          ? [{ id: o.id, type: o.type }]
          : [];
      })
    : [];
  const count = (r._count as { media?: unknown } | undefined)?.media;
  return {
    id: r.id,
    text,
    status,
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: iso(r.scheduledAt),
    publishedAt: iso(r.publishedAt),
    targets,
    media,
    mediaCount: typeof count === "number" ? count : media.length,
  };
}

/**
 * Pure merge for a successful post deletion in the current
 * status-filtered view. Removes the row from the loaded items and
 * decrements the total only when the row was present, so a repeated
 * or stray callback can never drive the count negative or out of sync.
 */
export function applyPostDeleted(
  current: PostListItem[],
  totalCount: number,
  id: string
): { items: PostListItem[]; total: number } {
  if (!current.some((post) => post.id === id)) {
    return { items: current, total: totalCount };
  }
  return {
    items: current.filter((post) => post.id !== id),
    total: Math.max(0, totalCount - 1),
  };
}

export function PostsList({
  posts: initialPosts,
  statusFilter,
  initialNextCursor,
  total,
}: {
  posts: PostListItem[];
  statusFilter: string;
  initialNextCursor: string | null;
  total: number;
}) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  // Accumulated pages (keyed remount per statusFilter keeps this fresh).
  const [items, setItems] = useState<PostListItem[]>(initialPosts);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [totalCount, setTotalCount] = useState(total);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Immediate removal after a successful DELETE: router.refresh()
  // revalidates the server props, but this client state was seeded once
  // from initialPosts and would otherwise stay stale until reload.
  function handleDeleted(id: string) {
    const next = applyPostDeleted(items, totalCount, id);
    setItems(next.items);
    setTotalCount(next.total);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((post) => {
      if (q && !post.text.toLowerCase().includes(q)) return false;
      if (
        platform !== "all" &&
        !post.targets.some((target) => target.platform === platform)
      ) {
        return false;
      }
      return true;
    });
    if (sort === "oldest") return [...filtered].reverse();
    return filtered;
  }, [items, query, platform, sort]);

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        limit: String(POST_PAGE_DEFAULT),
        cursor,
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as {
        posts?: unknown;
        nextCursor?: unknown;
      } | null;
      if (!res.ok || !data || !Array.isArray(data.posts)) {
        throw new Error("bad page");
      }
      const fresh = data.posts.flatMap((row): PostListItem[] => {
        const item = normalizeListItem(row);
        return item ? [item] : [];
      });
      setItems((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...fresh.filter((post) => !seen.has(post.id))];
      });
      setCursor(
        typeof data.nextCursor === "string" && data.nextCursor.length > 0
          ? data.nextCursor
          : null
      );
    } catch {
      setLoadError("Couldn't load more posts. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  const toolbarActive = query.trim() !== "" || platform !== "all";

  return (
    <div className="flex flex-col gap-5">
      <div
        role="search"
        aria-label="Filter posts"
        className="flex flex-col gap-2 rounded-xl bg-panel p-2 md:flex-row md:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts…"
            aria-label="Search posts"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={platform}
            onValueChange={(value: unknown) => setPlatform(String(value))}
          >
            <SelectTrigger
              aria-label="Filter by platform"
              className="min-w-0 flex-1 md:w-40 md:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All platforms</SelectItem>
                {PLATFORM_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "X"
                      ? "X"
                      : option.charAt(0) +
                        option.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value: unknown) => setSort(String(value))}
          >
            <SelectTrigger
              aria-label="Sort posts"
              className="min-w-0 flex-1 md:w-36 md:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        toolbarActive ? (
          <EmptyBlock
            icon={<FileTextIcon />}
            title="No matching posts"
            description="Nothing matches the current search and filters."
            actions={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setPlatform("all");
                }}
              >
                Clear search and filters
              </Button>
            }
          />
        ) : statusFilter !== "all" ? (
          <EmptyBlock
            icon={<FileTextIcon />}
            title={`No ${formatStatusLabel(statusFilter).toLowerCase()} posts`}
            description={
              <>
                Nothing here yet.{" "}
                <Link
                  href="/posts"
                  className="underline hover:text-foreground"
                >
                  View all posts
                </Link>
                .
              </>
            }
          />
        ) : (
          <EmptyBlock
            icon={<FileTextIcon />}
            title="No posts yet"
            description="Create your first post to get started."
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
        )
      ) : (
        <div className="overflow-hidden rounded-xl bg-panel">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[64px_minmax(0,1fr)_150px_140px_120px_44px] items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid"
          >
            <span>Media</span>
            <span>Content</span>
            <span>Platforms</span>
            <span>Status</span>
            <span>Date</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="flex flex-col p-1.5">
            {visible.map((post) => (
              <li
                key={post.id}
                className="grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-overlay-4 md:grid-cols-[64px_minmax(0,1fr)_150px_140px_120px_44px] md:gap-4 md:px-4 md:py-3.5"
              >
                <Link
                  href={`/posts/${post.id}`}
                  aria-label={`Open post: ${post.text || "Untitled post"}`}
                  className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <MediaThumb post={post} />
                </Link>
                <div className="min-w-0">
                  <Link
                    href={`/posts/${post.id}`}
                    className="block truncate text-sm leading-snug font-medium text-foreground outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50 md:line-clamp-2 md:whitespace-normal md:break-words md:hover:no-underline"
                  >
                    {post.text || "Untitled post"}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground md:hidden">
                    <span className="flex items-center gap-1">
                      {post.targets.map((target) => (
                        <span
                          key={target.id}
                          title={target.platform}
                          className="flex size-4 items-center justify-center [&_svg]:size-4"
                        >
                          <PlatformIcon
                            platform={target.platform}
                            className="size-4"
                          />
                          <span className="sr-only">
                            {target.platform}
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <StatusDot status={post.status} />
                      {formatStatusLabel(post.status)}
                    </span>
                    <span>
                      {formatPostDate({
                        status: post.status,
                        publishedAt: toDate(post.publishedAt),
                        scheduledAt: toDate(post.scheduledAt),
                        createdAt:
                          toDate(post.createdAt) ?? new Date(post.createdAt),
                      })}
                    </span>
                  </div>
                </div>
                <span className="hidden min-w-0 items-center gap-1 md:flex">
                  {post.targets.map((target) => (
                    <span
                      key={target.id}
                      title={target.platform}
                      className="flex size-4 items-center justify-center [&_svg]:size-4"
                    >
                      <PlatformIcon
                        platform={target.platform}
                        className="size-4"
                      />
                      <span className="sr-only">{target.platform}</span>
                    </span>
                  ))}
                </span>
                <span className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground md:flex">
                  <StatusDot status={post.status} />
                  {formatStatusLabel(post.status)}
                </span>
                <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground tabular-nums md:block">
                  {formatPostDate({
                    status: post.status,
                    publishedAt: toDate(post.publishedAt),
                    scheduledAt: toDate(post.scheduledAt),
                    createdAt:
                      toDate(post.createdAt) ?? new Date(post.createdAt),
                  })}
                </span>
                <span className="flex justify-end">
                  <PostRowMenu
                    id={post.id}
                    status={post.status}
                    onDeleted={handleDeleted}
                  />
                </span>
              </li>
            ))}
          </ul>
          {cursor || items.length < totalCount ? (
            <div className="flex flex-col items-center gap-2 border-t border-border bg-muted/30 px-4 py-5">
              <p className="text-xs text-muted-foreground tabular-nums">
                Showing {items.length} of {totalCount} posts
              </p>
              {cursor ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                  {loadError && (
                    <p role="alert" className="text-sm text-error">
                      {loadError}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
