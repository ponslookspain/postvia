"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { parsePlanParam } from "@/lib/plans";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusDot } from "@/components/StatusBadge";
import { ErrorBlock } from "@/components/StateBlock";
import { UpgradeCta } from "@/components/billing/BillingWidgets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface PlatformAccount {
  id: string;
  platform: string;
  externalId: string;
  username: string;
  createdAt: string;
  expiresAt: string | null;
}

interface PlatformConfig {
  platform: string;
  name: string;
  blurb: string;
  connectLabel: string;
  connectEndpoint: string;
  disconnectEndpoint: string;
  multi: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  {
    platform: "THREADS",
    name: "Threads",
    blurb: "Text posts and replies on Threads",
    connectLabel: "Connect Threads",
    connectEndpoint: "/api/auth/threads/connect",
    disconnectEndpoint: "/api/accounts/threads",
    multi: true,
  },
  {
    platform: "X",
    name: "X (Twitter)",
    blurb: "Short posts on X",
    connectLabel: "Connect X",
    connectEndpoint: "/api/auth/x/connect",
    disconnectEndpoint: "/api/accounts/x",
    multi: true,
  },
  {
    platform: "TIKTOK",
    name: "TikTok",
    blurb: "Vertical video on TikTok",
    connectLabel: "Connect TikTok",
    connectEndpoint: "/api/auth/tiktok/connect",
    disconnectEndpoint: "/api/accounts/tiktok",
    multi: true,
  },
  {
    platform: "INSTAGRAM",
    name: "Instagram",
    blurb: "Photos and reels on Instagram",
    connectLabel: "Connect Instagram",
    connectEndpoint: "/api/auth/instagram/connect",
    disconnectEndpoint: "/api/accounts/instagram",
    multi: true,
  },
];

function getSearchParamMessage(searchParams: URLSearchParams): {
  text: string;
  error: boolean;
  upgradeTo?: string | null;
} | null {
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected) return { text: "Account connected successfully", error: false };
  if (error) {
    if (error === "account_limit_reached") {
      const upgradeTo = searchParams.get("upgradeTo");
      return {
        text: "Account limit reached for this platform on your current plan.",
        error: true,
        upgradeTo: parsePlanParam(upgradeTo),
      };
    }
    const errors: Record<string, string> = {
      access_denied: "Authorization was denied by the user",
      invalid_state: "Invalid OAuth state. Please try again.",
      invalid_session: "Session expired. Please try again.",
      missing_parameters: "Missing authorization parameters",
      instagram_personal_account:
        "Only Instagram Business or Creator accounts can be connected.",
      instagram_callback_failed: "Instagram connection failed. Please try again.",
      tiktok_callback_failed: "TikTok connection failed. Please try again.",
    };
    return { text: errors[error] || "Connection failed. Please try again.", error: true };
  }
  return null;
}

type PendingDisconnect = {
  config: PlatformConfig;
  account: PlatformAccount;
} | null;

function isExpired(account: PlatformAccount | null | undefined): boolean {
  if (!account?.expiresAt) return false;
  return new Date(account.expiresAt).getTime() <= Date.now();
}

function accountInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || "?";
}

