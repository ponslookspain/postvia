"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
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
  connectLabel: string;
  connectEndpoint: string;
  disconnectEndpoint: string;
  icon: React.ReactNode;
}

function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ThreadsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="15" cy="9" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TiktokGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.05v-3.15a5.74 5.74 0 0 0-.77-.05A5.72 5.72 0 1 0 15.54 15V8.5a7.27 7.27 0 0 0 4.28 1.38V6.79a4.3 4.3 0 0 1-3.22-.97Z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SINGLE_PLATFORMS: PlatformConfig[] = [
  {
    platform: "X",
    name: "X (Twitter)",
    connectLabel: "Connect X",
    connectEndpoint: "/api/auth/x/connect",
    disconnectEndpoint: "/api/accounts/x",
    icon: <XGlyph />,
  },
  {
    platform: "THREADS",
    name: "Threads",
    connectLabel: "Connect Threads",
    connectEndpoint: "/api/auth/threads/connect",
    disconnectEndpoint: "/api/accounts/threads",
    icon: <ThreadsGlyph />,
  },
];

// Multi-account platforms (a user may connect several handles).
const MULTI_PLATFORMS: PlatformConfig[] = [
  {
    platform: "TIKTOK",
    name: "TikTok",
    connectLabel: "Connect TikTok",
    connectEndpoint: "/api/auth/tiktok/connect",
    disconnectEndpoint: "/api/accounts/tiktok",
    icon: <TiktokGlyph />,
  },
  {
    platform: "INSTAGRAM",
    name: "Instagram",
    connectLabel: "Connect Instagram",
    connectEndpoint: "/api/auth/instagram/connect",
    disconnectEndpoint: "/api/accounts/instagram",
    icon: <InstagramGlyph />,
  },
];

function getSearchParamMessage(searchParams: URLSearchParams): {
  text: string;
  error: boolean;
} | null {
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected) return { text: "Account connected successfully", error: false };
  if (error) {
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
    return { text: errors[error] || `Error: ${error}`, error: true };
  }
  return null;
}

type PendingDisconnect = {
  config: PlatformConfig;
  account: PlatformAccount | null;
} | null;

function isExpired(account: PlatformAccount | null | undefined): boolean {
  if (!account?.expiresAt) return false;
  return new Date(account.expiresAt).getTime() <= Date.now();
}

