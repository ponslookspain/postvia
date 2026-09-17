"use client";

import { ClapperboardIcon, Heart, MessageCircle, Share } from "lucide-react";
import type { DraftMedia } from "../types";
import type { PlatformPostProps } from "./XPreview";
import { PostMedia } from "./primitives";

function humanizePrivacy(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.replace(/^./, (c) => c.toUpperCase());
}

/**
 * Stage 2B mock, Stage 2D fidelity pass: TikTok shape — a 9:16 card
 * constrained so it never overflows its container, video-first with a
 * bottom overlay carrying username, the effective caption and the chosen
 * privacy. Photo posts render the title and the description as separate
 * lines, mirroring the photo post_info contract; video posts render the
 * title as the caption. The title defaults to the global post text
 * (TikTok's title is optional). Side action rail, no 1:1 imitation.
 */
export function TikTokPreview({
  model,
  media,
}: PlatformPostProps & { media: DraftMedia[] }) {
  const video = media.find((item) => item.kind === "VIDEO") ?? media[0];
  const privacy = humanizePrivacy(model.settings["privacy_level"]);
  const isPhoto = model.tiktokMode === "photo";
  const description = model.description;
  return (
    <div className="flex justify-center gap-3">
      <div className="relative w-full max-w-60 min-w-0 overflow-hidden rounded-md border bg-muted">
        {video ? (
          <PostMedia
            item={video}
            className="aspect-[9/16] max-h-96 w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[9/16] max-h-96 w-full flex-col items-center justify-center gap-2.5 p-6 text-center">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-xl bg-card text-muted-foreground"
            >
              <ClapperboardIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">No video yet</p>
            <p className="max-w-36 text-xs leading-relaxed text-muted-foreground">
              Attach a video to preview it here
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
          <p className="truncate text-sm font-semibold text-white">
            @{model.username}
          </p>
          {isPhoto ? (
            <>
              <p className="line-clamp-2 text-xs font-medium break-words text-white">
                {model.text || (
                  <span className="font-normal text-white/70">
                    Add post text above or a custom title
                  </span>
                )}
              </p>
              <p className="line-clamp-3 text-xs break-words text-white/90">
                {description || (
                  <span className="text-white/70">
                    Add a description via Customize
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="line-clamp-3 text-xs break-words text-white/90">
              {model.text || (
                <span className="text-white/70">
                  Add post text above — it becomes the TikTok caption
                </span>
              )}
            </p>
          )}
          {privacy && (
            <p className="text-meta text-white/70">Privacy: {privacy}</p>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex shrink-0 flex-col items-center justify-end gap-4 pb-2 text-muted-foreground"
      >
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Share className="size-5" />
      </div>
    </div>
  );
}