export default function AccountsContent({
  xAccounts: initialXAccounts,
  threadsAccounts: initialThreadsAccounts,
  tiktokAccounts: initialTiktokAccounts,
  instagramAccounts: initialInstagramAccounts,
  accountsLimit,
}: {
  xAccounts: PlatformAccount[];
  threadsAccounts: PlatformAccount[];
  tiktokAccounts: PlatformAccount[];
  instagramAccounts: PlatformAccount[];
  /** Max accounts per platform on the current plan (null = unlimited). */
  accountsLimit: number | null;
}) {
  const searchParams = useSearchParams();
  const [multiAccounts, setMultiAccounts] = useState<
    Record<string, PlatformAccount[]>
  >({
    X: initialXAccounts,
    THREADS: initialThreadsAccounts,
    TIKTOK: initialTiktokAccounts,
    INSTAGRAM: initialInstagramAccounts,
  });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
    upgradeTo?: string | null;
  } | null>(() => getSearchParamMessage(searchParams));
  const [pendingDisconnect, setPendingDisconnect] =
    useState<PendingDisconnect>(null);

  function accountsFor(config: PlatformConfig): PlatformAccount[] {
    if (!config.multi) {
      return multiAccounts[config.platform] ?? [];
    }
    return multiAccounts[config.platform] ?? [];
  }

  async function handleConnect(config: PlatformConfig) {
    setConnecting(config.platform);
    try {
      const res = await fetch(config.connectEndpoint);
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      } else {
        setMessage({
          text: data.error || "Failed to initiate connection",
          error: true,
        });
        setConnecting(null);
      }
    } catch {
      setMessage({ text: "Failed to connect. Please try again.", error: true });
      setConnecting(null);
    }
  }

  async function runDisconnectMulti(
    config: PlatformConfig,
    account: PlatformAccount
  ) {
    setDisconnecting(account.id);
    try {
      const res = await fetch(
        `${config.disconnectEndpoint}?accountId=${encodeURIComponent(account.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setMultiAccounts((current) => ({
          ...current,
          [config.platform]: current[config.platform].filter(
            (item) => item.id !== account.id
          ),
        }));
        setMessage({ text: `${config.name} account disconnected`, error: false });
      } else {
        const data = await res.json();
        setMessage({ text: data.error || "Failed to disconnect", error: true });
      }
    } catch {
      setMessage({ text: "Failed to disconnect. Please try again.", error: true });
    } finally {
      setDisconnecting(null);
    }
  }

  async function confirmPendingDisconnect() {
    const pending = pendingDisconnect;
    if (!pending || !pending.account || disconnecting) return;
    setPendingDisconnect(null);
    await runDisconnectMulti(pending.config, pending.account);
  }

  function limitLabel(count: number): string {
    return accountsLimit === null
      ? `${count} of unlimited accounts`
      : `${count} of ${accountsLimit} accounts`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Connected accounts"
        description="Choose where your posts go. Connect a profile on each channel to publish to it."
      />

      {message?.error ? (
        <ErrorBlock
          title="Connection issue"
          description={message.text}
          action={
            message.upgradeTo ? (
              <UpgradeCta
                reason="Upgrade to connect more accounts on this platform."
                upgradeTo={parsePlanParam(message.upgradeTo)}
                compact
              />
            ) : undefined
          }
          className="mb-6"
        />
      ) : message ? (
        <Alert className="mb-6">
          <AlertTitle>Accounts</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="grid items-stretch gap-4 sm:grid-cols-2">
        {PLATFORMS.map((config) => {
          const accounts = accountsFor(config);
          const connected = accounts.length > 0;
          const hasExpired = accounts.some((account) => isExpired(account));
          return (
            <li key={config.platform} className="min-w-0">
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"
                    >
                      <PlatformIcon
                        platform={config.platform}
                        className="size-6"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle>{config.name}</CardTitle>
                      <CardDescription>{config.blurb}</CardDescription>
                    </div>
                    {connected ? (
                      hasExpired ? (
                        <Badge variant="destructive" className="shrink-0">
                          <StatusDot status="FAILED" />
                          Expired
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0">
                          <StatusDot status="PUBLISHED" />
                          Connected
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        <StatusDot status="DRAFT" />
                        Not connected
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {config.multi && connected && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {limitLabel(accounts.length)}
                    </p>
                  )}
                  {connected ? (
                    <ul className="flex flex-col gap-2">
                      {accounts.map((account) => {
                        const expired = isExpired(account);
                        return (
                          <li
                            key={account.id}
                            className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                          >
                            <Avatar className="size-8 shrink-0">
                              <AvatarFallback>
                                {accountInitial(account.username)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                @{account.username}
                              </p>
                              {expired && (
                                <p className="truncate text-xs text-destructive">
                                  Token expired, reconnect to keep publishing
                                </p>
                              )}
                            </div>
                            {expired && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleConnect(config)}
                                disabled={
                                  connecting === config.platform ||
                                  disconnecting === account.id
                                }
                              >
                                {connecting === config.platform && (
                                  <Spinner data-icon="inline-start" />
                                )}
                                Reconnect
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={expired ? "ghost" : "destructive"}
                              onClick={() =>
                                setPendingDisconnect({ config, account })
                              }
                              disabled={disconnecting === account.id}
                              aria-label={`Disconnect @${account.username}`}
                            >
                              {disconnecting === account.id && (
                                <Spinner data-icon="inline-start" />
                              )}
                              {disconnecting === account.id
                                ? "Disconnecting..."
                                : "Disconnect"}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {`Connect to publish to ${config.name}.`}
                    </p>
                  )}
                  <div className="mt-auto pt-1">
                    {!connected ? (
                      <Button
                        onClick={() => void handleConnect(config)}
                        disabled={connecting === config.platform}
                        className="w-full sm:w-auto"
                      >
                        {connecting === config.platform && (
                          <Spinner data-icon="inline-start" />
                        )}
                        {connecting === config.platform
                          ? "Connecting..."
                          : config.connectLabel}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => void handleConnect(config)}
                        disabled={connecting === config.platform}
                        className="w-full sm:w-auto"
                      >
                        {connecting === config.platform && (
                          <Spinner data-icon="inline-start" />
                        )}
                        {connecting === config.platform
                          ? "Connecting..."
                          : "Connect another"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect account?</DialogTitle>
            <DialogDescription>
              {pendingDisconnect
                ? `Disconnect ${pendingDisconnect.config.name} @${pendingDisconnect.account.username}? You can reconnect it at any time.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDisconnect(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmPendingDisconnect()}
              disabled={disconnecting !== null}
            >
              {disconnecting !== null && <Spinner data-icon="inline-start" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