export default function AccountsContent({
  xAccount: initialXAccount,
  threadsAccount: initialThreadsAccount,
  tiktokAccounts: initialTiktokAccounts,
  instagramAccounts: initialInstagramAccounts,
}: {
  xAccount: PlatformAccount | null;
  threadsAccount: PlatformAccount | null;
  tiktokAccounts: PlatformAccount[];
  instagramAccounts: PlatformAccount[];
}) {
  const searchParams = useSearchParams();
  const [xAccount, setXAccount] = useState<PlatformAccount | null>(
    initialXAccount
  );
  const [threadsAccount, setThreadsAccount] =
    useState<PlatformAccount | null>(initialThreadsAccount);
  const [multiAccounts, setMultiAccounts] = useState<
    Record<string, PlatformAccount[]>
  >({
    TIKTOK: initialTiktokAccounts,
    INSTAGRAM: initialInstagramAccounts,
  });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(() => getSearchParamMessage(searchParams));
  const [pendingDisconnect, setPendingDisconnect] =
    useState<PendingDisconnect>(null);

  const byPlatform: Record<
    string,
    { account: PlatformAccount | null; setAccount: (a: PlatformAccount | null) => void }
  > = {
    X: { account: xAccount, setAccount: setXAccount },
    THREADS: { account: threadsAccount, setAccount: setThreadsAccount },
  };

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

  async function runDisconnect(config: PlatformConfig) {
    setDisconnecting(config.platform);
    try {
      const res = await fetch(config.disconnectEndpoint, { method: "DELETE" });
      if (res.ok) {
        byPlatform[config.platform].setAccount(null);
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
    if (!pending || disconnecting) return;
    setPendingDisconnect(null);
    if (pending.account) {
      await runDisconnectMulti(pending.config, pending.account);
    } else {
      await runDisconnect(pending.config);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <PageHeader
        title="Accounts"
        description="Connect the social profiles you publish to"
      />

      {message && (
        <Alert
          variant={message.error ? "destructive" : "default"}
          className="mb-6"
        >
          <TriangleAlertIcon />
          <AlertTitle>{message.error ? "Connection issue" : "Accounts"}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-4">
        {SINGLE_PLATFORMS.map((config) => {
          const { account } = byPlatform[config.platform];
          const connected = Boolean(account);
          const expired = isExpired(account);
          return (
            <li key={config.platform} className="min-w-0">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <Avatar>
                        <AvatarFallback
                          aria-label={config.name}
                          className={
                            connected
                              ? "bg-foreground text-primary-foreground"
                              : undefined
                          }
                        >
                          <span className="flex size-5 items-center justify-center [&_svg]:size-5">
                            {config.icon}
                          </span>
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle>{config.name}</CardTitle>
                          {connected ? (
                            expired ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : (
                              <Badge variant="secondary">Connected</Badge>
                            )
                          ) : (
                            <Badge variant="outline">Not connected</Badge>
                          )}
                        </div>
                        <CardDescription>
                          {account ? (
                            <>
                              @{account.username}
                              {expired &&
                                " · Token expired, reconnect to keep publishing"}
                            </>
                          ) : (
                            `Connect to publish to ${config.name}`
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {connected ? (
                        <>
                          {expired && (
                            <Button
                              onClick={() => void handleConnect(config)}
                              disabled={connecting === config.platform}
                            >
                              {connecting === config.platform && (
                                <Spinner data-icon="inline-start" />
                              )}
                              {connecting === config.platform
                                ? "Connecting..."
                                : "Reconnect"}
                            </Button>
                          )}
                          <Button
                            variant={expired ? "outline" : "destructive"}
                            onClick={() =>
                              setPendingDisconnect({ config, account: null })
                            }
                            disabled={disconnecting === config.platform}
                          >
                            {disconnecting === config.platform && (
                              <Spinner data-icon="inline-start" />
                            )}
                            {disconnecting === config.platform
                              ? "Disconnecting..."
                              : "Disconnect"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => void handleConnect(config)}
                          disabled={connecting === config.platform}
                        >
                          {connecting === config.platform && (
                            <Spinner data-icon="inline-start" />
                          )}
                          {connecting === config.platform
                            ? "Connecting..."
                            : config.connectLabel}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </li>
          );
        })}

        {MULTI_PLATFORMS.map((config) => {
          const accounts = multiAccounts[config.platform] ?? [];
          return (
            <li key={config.platform} className="min-w-0">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <Avatar>
                        <AvatarFallback
                          aria-label={config.name}
                          className={
                            accounts.length > 0
                              ? "bg-foreground text-primary-foreground"
                              : undefined
                          }
                        >
                          <span className="flex size-5 items-center justify-center [&_svg]:size-5">
                            {config.icon}
                          </span>
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle>{config.name}</CardTitle>
                          {accounts.length > 0 ? (
                            <Badge variant="secondary">
                              {accounts.length} connected
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not connected</Badge>
                          )}
                        </div>
                        <CardDescription>
                          {accounts.length === 0
                            ? `Connect to publish to ${config.name}`
                            : "Multiple accounts supported"}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      onClick={() => void handleConnect(config)}
                      disabled={connecting === config.platform}
                      className="shrink-0"
                    >
                      {connecting === config.platform && (
                        <Spinner data-icon="inline-start" />
                      )}
                      {connecting === config.platform
                        ? "Connecting..."
                        : config.connectLabel}
                    </Button>
                  </div>
                </CardHeader>
                {accounts.length > 0 && (
                  <CardContent className="flex flex-col gap-2 pt-0">
                    <ul className="flex flex-col gap-2">
                      {accounts.map((account) => {
                        const expired = isExpired(account);
                        return (
                          <li
                            key={account.id}
                            className="flex flex-col gap-3 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm">
                                @{account.username}
                              </span>
                              {expired && (
                                <Badge variant="destructive">Expired</Badge>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {expired && (
                                <Button
                                  size="sm"
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
                                variant={expired ? "outline" : "destructive"}
                                size="sm"
                                onClick={() =>
                                  setPendingDisconnect({ config, account })
                                }
                                disabled={disconnecting === account.id}
                              >
                                {disconnecting === account.id && (
                                  <Spinner data-icon="inline-start" />
                                )}
                                {disconnecting === account.id
                                  ? "Disconnecting..."
                                  : "Disconnect"}
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                )}
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
              {pendingDisconnect?.account
                ? `Disconnect ${pendingDisconnect.config.name} @${pendingDisconnect.account.username}? You can reconnect it at any time.`
                : `Disconnect your ${pendingDisconnect?.config.name} account? You can reconnect it at any time.`}
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
    </div>
  );
}
