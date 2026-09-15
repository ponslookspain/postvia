"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { Platform } from "@prisma/client";
import type { MediaKind } from "@/lib/media";

/**
 * Stage 2D: shared presentation primitives. Pure markup with no platform
 * conditionals, no validation and no state — just the pieces genuinely
 * repeated across the platform mocks.
 */

export function PostAvatar({
  platform,
  label,
}: {
  platform: Platform;
  label: string;
}) {
  return (
    <Avatar>
      <AvatarFallback aria-label={label}>
        <span className="flex size-4 items-center justify-center [&_svg]:size-4">
          <PlatformIcon platform={platform} />
        </span>
      </AvatarFallback>
    </Avatar>
  );
}

export type PreviewMediaSource = {
  key: string;
  kind: MediaKind;
  previewUrl: string;
  name: string;
};

export function PostMedia({
  item,
  className,
}: {
  item: PreviewMediaSource;
  className?: string;
}) {
  if (item.kind === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.previewUrl} alt={item.name} className={className} />;
  }
  return (
    <video
      src={item.previewUrl}
      muted
      playsInline
      aria-label={"Video preview of " + item.name}
      className={className}
    />
  );
}
