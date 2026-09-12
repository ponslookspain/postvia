"use client";

import { PencilIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  countCharacters,
  remainingCharacters,
} from "@/lib/composer-previews";
import type { ComposerPreview } from "@/lib/composer-previews";
import { TiktokTargetSettings } from "./TiktokTargetSettings";
import type { DraftMedia, TiktokCreatorInfo } from "./types";

/**
 * Stage H5: one platform preview card moved 1:1 from NewPostComposer
 * (header, customize editor incl. TikTok settings, read view with
 * counters, TikTok title hint and over-limit error).
 * Stage I: counters expose remaining characters to screen readers.
 */
export function PreviewCard({
  preview,
  userName,
  media,
  customText,
  hasOverride,
  overrideSettings,
  isCustomizing,
  creatorInfo,
  creatorInfoError,
  showTikTokTitleHint,
  disabled,
  onCustomTextChange,
  onSettings,
  onRetryCreatorInfo,
  onOpenAccounts,
  onUseGlobal,
  onDone,
  onCustomize,
}: {
  preview: ComposerPreview;
  userName: string;
  media: DraftMedia[];
  customText: string | undefined;
  hasOverride: boolean;
  overrideSettings: Record<string, unknown>;
  isCustomizing: boolean;
  creatorInfo: TiktokCreatorInfo | null | undefined;
  creatorInfoError: string | undefined;
  showTikTokTitleHint: boolean;
  disabled: boolean;
  onCustomTextChange: (value: string) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onRetryCreatorInfo: () => void;
  onOpenAccounts: () => void;
  onUseGlobal: () => void;
  onDone: () => void;
  onCustomize: () => void;
}) {
  const remainingLabel =
    remainingCharacters(preview.text, preview.maxLength) +
    " characters remaining of " +
    preview.maxLength +
    " for " +
    preview.label;
  return (
    <div
      key={preview.accountId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback aria-label={preview.label}>
            <span className="flex size-4 items-center justify-center [&_svg]:size-4">
              <PlatformIcon platform={preview.platform} />
            </span>
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {preview.label} · @{preview.username}
          </p>
        </div>
        {preview.customized && <Badge variant="secondary">Custom</Badge>}
      </div>
      <Separator />
      {isCustomizing ? (
        <FieldGroup className="gap-3">
          <Field data-invalid={preview.overLimit || undefined}>
            <FieldLabel htmlFor={`custom-${preview.accountId}`}>
              {preview.platform === "TIKTOK"
                ? "Title / caption for TikTok"
                : `Text for ${preview.label}`}
            </FieldLabel>
            <Textarea
              id={`custom-${preview.accountId}`}
              value={customText ?? preview.text}
              rows={4}
              placeholder={
                preview.platform === "TIKTOK"
                  ? "Title / caption for TikTok"
                  : `Text for ${preview.label}`
              }
              aria-invalid={preview.overLimit || undefined}
              onChange={(event) => onCustomTextChange(event.target.value)}
            />
            <FieldDescription aria-label={remainingLabel}>
              {countCharacters(preview.text)} / {preview.maxLength}
            </FieldDescription>
            {preview.overLimit && (
              <FieldError>
                Exceeds the {preview.maxLength} character limit for{" "}
                {preview.label}
              </FieldError>
            )}
          </Field>
          {preview.platform === "TIKTOK" && (
            <div className="flex flex-col gap-3">
              <TiktokTargetSettings
                accountId={preview.accountId}
                creatorInfo={creatorInfo}
                creatorInfoError={creatorInfoError}
                settings={overrideSettings}
                onSetting={onSettings}
                onRetry={onRetryCreatorInfo}
                onOpenAccounts={onOpenAccounts}
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            {hasOverride && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onUseGlobal}
              >
                Use global
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Done
            </Button>
          </div>
        </FieldGroup>
      ) : (
        <div className="flex flex-col gap-2">
          {media.length > 0 && (
            <div className="flex gap-1.5">
              {media.slice(0, 4).map((item) =>
                item.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={item.key}
                    src={item.previewUrl}
                    alt={item.name}
                    className="size-10 rounded border object-cover"
                  />
                ) : (
                  <video
                    key={item.key}
                    src={item.previewUrl}
                    muted
                    aria-label={"Video preview of " + item.name}
                    className="size-10 rounded border object-cover"
                  />
                )
              )}
            </div>
          )}
          <p className="text-sm break-words whitespace-pre-wrap">
            {preview.text || (
              <span className="text-muted-foreground">
                Your post will appear here...
              </span>
            )}
          </p>
          <div className="flex items-center justify-between gap-2">
            <FieldDescription aria-label={remainingLabel}>
              {countCharacters(preview.text)} / {preview.maxLength}
            </FieldDescription>
            {preview.customized && (
              <Badge variant="secondary">custom text</Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onCustomize}
            >
              <PencilIcon data-icon="inline-start" />
              {preview.customized ? `Edit for ${preview.label}` : "Customize"}
            </Button>
          </div>
          {showTikTokTitleHint && (
            <FieldDescription>
              TikTok ignores the text above and posts its own title — use
              Customize to set it.
            </FieldDescription>
          )}
          {preview.overLimit && (
            <FieldError>
              Exceeds the {preview.maxLength} character limit for{" "}
              {preview.label}. Click Customize to shorten it just for this
              platform.
            </FieldError>
          )}
        </div>
      )}
    </div>
  );
}
