"use client";

import { PencilIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  countCharacters,
  remainingCharacters,
  type ComposerPreviewModel,
} from "@/lib/composer-previews";
import { TiktokTargetSettings } from "./TiktokTargetSettings";
import { PlatformPost } from "./preview/PlatformPost";
import { PreviewValidation } from "./PreviewValidation";
import type { DraftMedia, TiktokCreatorInfo } from "./types";

/**
 * Stage 2B: single platform preview card. Receives a ready-made
 * ComposerPreviewModel and only presents it: the platform mock, the
 * structured validation, the counter row and the unchanged customize
 * editor. No validation, content or account logic lives here.
 */
export function PreviewCard({
  model,
  userName,
  media,
  customText,
  customDescription,
  hasOverride,
  overrideSettings,
  isCustomizing,
  creatorInfo,
  creatorInfoError,
  showTikTokTitleHint,
  disabled,
  onCustomTextChange,
  onCustomDescriptionChange,
  onSettings,
  onRetryCreatorInfo,
  onOpenAccounts,
  onUseGlobal,
  onDone,
  onCustomize,
}: {
  model: ComposerPreviewModel;
  userName: string;
  media: DraftMedia[];
  customText: string | undefined;
  customDescription?: string | undefined;
  hasOverride: boolean;
  overrideSettings: Record<string, unknown>;
  isCustomizing: boolean;
  creatorInfo: TiktokCreatorInfo | null | undefined;
  creatorInfoError: string | undefined;
  showTikTokTitleHint: boolean;
  disabled: boolean;
  onCustomTextChange: (value: string) => void;
  onCustomDescriptionChange?: (value: string) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onRetryCreatorInfo: () => void;
  onOpenAccounts: () => void;
  onUseGlobal: () => void;
  onDone: () => void;
  onCustomize: () => void;
}) {
  const remainingLabel =
    remainingCharacters(model.text, model.maxLength) +
    " characters remaining of " +
    model.maxLength +
    " for " +
    model.label;
  return (
    <div key={model.accountId} className="flex min-w-0 flex-col gap-3">
      {(model.customized || model.hasSettingsOverride || model.inheritsGlobal) && (
        <div className="flex items-center justify-end gap-2">
          {model.customized && <Badge variant="secondary">Custom</Badge>}
          {model.hasSettingsOverride && (
            <Badge variant="outline">Settings</Badge>
          )}
          {model.inheritsGlobal && (
            <span className="text-xs text-muted-foreground">
              Using global content
            </span>
          )}
        </div>
      )}
      {isCustomizing ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <FieldGroup className="gap-3">
          {model.platform === "TIKTOK" ? (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">TikTok</p>
                <p className="text-xs text-muted-foreground">
                  These fields apply only to TikTok. Other platforms use
                  the post content above.
                </p>
              </div>
              <Field data-invalid={model.overLimit || undefined}>
                <FieldLabel htmlFor={`custom-${model.accountId}`}>
                  Title
                </FieldLabel>
                <Textarea
                  id={`custom-${model.accountId}`}
                  value={customText ?? model.text}
                  rows={model.tiktokMode === "photo" ? 2 : 4}
                  placeholder={
                    model.tiktokMode === "photo"
                      ? "Short title for the photo post"
                      : "Caption shown with the video"
                  }
                  aria-invalid={model.overLimit || undefined}
                  onChange={(event) => onCustomTextChange(event.target.value)}
                />
                <FieldDescription aria-label={remainingLabel}>
                  {countCharacters(customText ?? model.text)} /{" "}
                  {model.maxLength}
                </FieldDescription>
                {model.overLimit && (
                  <FieldError>
                    Exceeds the {model.maxLength} character limit for{" "}
                    {model.label}
                  </FieldError>
                )}
              </Field>
              {model.tiktokMode === "photo" && (
                <Field
                  data-invalid={
                    countCharacters(customDescription ?? model.description) >
                      model.descriptionMaxLength || undefined
                  }
                >
                  <FieldLabel htmlFor={`custom-desc-${model.accountId}`}>
                    Description
                  </FieldLabel>
                  <Textarea
                    id={`custom-desc-${model.accountId}`}
                    value={customDescription ?? model.description}
                    rows={4}
                    placeholder="Hashtags and details for the photo post"
                    aria-invalid={
                      countCharacters(customDescription ?? model.description) >
                        model.descriptionMaxLength || undefined
                    }
                    onChange={(event) =>
                      onCustomDescriptionChange?.(event.target.value)
                    }
                  />
                  <FieldDescription
                    aria-label={`${remainingCharacters(customDescription ?? model.description, model.descriptionMaxLength)} characters remaining of ${model.descriptionMaxLength} for the TikTok description`}
                  >
                    {countCharacters(customDescription ?? model.description)} /{" "}
                    {model.descriptionMaxLength}
                  </FieldDescription>
                  {countCharacters(customDescription ?? model.description) >
                    model.descriptionMaxLength && (
                    <FieldError>
                      Exceeds the {model.descriptionMaxLength} character limit
                      for the TikTok description
                    </FieldError>
                  )}
                </Field>
              )}
            </>
          ) : (
            <Field data-invalid={model.overLimit || undefined}>
              <FieldLabel htmlFor={`custom-${model.accountId}`}>
                {`Text for ${model.label}`}
              </FieldLabel>
              <Textarea
                id={`custom-${model.accountId}`}
                value={customText ?? model.text}
                rows={4}
                placeholder={`Text for ${model.label}`}
                aria-invalid={model.overLimit || undefined}
                onChange={(event) => onCustomTextChange(event.target.value)}
              />
              <FieldDescription aria-label={remainingLabel}>
                {countCharacters(model.text)} / {model.maxLength}
              </FieldDescription>
              {model.overLimit && (
                <FieldError>
                  Exceeds the {model.maxLength} character limit for{" "}
                  {model.label}
                </FieldError>
              )}
            </Field>
          )}
          {model.platform === "TIKTOK" && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-sm font-medium">Settings</p>
              <TiktokTargetSettings
                accountId={model.accountId}
                mode={model.tiktokMode}
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
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <PlatformPost model={model} userName={userName} media={media} />
          <PreviewValidation validation={model.validation} />
          <div className="flex items-center justify-between gap-2">
            <FieldDescription aria-label={remainingLabel}>
              {countCharacters(model.text)} / {model.maxLength}
            </FieldDescription>
            {model.customized && (
              <Badge variant="secondary">
                {model.platform === "TIKTOK" ? "custom" : "custom text"}
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onCustomize}
            >
              <PencilIcon data-icon="inline-start" />
              {model.customized ? `Edit for ${model.label}` : "Customize"}
            </Button>
          </div>
          {showTikTokTitleHint && (
            <FieldDescription>
              TikTok ignores the text above and posts its own title — use
              Customize to set it.
            </FieldDescription>
          )}
        </div>
      )}
    </div>
  );
}
