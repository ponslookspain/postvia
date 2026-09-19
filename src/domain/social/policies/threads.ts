/**
 * Threads platform policies (domain).
 *
 * Pure auth classification and media routing. No OAuth, no token refresh,
 * no Prisma, no fetch, no environment access, no signed URLs — deterministic
 * over inputs. The Threads API client, container pipeline and polling stay
 * in `src/lib/social/threads.ts`, which re-exports this module for
 * compatibility. `resolveThreadsMediaPolicy` moved here from
 * `src/lib/media.ts`.
 *
 * DOMAIN RULE: import nothing except standard primitives and domain types.
 * Never Prisma, Stripe SDK, React, process.env, fetch, Blob SDK, Sentry,
 * diagnostics, `src/lib/*` or `src/app/*`.
 */
import type { MediaKind } from "../../media/policy";

export class ThreadsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

function threadsAuthSignal(status: number, code: string, message: string): boolean {
  if (status === 401 || status === 403) return true;
  if (code === "190") return true;
  return (
    /http 40[13]\b/i.test(message) ||
    /invalid.*token|token.*invalid|token.*expired|session.*expired|revoked/i.test(
      message
    )
  );
}

/**
 * True only for terminal auth failures (expired/revoked token). Used by
 * stale recovery so transient provider/rate-limit/5xx failures stay
 * resumable instead of failing the target and dropping the container.
 */
export function isThreadsAuthError(error: unknown): boolean {
  if (!(error instanceof ThreadsApiError)) return false;
  return threadsAuthSignal(error.httpStatus, error.code, error.message);
}

/**
 * Human-readable mapping. Auth/token failures always mean the user must
 * reconnect; every other error keeps the raw Meta diagnostic so support
 * retains code/subcode/fbtrace_id.
 */
export function threadsErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Threads publishing failed. Please try again.";
  const status = error instanceof ThreadsApiError ? error.httpStatus : 0;
  const code = error instanceof ThreadsApiError ? error.code : "";
  if (threadsAuthSignal(status, code, message)) {
    return "Threads access expired or was revoked. Reconnect your Threads account.";
  }
  return message;
}

export type ThreadsMediaPolicy =
  | { kind: "text" }
  | { kind: "media"; mediaId: string; mediaType: MediaKind }
  | { kind: "error"; message: string };

const THREADS_MP4_MIME = "video/mp4";

export function resolveThreadsMediaPolicy(
  media: readonly { id: string; type: MediaKind; mimeType: string }[]
): ThreadsMediaPolicy {
  if (media.length === 0) return { kind: "text" };
  if (media.length > 1) {
    return {
      kind: "error",
      message: "Threads posts currently support one image or one video.",
    };
  }
  const only = media[0];
  if (only.type === "VIDEO" && only.mimeType !== THREADS_MP4_MIME) {
    return {
      kind: "error",
      message:
        "Threads video posts require an MP4 file. WebM videos are not supported by Threads.",
    };
  }
  return { kind: "media", mediaId: only.id, mediaType: only.type };
}
