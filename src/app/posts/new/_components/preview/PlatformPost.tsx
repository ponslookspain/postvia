"use client";

import type { Platform } from "@prisma/client";
import type { ComposerPreviewModel } from "@/lib/composer-previews";
import type { DraftMedia } from "../types";
import { XPreview } from "./XPreview";
import { ThreadsPreview } from "./ThreadsPreview";
import { InstagramPreview } from "./InstagramPreview";
import { TikTokPreview } from "./TikTokPreview";

/**
 * Stage 2B: thin presentation dispatcher. Picks the platform mock by
 * model.platform only — validation, effective content, account and media
 * state all arrive ready-made in the model.
 */
export function PlatformPost({
  model,
  userName,
  media,
}: {
  model: ComposerPreviewModel;
  userName: string;
  media: DraftMedia[];
}) {
  const platform: Platform = model.platform;
  switch (platform) {
    case "X":
      return <XPreview model={model} userName={userName} />;
    case "THREADS":
      return <ThreadsPreview model={model} userName={userName} media={media} />;
    case "INSTAGRAM":
      return <InstagramPreview model={model} userName={userName} media={media} />;
    case "TIKTOK":
      return <TikTokPreview model={model} userName={userName} media={media} />;
    default:
      return <ThreadsPreview model={model} userName={userName} media={media} />;
  }
}
