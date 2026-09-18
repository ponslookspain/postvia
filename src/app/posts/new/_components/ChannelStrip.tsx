"use client";

import Link from "next/link";
import { InfoIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/PlatformIcon";
import { EmptyBlock } from "@/components/StateBlock";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ConnectedAccount,
  TargetOverrideState,
} from "./types";
import type { Platform } from "@prisma/client";
import { getPlatformCapabilities } from "@/lib/platforms/capabilities";

function platformName(platform: string): string {
  return getPlatformCapabilities(platform as Platform)?.label ?? platform;
}

/**
 * Compact channel selector: one avatar toggle per connected account.
 * Same selection semantics as the former AccountList tile grid —
 * `onToggle` fires identically, unimplemented accounts stay disabled,
 * and the `Customized` state still reflects targetOverrides.
 */
export function ChannelStrip({
  accounts,
  selectedAccountIds,
  targetOverrides,
  disabled,
  mediaErrors,
  onToggle,
}: {
  accounts: ConnectedAccount[];
  selectedAccountIds: string[];
  targetOverrides: TargetOverrideState;
  disabled: boolean;
  mediaErrors: string[];
  onToggle: (accountId: string, checked: boolean) => void;
}) {
  return (
    <section aria-labelledby="composer-channels">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2
          id="composer-channels"
          className="text-lg font-medium tracking-tight"
        >
          Channels
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {selectedAccountIds.length > 0 && (
            <Badge variant="soft" className="tabular-nums">
              {selectedAccountIds.length} selected
            </Badge>
          )}
          <Button
            variant="link"
            size="sm"
            asChild
            className="h-auto p-0 text-label"
          >
            <Link href="/accounts">Manage</Link>
          </Button>
        </div>
      </div>
      {accounts.length === 0 ? (
        <EmptyBlock
          icon={<UsersIcon />}
          title="No connected accounts"
          description="Connect a social account before creating a post."
          actions={
            <Button size="sm" asChild>
              <Link href="/accounts">
                <UsersIcon data-icon="inline-start" />
                Connect account
              </Link>
            </Button>
          }
        />
      ) : (
        <div
          role="group"
          aria-label="Publish to"
          className="flex items-center gap-3 overflow-x-auto px-1 py-1"
        >
          {accounts.map((account) => {
            const selected = selectedAccountIds.includes(account.id);
            const accountDisabled = !account.implemented;
            const overrideEntry = targetOverrides[account.id];
            const customized = Boolean(
              overrideEntry &&
                (overrideEntry.text ||
                  overrideEntry.title ||
                  overrideEntry.description ||
                  (overrideEntry.settings &&
                    Object.keys(overrideEntry.settings).length > 0))
            );
            const label = `${platformName(account.platform)} @${account.username}`;
            return (
              <Tooltip key={account.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${label}${selected ? ", selected" : ""}${customized ? ", customized" : ""}${accountDisabled ? ", coming soon" : ""}`}
                    disabled={accountDisabled || disabled}
                    onClick={() => onToggle(account.id, !selected)}
                    className={cn(
                      "relative shrink-0 rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                      !selected && !accountDisabled && "opacity-55 hover:opacity-100"
                    )}
                  >
                    <Avatar
                      size="40"
                      className={cn(
                        "size-11",
                        selected &&
                          !accountDisabled &&
                          "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                    >
                      <AvatarFallback
                        className={cn(
                          selected && !accountDisabled
                            ? "bg-primary-soft text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <PlatformIcon platform={account.platform} className="size-5" />
                      </AvatarFallback>
                      {selected && customized && (
                        <AvatarBadge
                          aria-hidden="true"
                          className="bg-primary text-primary-foreground"
                        />
                      )}
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {label}
                  {customized ? " · Customized" : ""}
                  {accountDisabled ? " · Coming soon" : ""}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
      {accounts.length > 0 && selectedAccountIds.length === 0 && (
        <FieldError className="mt-2">
          Select at least one connected account.
        </FieldError>
      )}
      {mediaErrors.length > 0 && (
        <Alert color="neutral" variant="outline" className="mt-3">
          <InfoIcon />
          <AlertContent>
            <AlertTitle>Media requirements</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {mediaErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </section>
  );
}
