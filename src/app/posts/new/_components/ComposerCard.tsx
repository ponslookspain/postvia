"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MediaGrid } from "./MediaGrid";
import type { DraftMedia } from "./types";

/**
 * The dominant writing surface: editor on top, media attached directly
 * below it inside the same card, so attachments read as part of the
 * post rather than a separate step. Presentational only — text, media
 * and validation state stay in NewPostComposer.
 */
export function ComposerCard({
  text,
  onTextChange,
  charCount,
  hasOverLimit,
  overLimitLabels,
  media,
  maxMedia,
  disabled,
  mediaUploadNote,
  canRetry,
  onAddFiles,
  onRemove,
  onRetry,
}: {
  text: string;
  onTextChange: (value: string) => void;
  charCount: number;
  hasOverLimit: boolean;
  overLimitLabels: string[];
  media: DraftMedia[];
  maxMedia: number;
  disabled: boolean;
  mediaUploadNote: string | null;
  canRetry: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <section aria-labelledby="composer-content">
          <div className="mb-2 flex items-start justify-between gap-4">
            <div>
              <h2
                id="composer-content"
                className="text-lg font-medium tracking-tight"
              >
                Post content
              </h2>
              <p className="mt-1 max-w-[60ch] text-sm leading-5 text-muted-foreground">
                Used by every selected platform unless customized, including
                TikTok
              </p>
            </div>
            <Badge
              variant={hasOverLimit ? "destructive" : "secondary"}
              className="shrink-0 tabular-nums"
            >
              {charCount} chars
            </Badge>
          </div>
          <Field data-invalid={hasOverLimit || undefined}>
            <FieldLabel htmlFor="composer-text" className="sr-only">
              Post content
            </FieldLabel>
            <Textarea
              id="composer-text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Write something worth publishing..."
              rows={6}
              aria-invalid={hasOverLimit || undefined}
              className="min-h-40 border-0 bg-muted/40 px-4 text-[15px] leading-relaxed shadow-none focus-visible:ring-2"
            />
            {hasOverLimit ? (
              <FieldError>
                Too long for {overLimitLabels.join(", ")}. Shorten the text
                or customize it per channel below.
              </FieldError>
            ) : (
              <FieldDescription>
                Keep it short — each platform has its own character limit.
              </FieldDescription>
            )}
          </Field>
        </section>
        <Separator />
        <MediaGrid
          media={media}
          maxMedia={maxMedia}
          disabled={disabled}
          mediaUploadNote={mediaUploadNote}
          canRetry={canRetry}
          onAddFiles={onAddFiles}
          onRemove={onRemove}
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  );
}
