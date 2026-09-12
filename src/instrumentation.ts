import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";
import { scrubRequestPath } from "@/lib/diagnostics";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}

// Server-error hook (stable in the installed Next 16.3.x, see
// node_modules/next/dist/docs/.../file-conventions/instrumentation.md).
// Request headers are never forwarded — they carry cookies and
// Authorization — and the query string is stripped so OAuth codes and
// signed-URL signatures cannot reach Sentry.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  await Sentry.captureRequestError(
    error,
    {
      path: scrubRequestPath(request.path),
      method: request.method,
      headers: {},
    },
    context
  );
};
