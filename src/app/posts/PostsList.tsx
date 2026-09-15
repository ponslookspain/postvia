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

export type PostListItem = {
  id: string;
  text: string;
  status: string;
  createdAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  targets: { id: string; platform: string }[];
  media: { id: string; type: string }[];
};

const PLATFORM_OPTIONS = ["X", "THREADS", "TIKTOK", "INSTAGRAM"] as const;

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
      {post.media.length > 1 && (
        <span className="absolute right-1 bottom-1 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground tabular-nums">
          +{post.media.length - 1}
        </span>
      )}
    </span>
  );
}

export function PostsList({
  posts,
  statusFilter,
}: {
  posts: PostListItem[];
  statusFilter: string;
}) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = posts.filter((post) => {
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
  }, [posts, query, platform, sort]);

  const toolbarActive = query.trim() !== "" || platform !== "all";

  return (
    <div className="flex flex-col gap-6">
      <div
        role="search"
        aria-label="Filter posts"
        className="flex flex-col gap-2 md:flex-row md:items-center"
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
        <div>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[64px_minmax(0,1fr)_150px_140px_120px_44px] items-center gap-4 border-b border-border py-3 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>Media</span>
            <span>Content</span>
            <span>Platforms</span>
            <span>Status</span>
            <span>Date</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-border border-b border-border">
            {visible.map((post) => (
              <li
                key={post.id}
                className="grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-3 py-4 md:grid-cols-[64px_minmax(0,1fr)_150px_140px_120px_44px] md:gap-4"
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
                    className="block truncate text-[15px] leading-snug font-medium text-foreground outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50 md:line-clamp-2 md:whitespace-normal md:break-words md:hover:no-underline"
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
                  <PostRowMenu id={post.id} status={post.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
