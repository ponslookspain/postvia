"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface PlatformAccount {
  id: string;
  platform: string;
  externalId: string;
  username: string;
  createdAt: string;
}

interface PlatformConfig {
  platform: "X" | "THREADS" | "TIKTOK";
  name: string;
  connectLabel: string;
  connectEndpoint: string;
  disconnectEndpoint: string;
  icon: React.ReactNode;
}

const X_ICON = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const THREADS_ICON = (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="15" cy="9" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const PLATFORMS: PlatformConfig[] = [
  {
    platform: "X",
    name: "X (Twitter)",
    connectLabel: "Connect X",
    connectEndpoint: "/api/auth/x/connect",
    disconnectEndpoint: "/api/accounts/x",
    icon: X_ICON,
  },
  {
    platform: "THREADS",
    name: "Threads",
    connectLabel: "Connect Threads",
    connectEndpoint: "/api/auth/threads/connect",
    disconnectEndpoint: "/api/accounts/threads",
    icon: THREADS_ICON,
  },
];

function getSearchParamMessage(searchParams: URLSearchParams): string | null {
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected === "true") return "Account connected successfully";
  if (error) {
    const errors: Record<string, string> = {
      access_denied: "Authorization was denied by the user",
      invalid_state: "Invalid OAuth state. Please try again.",
      invalid_session: "Session expired. Please try again.",
      missing_parameters: "Missing authorization parameters",
    };
    return errors[error] || `Error: ${error}`;
  }
  return null;
}

export default function AccountsContent({
  xAccount: initialXAccount,
  threadsAccount: initialThreadsAccount,
  tiktokAccounts: initialTiktokAccounts,
}: {
  xAccount: PlatformAccount | null;
  threadsAccount: PlatformAccount | null;
  tiktokAccounts: PlatformAccount[];
}) {
  const searchParams = useSearchParams();
  const [xAccount, setXAccount] = useState<PlatformAccount | null>(
    initialXAccount
  );
  const [threadsAccount, setThreadsAccount] =
    useState<PlatformAccount | null>(initialThreadsAccount);
  const [tiktokAccounts, setTiktokAccounts] =
    useState<PlatformAccount[]>(initialTiktokAccounts);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(() =>
    getSearchParamMessage(searchParams)
  );

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
        setMessage(data.error || "Failed to initiate connection");
        setConnecting(null);
      }
    } catch {
      setMessage("Failed to connect. Please try again.");
      setConnecting(null);
    }
  }

  async function handleDisconnectTiktok(account: PlatformAccount) {
    if (!confirm(`Disconnect TikTok @${account.username}?`)) return;
    setDisconnecting(account.id);
    try {
      const res = await fetch(
        `/api/accounts/tiktok?accountId=${encodeURIComponent(account.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setTiktokAccounts((current) =>
          current.filter((item) => item.id !== account.id)
        );
        setMessage("TikTok account disconnected");
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to disconnect");
      }
    } catch {
      setMessage("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleDisconnect(config: PlatformConfig) {
    if (
      !confirm(
        `Are you sure you want to disconnect your ${config.name} account?`
      )
    )
      return;
    setDisconnecting(config.platform);
    try {
      const res = await fetch(config.disconnectEndpoint, { method: "DELETE" });
      if (res.ok) {
        byPlatform[config.platform].setAccount(null);
        setMessage(`${config.name} account disconnected`);
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to disconnect");
      }
    } catch {
      setMessage("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-8">Accounts</h1>

      {message && (
        <div className="mb-6 p-4 rounded-lg border border-border bg-muted/50 text-sm">
          {message}
          <button
            onClick={() => setMessage(null)}
            className="ml-3 text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-4">
        {PLATFORMS.map((config) => {
          const { account } = byPlatform[config.platform];
          const connected = Boolean(account);
          return (
            <div key={config.platform} className="border border-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      connected ? "bg-foreground text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {config.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{config.name}</p>
                      {connected && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {account ? `@${account.username}` : "Not connected"}
                    </p>
                  </div>
                </div>
                {connected ? (
                  <button
                    onClick={() => handleDisconnect(config)}
                    disabled={disconnecting === config.platform}
                    className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    {disconnecting === config.platform
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(config)}
                    disabled={connecting === config.platform}
                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {connecting === config.platform
                      ? "Connecting..."
                      : config.connectLabel}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  tiktokAccounts.length > 0
                    ? "bg-foreground text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.05v-3.15a5.74 5.74 0 0 0-.77-.05A5.72 5.72 0 1 0 15.54 15V8.5a7.27 7.27 0 0 0 4.28 1.38V6.79a4.3 4.3 0 0 1-3.22-.97Z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">TikTok</p>
                  {tiktokAccounts.length > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                      {tiktokAccounts.length} connected
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {tiktokAccounts.length === 0
                    ? "Not connected"
                    : "Video posts via Direct Post"}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                handleConnect({
                  platform: "TIKTOK",
                  name: "TikTok",
                  connectLabel: "Connect TikTok",
                  connectEndpoint: "/api/auth/tiktok/connect",
                  disconnectEndpoint: "/api/accounts/tiktok",
                  icon: null,
                })
              }
              disabled={connecting === "TIKTOK"}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {connecting === "TIKTOK" ? "Connecting..." : "Connect TikTok"}
            </button>
          </div>
          {tiktokAccounts.length > 0 && (
            <ul className="mt-4 space-y-2">
              {tiktokAccounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between border border-border rounded-md px-3 py-2"
                >
                  <span className="text-sm">@{account.username}</span>
                  <button
                    onClick={() => handleDisconnectTiktok(account)}
                    disabled={disconnecting === account.id}
                    className="px-3 py-1 text-xs text-destructive border border-destructive/30 rounded-md hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    {disconnecting === account.id ? "Disconnecting..." : "Disconnect"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}