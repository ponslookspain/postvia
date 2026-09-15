"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reportError } from "@/lib/diagnostics";
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

  // Stable identity for the selection: parent renders hand down a fresh
  // array every time, so depending on the array itself would re-run the
  // effect (and its fetch loop) on every render. The sorted id list only
  // changes when the actual selection changes; retries still flow through
  // creatorInfoAttempt.
  const selectionKey = selectedAccounts
    .map((account) => `${account.platform}:${account.id}`)
    .sort()
    .join(",");
  const tiktokAccountIds = useMemo(
    () =>
      selectedAccounts
        .filter((account) => account.platform === "TIKTOK")
        .map((account) => account.id),
    // Keyed on selectionKey (not the array identity) by design — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectionKey]
  );

  useEffect(() => {
    for (const accountId of tiktokAccountIds) {
      if (requestedCreatorInfo.current.has(accountId)) continue;
      requestedCreatorInfo.current.add(accountId);
      fetch(
        `/api/social/tiktok/creator-info?accountId=${encodeURIComponent(accountId)}`
      )
        .then(async (response) => {
          if (response.ok) {
            const info =
              (await response.json()) as TiktokCreatorInfo | null;
            setCreatorInfos((current) => ({ ...current, [accountId]: info }));
            setCreatorInfoErrors((current) => {
              const next = { ...current };
              delete next[accountId];
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
            setCreatorInfos((current) => ({ ...current, [accountId]: null }));
            setCreatorInfoErrors((current) => ({
              ...current,
              [accountId]: message,
            }));
          }
        })
        .catch((error: unknown) => {
          reportError("composer-client", "tiktok creator-info failed", error, {
            accountId,
          });
          setCreatorInfos((current) => ({ ...current, [accountId]: null }));
          setCreatorInfoErrors((current) => ({
            ...current,
            [accountId]: "Could not reach TikTok. Check your connection and retry.",
          }));
        });
    }
  }, [tiktokAccountIds, creatorInfoAttempt]);

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
