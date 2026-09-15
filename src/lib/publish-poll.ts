import type { Platform } from "@prisma/client";
import { sleepAbortable as sleep } from "@/lib/sleep";

/**
 * Stage E: client-side publish polling extracted from NewPostComposer.
 * Pure orchestration over injected fetch/sleep — unit-testable without timers.
 *
 * Contract (matches the previous inline implementation):
 * - poll every `pollIntervalMs` (default 2000), give up after `timeoutMs`
 *   (default 330_000);
 * - a null fetch result is a transient hiccup: keep polling;
 * - abort stops CLIENT polling only; the server keeps publishing.
 */

export const PUBLISH_POLL_MS = 2000;
export const PUBLISH_POLL_TIMEOUT_MS = 330_000;

export type SettledPostTarget = {
  status: string;
  platform: Platform;
  externalPostId: string | null;
  errorMessage?: string | null;
  socialAccount?: { username: string } | null;
};

export type SettledPost = {
  status: string;
  errorMessage?: string | null;
  targets: SettledPostTarget[];
};

export type PollPostResult =
  /** The post left PUBLISHING (published, partially published, or failed). */
  | { outcome: "settled"; post: SettledPost }
  /** Deadline hit while still PUBLISHING — server work continues. */
  | { outcome: "timeout" }
  /** AbortSignal fired — client stopped watching, server work continues. */
  | { outcome: "aborted" };

/**
 * Honest progress snapshot: only what the last successful fetch reported.
 * `known` is false until the first successful fetch — the UI must not
 * invent per-platform progress before that.
 */
export type PollProgress = {
  elapsedMs: number;
  attempts: number;
  publishedTargets: number;
  failedTargets: number;
  totalTargets: number;
  known: boolean;
};

function summarize(post: SettledPost | null): {
  publishedTargets: number;
  failedTargets: number;
  totalTargets: number;
  known: boolean;
} {
  if (!post) {
    return {
      publishedTargets: 0,
      failedTargets: 0,
      totalTargets: 0,
      known: false,
    };
  }
  const targets = post.targets ?? [];
  return {
    publishedTargets: targets.filter((t) => t.status === "PUBLISHED").length,
    failedTargets: targets.filter((t) => t.status === "FAILED").length,
    totalTargets: targets.length,
    known: true,
  };
}

/** mm:ss for the live "waiting 01:23" label. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Honest phase label from the last known snapshot only — never invents
 * per-platform progress the backend did not report.
 */
export function publishPhaseLabel(progress: PollProgress | null): string {
  if (!progress || !progress.known) return "Contacting platforms…";
  if (progress.totalTargets === 0) return "Waiting for platforms…";
  const decided = progress.publishedTargets + progress.failedTargets;
  if (decided >= progress.totalTargets) return "Finishing…";
  return `Publishing… ${progress.publishedTargets}/${progress.totalTargets} published`;
}

export async function pollPostSettled(input: {
  postId: string;
  /** Return the post, or null on transient failure (keeps polling). */
  fetchPost: (postId: string) => Promise<SettledPost | null>;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (progress: PollProgress) => void;
  /** Injected clock for deterministic tests. */
  now?: () => number;
}): Promise<PollPostResult> {
  const pollIntervalMs = input.pollIntervalMs ?? PUBLISH_POLL_MS;
  const timeoutMs = input.timeoutMs ?? PUBLISH_POLL_TIMEOUT_MS;
  const now = input.now ?? Date.now;
  const signal = input.signal;
  const start = now();
  let attempts = 0;
  let last: SettledPost | null = null;

  for (;;) {
    if (signal?.aborted) return { outcome: "aborted" };
    const elapsed = now() - start;
    if (elapsed >= timeoutMs) return { outcome: "timeout" };
    const slept = await sleep(
      Math.min(pollIntervalMs, timeoutMs - elapsed),
      signal
    );
    if (slept === "aborted" || signal?.aborted) {
      return { outcome: "aborted" };
    }
    attempts += 1;
    try {
      last = await input.fetchPost(input.postId);
    } catch {
      last = null;
    }
    if (signal?.aborted) return { outcome: "aborted" };
    if (last && last.status !== "PUBLISHING") {
      return { outcome: "settled", post: last };
    }
    input.onProgress?.({
      elapsedMs: now() - start,
      attempts,
      ...summarize(last),
    });
  }
}
