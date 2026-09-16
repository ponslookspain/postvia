"use client";

import { Heart, MessageCircle, Repeat2, Share } from "lucide-react";
import type { DraftMedia } from "../types";
import type { PlatformPostProps } from "./XPreview";
import { PostAvatar, PostMedia } from "./primitives";

/**
 * Stage 2B mock, Stage 2D fidelity pass: Threads shape — inline
 * header, full-width first attachment (Threads caps a post at one
 * item; extra files are noted, not faked into a carousel), then a
 * metadata-separated actions row. No invented counts.
 */
export function ThreadsPreview({
  model,
  userName,
  media,
}: PlatformPostProps & { media: DraftMedia[] }) {
  const [first, ...rest] = media;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <PostAvatar platform={model.platform} label={model.label} />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{userName}</span>{" "}
          <span className="font-normal text-muted-foreground">
            @{model.username}
          </span>
        </p>
      </div>
      <p className="text-prose leading-normal break-words whitespace-pre-wrap">
        {model.text || (
          <span className="text-muted-foreground">
            Your post will appear here...
          </span>
        )}
      </p>
      {first && (
        <div className="flex flex-col gap-1.5">
          <PostMedia
            item={first}
            className="max-h-80 w-full rounded-lg border object-cover"
          />
          {rest.length > 0 && (
            <p className="text-xs text-muted-foreground">
              +{rest.length} more file{rest.length === 1 ? "" : "s"} attached
            </p>
          )}
        </div>
      )}
      <div
        aria-hidden="true"
        className="flex items-center gap-5 border-t border-border pt-3 text-muted-foreground"
      >
        <Heart className="size-4" />
        <MessageCircle className="size-4" />
        <Repeat2 className="size-4" />
        <Share className="size-4" />
      </div>
    </div>
  );
}
