"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectedAccount, TiktokCreatorInfo } from "./types";

/**
 * Stage H3: TikTok creator-info fetching moved verbatim from
 * NewPostComposer (effect, ref dedupe, error classification, retry and
 * deselect-reset semantics unchanged).
 */
export function useTikTokCreatorInfo(selectedAccounts: ConnectedAccount[]) {
  const [creatorInfos, setCreatorInfos] = useState<
    Record<string, TiktokCreatorInfo | null>
  >({});
  const [creatorInfoErrors, setCreatorInfoErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [creatorInfoAttempt, setCreatorInfoAttempt] = useState(0);
  const requestedCreatorInfo = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const account of selectedAccounts) {
      if (account.platform !== "TIKTOK") continue;
      if (requestedCreatorInfo.current.has(account.id)) continue;
      requestedCreatorInfo.current.add(account.id);
      fetch(
        `/api/social/tiktok/creator-info?accountId=${encodeURIComponent(account.id)}`
      )
        .then(async (response) => {
          if (response.ok) {
            const info =
              (await response.json()) as TiktokCreatorInfo | null;
            setCreatorInfos((current) => ({ ...current, [account.id]: info }));
            setCreatorInfoErrors((current) => {
              const next = { ...current };
              delete next[account.id];
              return next;
            });
          } else {
            const data = (await response.json().catch(() => null)) as {
              error?: unknown;
            } | null;
            const message =
              typeof data?.error === "string"
                ? data.error
                : "TikTok posting options are unavailable right now.";
            setCreatorInfos((current) => ({ ...current, [account.id]: null }));
            setCreatorInfoErrors((current) => ({
              ...current,
              [account.id]: message,
            }));
          }
        })
        .catch(() => {
          setCreatorInfos((current) => ({ ...current, [account.id]: null }));
          setCreatorInfoErrors((current) => ({
            ...current,
            [account.id]: "Could not reach TikTok. Check your connection and retry.",
          }));
        });
    }
  }, [selectedAccounts, creatorInfoAttempt]);

  function retryCreatorInfo(accountId: string) {
    requestedCreatorInfo.current.delete(accountId);
    setCreatorInfos((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
    setCreatorInfoErrors((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
    setCreatorInfoAttempt((count) => count + 1);
  }

  function resetForAccount(accountId: string) {
    requestedCreatorInfo.current.delete(accountId);
    setCreatorInfos((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
    setCreatorInfoErrors((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
  }

  return { creatorInfos, creatorInfoErrors, retryCreatorInfo, resetForAccount };
}
