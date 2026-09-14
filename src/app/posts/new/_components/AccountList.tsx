import Link from "next/link";
import { InfoIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { PlatformIcon } from "@/components/PlatformIcon";
import { EmptyBlock } from "@/components/StateBlock";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type {
  ConnectedAccount,
  TargetOverrideState,
} from "./types";

const PLATFORM_NAMES: Record<string, string> = {
  THREADS: "Threads",
  X: "X",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};

function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

export function AccountList({
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
    <section aria-labelledby="composer-targets">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="composer-targets" className="text-lg font-medium">
            Publish to
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select at least one connected account
          </p>
        </div>
        <Badge variant="secondary">
          {selectedAccountIds.length} selected
        </Badge>
      </div>
      <div className="flex flex-col gap-3">
        {accounts.length === 0 ? (
          <EmptyBlock
            icon={<UsersIcon />}
            title="No connected accounts"
            description="Connect a social account before creating a post."
            actions={
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/accounts" />}
              >
                <UsersIcon data-icon="inline-start" />
                Connect account
              </Button>
            }
          />
        ) : (
          <FieldSet>
            <FieldLegend variant="label" className="sr-only">
              Publish to
            </FieldLegend>
            <FieldGroup className="gap-2 sm:grid sm:grid-cols-2">
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
                return (
                  <Field
                    key={account.id}
                    orientation="horizontal"
                    data-disabled={accountDisabled || undefined}
                    onClick={(event) => {
                      // The whole tile toggles with the same handler. Clicks
                      // that already toggled via the label/checkbox are
                      // ignored so selection never flips twice.
                      if (accountDisabled || disabled) return;
                      const target = event.target as HTMLElement | null;
                      if (
                        target?.closest?.(
                          'label, [data-slot="checkbox"]'
                        )
                      ) {
                        return;
                      }
                      onToggle(account.id, !selected);
                    }}
                    className={cn(
                      "rounded-xl border border-border bg-card p-3 transition-colors",
                      !accountDisabled &&
                        !disabled &&
                        "cursor-pointer hover:border-foreground/25 hover:bg-muted/40 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                      selected &&
                        !accountDisabled &&
                        "border-signal/60 bg-signal/[0.05] hover:border-signal/60 hover:bg-signal/[0.05]",
                      accountDisabled && "opacity-70"
                    )}
                  >
                    <Checkbox
                      id={`account-${account.id}`}
                      checked={selected}
                      disabled={accountDisabled || disabled}
                      onCheckedChange={(checked) =>
                        onToggle(account.id, checked === true)
                      }
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-9 shrink-0 self-center items-center justify-center rounded-lg",
                        selected && !accountDisabled
                          ? "bg-signal/10 text-signal"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <PlatformIcon
                        platform={account.platform}
                        className="size-5"
                      />
                    </span>
                    <FieldContent className="self-center">
                      <FieldLabel htmlFor={`account-${account.id}`}>
                        {platformName(account.platform)}{" "}
                        <span className="font-normal text-muted-foreground">
                          @{account.username}
                        </span>
                      </FieldLabel>
                      {!account.implemented && (
                        <FieldDescription>Coming soon</FieldDescription>
                      )}
                    </FieldContent>
                    {selected && customized && (
                      <Badge variant="secondary" className="self-center">
                        Customized
                      </Badge>
                    )}
                    {!account.implemented && (
                      <Badge variant="outline" className="self-center">
                        Soon
                      </Badge>
                    )}
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
        )}
        {accounts.length > 0 && selectedAccountIds.length === 0 && (
          <FieldError>Select at least one connected account.</FieldError>
        )}
        {mediaErrors.length > 0 && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Media requirements</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {mediaErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  );
}
