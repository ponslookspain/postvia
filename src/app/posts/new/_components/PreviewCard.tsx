"use client";

import { PencilIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import {
  countCharacters,
  type ComposerPreviewModel,
} from "@/lib/composer-previews";
import { PlatformPost } from "./preview/PlatformPost";
import { PreviewValidation } from "./PreviewValidation";
import { TargetCustomizer } from "./TargetCustomizer";
import type { DraftMedia, TiktokCreatorInfo } from "./types";

/**
 * Stage 2B: single platform preview card. Receives a ready-made
 * ComposerPreviewModel and only presents it: the platform mock, the
 * structured validation and the counter row. The override editor lives
 * in TargetCustomizer (rendered here only when isCustomizing, otherwise
 * in the center workspace) — the rail itself stays read-only.
 * Editor-only callbacks are optional because read-only callers never
 * invoke them. No validation, content or account logic lives here.
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
  creatorInfo?: TiktokCreatorInfo | null | undefined;
  creatorInfoError?: string | undefined;
  disabled: boolean;
  onCustomTextChange?: (value: string) => void;
  onCustomDescriptionChange?: (value: string) => void;
  onSettings?: (patch: Record<string, unknown>) => void;
  onRetryCreatorInfo?: () => void;
  onOpenAccounts?: () => void;
  onUseGlobal?: () => void;
  onDone?: () => void;
  onCustomize: () => void;
}) {
  return (
    <div key={model.accountId} className="flex min-w-0 flex-col gap-3">
      {(model.customized || model.hasSettingsOverride || model.inheritsGlobal) && (
        <div className="flex items-center justify-end gap-2">
          {model.customized && <Badge variant="soft">Custom</Badge>}
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
        <TargetCustomizer
          model={model}
          customText={customText}
          customDescription={customDescription}
          hasOverride={hasOverride}
          overrideSettings={overrideSettings}
          creatorInfo={creatorInfo}
          creatorInfoError={creatorInfoError}
          onCustomTextChange={(value) => onCustomTextChange?.(value)}
          onCustomDescriptionChange={onCustomDescriptionChange}
          onSettings={(patch) => onSettings?.(patch)}
          onRetryCreatorInfo={() => onRetryCreatorInfo?.()}
          onOpenAccounts={() => onOpenAccounts?.()}
          onUseGlobal={() => onUseGlobal?.()}
          onDone={() => onDone?.()}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <PlatformPost model={model} userName={userName} media={media} />
          <PreviewValidation validation={model.validation} />
          <div className="flex items-center justify-between gap-2">
            <FieldDescription>
              {countCharacters(model.text)} / {model.maxLength}
            </FieldDescription>
            {model.customized && (
              <Badge variant="soft">
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
        </div>
      )}
    </div>
  );
}
