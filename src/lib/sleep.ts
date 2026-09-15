/**
 * Shared abortable sleep for client-side polling loops (publish polling,
 * media-registration wait). Single contract: resolves "slept" after the
 * delay, "aborted" when the signal fires first (timer cleared, listener
 * removed — no unmount leak).
 */
export function sleepAbortable(
  ms: number,
  signal?: AbortSignal
): Promise<"slept" | "aborted"> {
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
