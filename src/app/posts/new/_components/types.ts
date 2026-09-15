import type { Platform } from "@prisma/client";
import type { MediaKind } from "@/lib/media";

/**
 * Shared composer types (Stage H0: moved verbatim from
 * NewPostComposer.tsx — no renames, no structural changes).
 */

export type PublishResult = {
  ok: boolean;
  platform?: Platform;
  externalPostId?: string;
  username?: string;
  error?: string;
};

export type DraftMedia = {
  key: string;
  file: File;
  previewUrl: string;
  kind: MediaKind;
  name: string;
  size: number;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  /** Post id this item was registered to on a completed upload. */
  registeredPostId?: string | null;
};

export type ConnectedAccount = {
  id: string;
  platform: Platform;
  username: string;
  implemented: boolean;
};

export type TargetOverrideState = Record<
  string,
  {
    text?: string;
    title?: string;
    /** TikTok photo description (photo flow only; never sent for video). */
    description?: string;
    settings?: Record<string, unknown>;
  }
>;

export type TiktokCreatorInfo = {
  username: string;
  nickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};
