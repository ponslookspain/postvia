"use client";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { TextArea } from "@/components/ui/text-area";
import {
  countCharacters,
  type ComposerPreviewModel,
} from "@/lib/composer-previews";
import { TiktokTargetSettings } from "./TiktokTargetSettings";
import type { TiktokCreatorInfo } from "./types";

/**
 * Per-channel override editor, extracted verbatim from PreviewCard's
 * customizing branch. Renders in the center workspace so the preview
 * rail can stay read-only. No validation, content or account logic
 * lives here — everything arrives as props.
 */
export function TargetCustomizer({
  model,
  customText,
  customDescription,
  hasOverride,
  overrideSettings,
  creatorInfo,
  creatorInfoError,
  anchorId,
  onCustomTextChange,
  onCustomDescriptionChange,
  onSettings,
  onRetryCreatorInfo,
  onOpenAccounts,
  onUseGlobal,
  onDone,
}: {
  model: ComposerPreviewModel;
  customText: string | undefined;
  customDescription?: string | undefined;
  hasOverride: boolean;
  overrideSettings: Record<string, unknown>;
  creatorInfo: TiktokCreatorInfo | null | undefined;
  creatorInfoError: string | undefined;
  anchorId?: string;
  onCustomTextChange: (value: string) => void;
  onCustomDescriptionChange?: (value: string) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onRetryCreatorInfo: () => void;
  onOpenAccounts: () => void;
  onUseGlobal: () => void;
  onDone: () => void;
}) {
  return (
    <div id={anchorId} className="scroll-mt-24 rounded-lg bg-muted p-3">
      <FieldGroup className="gap-3">
        {model.platform === "TIKTOK" ? (
          <>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">TikTok</p>
                <p className="text-xs text-muted-foreground">
                  Optional. Empty fields use your post text as the TikTok
                  caption. Other platforms always use the post content
                  above.
                </p>
              </div>
              <Field data-invalid={model.overLimit || undefined}>
                <FieldLabel htmlFor={`custom-${model.accountId}`}>
                  Custom title
                </FieldLabel>
                <TextArea
                  id={`custom-${model.accountId}`}
                  value={customText ?? model.text}
                  rows={model.tiktokMode === "photo" ? 2 : 4}
                  placeholder={
                    model.tiktokMode === "photo"
                      ? "Short title for the photo post (optional)"
                      : "Leave empty to use your post text as the caption"
                  }
                aria-invalid={model.overLimit || undefined}
                aria-describedby={`custom-${model.accountId}-count`}
                onChange={(event) => onCustomTextChange(event.target.value)}
              />
              <FieldDescription
                id={`custom-${model.accountId}-count`}
                role="status"
              >
                {countCharacters(customText ?? model.text)} / {model.maxLength}
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
                <TextArea
                  id={`custom-desc-${model.accountId}`}
                  value={customDescription ?? model.description}
                  rows={4}
                  placeholder="Hashtags and details for the photo post"
                  aria-invalid={
                    countCharacters(customDescription ?? model.description) >
                      model.descriptionMaxLength || undefined
                  }
                  aria-describedby={`custom-desc-${model.accountId}-count`}
                  onChange={(event) =>
                    onCustomDescriptionChange?.(event.target.value)
                  }
                />
                <FieldDescription
                  id={`custom-desc-${model.accountId}-count`}
                  role="status"
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
            <TextArea
              id={`custom-${model.accountId}`}
              value={customText ?? model.text}
              rows={4}
              placeholder={`Text for ${model.label}`}
              aria-invalid={model.overLimit || undefined}
              aria-describedby={`custom-${model.accountId}-count`}
              onChange={(event) => onCustomTextChange(event.target.value)}
            />
            <FieldDescription
              id={`custom-${model.accountId}-count`}
              role="status"
            >
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
  );
}
