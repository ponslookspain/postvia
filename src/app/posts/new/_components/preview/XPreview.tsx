"use client";

import { Heart, MessageCircle, Repeat2, Share } from "lucide-react";
import type { ComposerPreviewModel } from "@/lib/composer-previews";
import { PostAvatar } from "./primitives";

export type PlatformPostProps = {
  model: ComposerPreviewModel;
  userName: string;
};

/**
 * Stage 2B mock, Stage 2D fidelity pass: X post shape — inline
 * display-name/handle header, text, full-width actions row. Text-only
 * scope is structural: no media slot exists here at all.
 */
export function XPreview({ model, userName }: PlatformPostProps) {
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
      <p className="text-[15px] leading-normal break-words whitespace-pre-wrap">
        {model.text || (
          <span className="text-muted-foreground">
            Your post will appear here...
          </span>
        )}
      </p>
      <div
        aria-hidden="true"
        className="flex items-center justify-between text-muted-foreground"
      >
        <MessageCircle className="size-4" />
        <Repeat2 className="size-4" />
        <Heart className="size-4" />
        <Share className="size-4" />
      </div>
    </div>
  );
}
