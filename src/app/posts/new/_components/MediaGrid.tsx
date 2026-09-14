"use client";

import { useRef } from "react";
import { ImagePlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ErrorBlock } from "@/components/StateBlock";
import { formatFileSize } from "./media-utils";
import type { DraftMedia } from "./types";

export function MediaGrid({
  media,
  maxMedia,
  disabled,
  mediaUploadNote,
  canRetry,
  onAddFiles,
  onRemove,
  onRetry,
}: {
  media: DraftMedia[];
  maxMedia: number;
  disabled: boolean;
  mediaUploadNote: string | null;
  canRetry: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <section aria-labelledby="composer-media">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2
            id="composer-media"
            className="text-lg font-medium tracking-tight"
          >
            Media
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            JPG, PNG, WebP or GIF images up to 10 MB; MP4, WebM or MOV
            videos up to 100 MB.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {media.length}/{maxMedia}
        </Badge>
      </div>
      <div className="flex flex-col gap-3">
          {media.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="h-28 w-full flex-col gap-1.5 border-dashed py-4"
            >
              <ImagePlusIcon data-icon="inline-start" />
              Add media
              <span className="text-xs font-normal text-muted-foreground">
                Images or video, up to {maxMedia} files
              </span>
            </Button>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              {media.map((item) => (
            <div key={item.key} className="flex flex-col gap-1.5">
              <div className="relative size-28 overflow-hidden rounded-md border bg-muted">
                {item.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <video
                    src={item.previewUrl}
                    className="size-full object-cover"
                    muted
                    aria-label={`Video preview of ${item.name}`}
                  />
                )}
                {item.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/60 p-2">
                    <span className="text-xs font-medium text-white tabular-nums">
                      {item.progress}%
                    </span>
                    <Progress
                      value={item.progress}
                      aria-label={`Uploading ${item.name}`}
                      className="w-full"
                    />
                  </div>
                )}
                {item.status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-destructive/40">
                    <Badge variant="destructive">Failed</Badge>
                  </div>
                )}
                {item.status !== "uploading" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    onClick={() => onRemove(item.key)}
                    aria-label={`Remove ${item.name}`}
                    className="absolute top-1.5 right-1.5 size-6 rounded-full"
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
              <p className="w-28 truncate text-xs text-muted-foreground">
                {item.name} · {formatFileSize(item.size)}
              </p>
              {item.status === "done" && (
                <p className="w-28 text-xs text-muted-foreground">Uploaded</p>
              )}
              {item.status === "error" && item.error && (
                <p className="w-28 text-xs text-destructive">{item.error}</p>
              )}
              {item.status === "error" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-28"
                  disabled={!canRetry || disabled}
                  title={
                    canRetry
                      ? "Retry upload for this file only"
                      : "Save or publish first — retry needs a draft"
                  }
                  onClick={() => void onRetry(item.key)}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Retry
                </Button>
              )}
            </div>
          ))}
              {media.length < maxMedia && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className="h-28 w-28 flex-col border-dashed"
                >
                  <ImagePlusIcon data-icon="inline-start" />
                  Add media
                </Button>
              )}
            </div>
          )}
          {mediaUploadNote && (
            <ErrorBlock title="Media upload" description={mediaUploadNote} />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.m4v,.webm,.mov"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onAddFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
      </div>
    </section>
  );
}
