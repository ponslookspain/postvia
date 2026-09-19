"use client";

import { PencilIcon } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ComposerPreviewModel } from "@/lib/composer-previews";
import { TargetCustomizer } from "./TargetCustomizer";
import type {
  ConnectedAccount,
  TargetOverrideState,
  TiktokCreatorInfo,
} from "./types";

/**
 * Per-channel customization in the center workspace. One row per
 * selected account: collapsed rows offer a single Customize action,
 * expanded rows (or rows already carrying overrides) render the
 * TargetCustomizer editor. Presentational only — override state and
 * TikTok creator info stay in NewPostComposer.
 */
export function ChannelCustomizer({
  selectedAccounts,
  previewModels,
  targetOverrides,
  customizingIds,
  creatorInfos,
  creatorInfoErrors,
  disabled,
  onExpand,
  onCollapse,
  onClearOverride,
  onCustomTextChange,
  onCustomDescriptionChange,
  onSettings,
  onRetryCreatorInfo,
  onOpenAccounts,
}: {
  selectedAccounts: ConnectedAccount[];
  previewModels: ComposerPreviewModel[];
  targetOverrides: TargetOverrideState;
  customizingIds: string[];
  creatorInfos: Record<string, TiktokCreatorInfo | null | undefined>;
  creatorInfoErrors: Record<string, string | undefined>;
  disabled: boolean;
  onExpand: (accountId: string) => void;
  onCollapse: (accountId: string) => void;
  onClearOverride: (accountId: string) => void;
  onCustomTextChange: (
    accountId: string,
    platform: ConnectedAccount["platform"],
    value: string
  ) => void;
  onCustomDescriptionChange: (accountId: string, value: string) => void;
  onSettings: (accountId: string, patch: Record<string, unknown>) => void;
  onRetryCreatorInfo: (accountId: string) => void;
  onOpenAccounts: () => void;
}) {
  if (selectedAccounts.length === 0) return null;
  return (
    <section aria-labelledby="composer-customize">
      <div className="mb-2">
        <h2
          id="composer-customize"
          className="text-lg font-medium tracking-tight"
        >
          Customize per channel
        </h2>
        <p className="mt-1 max-w-[60ch] text-sm leading-5 text-muted-foreground">
          Optional. Channels without overrides publish the post content
          above.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {selectedAccounts.map((account) => {
          const model = previewModels.find(
            (item) => item.accountId === account.id
          );
          if (!model) return null;
          const override = targetOverrides[account.id];
          const hasOverride = Boolean(override);
          const expanded =
            customizingIds.includes(account.id) || hasOverride;
          return (
            <div key={account.id}>
              {!expanded ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
                  <p className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground"
                    >
                      <PlatformIcon
                        platform={account.platform}
                        className="size-4"
                      />
                    </span>
                    <span className="truncate font-medium">{model.label}</span>
                    <span className="truncate text-muted-foreground">
                      @{account.username}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onExpand(account.id)}
                    className="shrink-0"
                  >
                    <PencilIcon data-icon="inline-start" />
                    Customize
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                      >
                        <PlatformIcon
                          platform={account.platform}
                          className="size-4"
                        />
                      </span>
                      <span className="truncate font-medium">
                        {model.label}
                      </span>
                      <span className="truncate text-muted-foreground">
                        @{account.username}
                      </span>
                    </p>
                    {hasOverride && (
                      <Badge variant="soft" className="shrink-0">
                        Customized
                      </Badge>
                    )}
                  </div>
                  <TargetCustomizer
                    model={model}
                    customText={
                      account.platform === "TIKTOK"
                        ? override?.title
                        : override?.text
                    }
                    customDescription={
                      account.platform === "TIKTOK"
                        ? override?.description
                        : undefined
                    }
                    hasOverride={hasOverride}
                    overrideSettings={override?.settings ?? {}}
                    creatorInfo={creatorInfos[account.id]}
                    creatorInfoError={creatorInfoErrors[account.id]}
                    anchorId={`customize-${account.id}`}
                    onCustomTextChange={(value) =>
                      onCustomTextChange(account.id, account.platform, value)
                    }
                    onCustomDescriptionChange={(value) =>
                      onCustomDescriptionChange(account.id, value)
                    }
                    onSettings={(patch) => onSettings(account.id, patch)}
                    onRetryCreatorInfo={() => onRetryCreatorInfo(account.id)}
                    onOpenAccounts={onOpenAccounts}
                    onUseGlobal={() => onClearOverride(account.id)}
                    onDone={() => onCollapse(account.id)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
