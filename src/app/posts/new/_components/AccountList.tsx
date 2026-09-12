import { UsersIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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

export function AccountList({
  accounts,
  selectedAccountIds,
  targetOverrides,
  mediaAttached,
  disabled,
  mediaErrors,
  onToggle,
}: {
  accounts: ConnectedAccount[];
  selectedAccountIds: string[];
  targetOverrides: TargetOverrideState;
  mediaAttached: boolean;
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
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>No connected accounts</EmptyTitle>
              <EmptyDescription>
                Connect a social account before creating a post.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <FieldSet>
            <FieldLegend variant="label" className="sr-only">
              Publish to
            </FieldLegend>
            <FieldGroup className="gap-2">
              {accounts.map((account) => {
                const selected = selectedAccountIds.includes(account.id);
                const blockedByMedia =
                  mediaAttached && account.platform === "X";
                const accountDisabled =
                  !account.implemented || blockedByMedia;
                const overrideEntry = targetOverrides[account.id];
                const customized = Boolean(
                  overrideEntry &&
                    (overrideEntry.text ||
                      overrideEntry.title ||
                      (overrideEntry.settings &&
                        Object.keys(overrideEntry.settings).length > 0))
                );
                return (
                  <Field
                    key={account.id}
                    orientation="horizontal"
                    data-disabled={accountDisabled || undefined}
                  >
                    <Checkbox
                      id={`account-${account.id}`}
                      checked={selected}
                      disabled={accountDisabled || disabled}
                      onCheckedChange={(checked) =>
                        onToggle(account.id, checked === true)
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`account-${account.id}`}>
                        {account.platform} @{account.username}
                      </FieldLabel>
                      {!account.implemented && (
                        <FieldDescription>Coming soon</FieldDescription>
                      )}
                      {account.implemented && blockedByMedia && (
                        <FieldDescription>
                          X media publishing is not available
                        </FieldDescription>
                      )}
                    </FieldContent>
                    {selected && customized && (
                      <Badge variant="secondary">Customized</Badge>
                    )}
                    {!account.implemented && (
                      <Badge variant="outline">Soon</Badge>
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
        {mediaErrors.map((message) => (
          <Alert key={message} variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Media not supported</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ))}
      </div>
    </section>
  );
}
