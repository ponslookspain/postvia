/**
 * Shared client-side wait for the `blob.upload-completed` webhook to land
 * as a Media row. Extracted from the previously duplicated implementations
 * in NewPostComposer and BulkScheduler (same 20s/500ms contract).
 *
 * Abort stops client polling only; the server webhook keeps processing.
 * `fetchStatus` is injectable for deterministic tests.
 */

export const MEDIA_REGISTER_TIMEOUT_MS = 20_000;
export const MEDIA_REGISTER_POLL_MS = 500;

function sleep(ms: number, signal?: AbortSignal): Promise<"slept" | "aborted"> {
  if (signal?.aborted) return Promise.resolve("aborted");
  if (ms <= 0) return Promise.resolve("slept");
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve("slept");
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve("aborted");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForMediaRegistration(input: {
  postId: string;
  pathname: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollMs?: number;
  fetchStatus?: (
    postId: string,
    pathname: string,
    signal?: AbortSignal
  ) => Promise<boolean | null>;
  now?: () => number;
}): Promise<string | null> {
  const timeoutMs = input.timeoutMs ?? MEDIA_REGISTER_TIMEOUT_MS;
  const pollMs = input.pollMs ?? MEDIA_REGISTER_POLL_MS;
  const now = input.now ?? Date.now;
  const signal = input.signal;
  const fetchStatus =
    input.fetchStatus ??
    (async (postId, pathname, sig) => {
      try {
        const res = await fetch(
          `/api/media/status?postId=${encodeURIComponent(postId)}&pathname=${encodeURIComponent(pathname)}`,
          { signal: sig }
        );
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as {
          exists?: boolean;
        } | null;
        return data?.exists ? true : null;
      } catch {
        return null;
      }
    });
  const start = now();
  for (;;) {
    if (signal?.aborted) return "Upload wait canceled.";
    if (now() - start >= timeoutMs) {
      return "Upload did not finish registering in time. Please try again.";
    }
    const exists = await fetchStatus(input.postId, input.pathname, signal);
    if (exists) return null;
    if (signal?.aborted) return "Upload wait canceled.";
    const slept = await sleep(
      Math.min(pollMs, Math.max(0, timeoutMs - (now() - start))),
      signal
    );
    if (slept === "aborted") return "Upload wait canceled.";
  }
}
