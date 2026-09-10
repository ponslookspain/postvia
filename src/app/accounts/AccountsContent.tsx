"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface XAccount {
  id: string;
  platform: string;
  externalId: string;
  username: string;
  createdAt: string;
}

function getSearchParamMessage(searchParams: URLSearchParams): string | null {
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected === "true") return "X account connected successfully";
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
  account: initialAccount,
}: {
  account: XAccount | null;
}) {
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<XAccount | null>(initialAccount);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(() =>
    getSearchParamMessage(searchParams)
  );

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/auth/x/connect");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage(data.error || "Failed to initiate connection");
        setConnecting(false);
      }
    } catch {
      setMessage("Failed to connect. Please try again.");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect your X account?")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/accounts/x", { method: "DELETE" });
      if (res.ok) {
        setAccount(null);
        setMessage("X account disconnected");
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to disconnect");
      }
    } catch {
      setMessage("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
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

      {account ? (
        <div className="border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-primary-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">X (Twitter)</p>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                    Connected
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  @{account.username}
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold">X (Twitter)</p>
                <p className="text-sm text-muted-foreground">Not connected</p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {connecting ? "Connecting..." : "Connect X"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
