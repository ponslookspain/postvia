"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { isTikTokReconnectNeeded } from "@/lib/composer-media";
import type { TiktokCreatorInfo } from "./types";

/**
 * Stage H4: TikTok per-target settings moved 1:1 from NewPostComposer
 * (skeleton, privacy Select, interaction switches, cover timestamp,
 * unavailable/reconnect alerts with Retry and Open accounts).
 */
export function TiktokTargetSettings({
  accountId,
  mode,
  creatorInfo,
  creatorInfoError,
  settings,
  onSetting,
  onRetry,
  onOpenAccounts,
}: {
  accountId: string;
  /** Photo posts accept no duet/stitch/cover controls — hide them. */
  mode: "video" | "photo" | "unknown";
  creatorInfo: TiktokCreatorInfo | null | undefined;
  creatorInfoError: string | undefined;
  settings: Record<string, unknown>;
  onSetting: (patch: Record<string, unknown>) => void;
  onRetry: () => void;
  onOpenAccounts: () => void;
}) {
  const info = creatorInfo;
  const privacyOptions =
    info && info.privacyLevelOptions.length > 0
      ? info.privacyLevelOptions
      : ["SELF_ONLY"];
  const currentPrivacy =
    typeof settings.privacy_level === "string"
      ? settings.privacy_level
      : privacyOptions[0];
  const setSetting = (patch: Record<string, unknown>) =>
    onSetting({ ...settings, ...patch });
  const allowToggle = (
    key: "disable_comment" | "disable_duet" | "disable_stitch",
    creatorDisabled: boolean | undefined,
    label: string
  ) => (
    <Field
      orientation="horizontal"
      key={key}
      data-disabled={creatorDisabled || undefined}
    >
      <Switch
        id={`${accountId}-${key}`}
        checked={settings[key] !== true && !creatorDisabled}
        disabled={Boolean(creatorDisabled)}
        onCheckedChange={(checked) =>
          setSetting({
            [key]: !checked,
          })
        }
      />
      <FieldContent>
        <FieldLabel htmlFor={`${accountId}-${key}`}>{label}</FieldLabel>
        {creatorDisabled && (
          <FieldDescription>Off in account privacy settings</FieldDescription>
        )}
      </FieldContent>
    </Field>
  );
  if (info === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  return (
    <>
      {info ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${accountId}-privacy`}>Privacy</FieldLabel>
            <Select
              value={currentPrivacy}
              onValueChange={(value: unknown) =>
                setSetting({
                  privacy_level: String(value),
                })
              }
            >
              <SelectTrigger id={`${accountId}-privacy`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {privacyOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option
                        .replaceAll("_", " ")
                        .toLowerCase()
                        .replace(/^./, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {allowToggle(
            "disable_comment",
            info.commentDisabled,
            "Allow comments"
          )}
          {mode !== "photo" &&
            allowToggle("disable_duet", info.duetDisabled, "Allow Duet")}
          {mode !== "photo" &&
            allowToggle(
              "disable_stitch",
              info.stitchDisabled,
              "Allow Stitch"
            )}
          {mode !== "photo" && (
          <Field>
            <FieldLabel htmlFor={`${accountId}-cover`}>
              Cover timestamp (ms, optional)
            </FieldLabel>
            <input
              id={`${accountId}-cover`}
              type="number"
              min={0}
              step={1000}
              value={
                typeof settings.video_cover_timestamp_ms === "number"
                  ? String(settings.video_cover_timestamp_ms)
                  : ""
              }
              onChange={(event) => {
                const raw = event.target.value;
                setSetting({
                  video_cover_timestamp_ms:
                    raw === ""
                      ? undefined
                      : Math.max(0, Math.floor(Number(raw) || 0)),
                });
              }}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-describedby={`${accountId}-cover-hint`}
            />
            <FieldDescription id={`${accountId}-cover-hint`}>
              Video frame shown as cover, in milliseconds — e.g. 1500 for
              1.5 seconds in. Leave empty for the default cover.
            </FieldDescription>
          </Field>
          )}
          {mode !== "photo" && info.maxVideoPostDurationSec > 0 && (
            <FieldDescription>
              Max video length for this account:{" "}
              {info.maxVideoPostDurationSec}s
            </FieldDescription>
          )}
        </>
      ) : (
        <Alert color="neutral" variant="outline">
          <TriangleAlertIcon />
          <AlertTitle>
            {isTikTokReconnectNeeded(creatorInfoError)
              ? "Reconnect TikTok to set options"
              : "TikTok options unavailable"}
          </AlertTitle>
          <AlertDescription>
            {isTikTokReconnectNeeded(creatorInfoError)
              ? "TikTok access expired or was revoked. Reconnect the account to change privacy and interaction settings."
              : "Could not load this account's TikTok options. Publishing needs live TikTok settings — retry before posting."}
          </AlertDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            {isTikTokReconnectNeeded(creatorInfoError) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenAccounts}
              >
                Open accounts
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                <RotateCcwIcon data-icon="inline-start" />
                Retry
              </Button>
            )}
          </div>
        </Alert>
      )}
    </>
  );
}
