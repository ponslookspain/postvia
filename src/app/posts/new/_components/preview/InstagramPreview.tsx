"use client";

import { Bookmark, Heart, MessageCircle, Share } from "lucide-react";
import type { DraftMedia } from "../types";
import type { PlatformPostProps } from "./XPreview";
import { PostAvatar, PostMedia } from "./primitives";

/**
 * Stage 2B mock, Stage 2D fidelity pass: Instagram shape — account
 * header, full-bleed square media space, actions row, username-led
 * caption. The media block always occupies real space: the attached
 * file or an honest empty state, never a fake post. No invented counts.
 */
export function InstagramPreview({
  model,
  media,
}: PlatformPostProps & { media: DraftMedia[] }) {
  const first = media[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <PostAvatar platform={model.platform} label={model.label} />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {model.username}
        </p>
      </div>
      {first ? (
        <PostMedia
          item={first}
          className="aspect-square w-full rounded-md border object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center">
          <p className="text-sm font-medium">No media yet</p>
          <p className="text-xs text-muted-foreground">
            Instagram needs an image or video — attach one to preview it here
          </p>
        </div>
      )}
      <div
        aria-hidden="true"
        className="flex items-center gap-4 text-muted-foreground"
      >
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Share className="size-5" />
        <Bookmark className="ml-auto size-5" />
      </div>
      <p className="text-sm leading-normal break-words">
        <span className="font-semibold">{model.username}</span>{" "}
        {model.text || (
          <span className="font-normal text-muted-foreground">
            Your caption will appear here...
          </span>
        )}
      </p>
    </div>
  );
}
