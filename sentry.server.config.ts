import * as Sentry from "@sentry/nextjs";
import {
  getSentryTracesSampleRate,
  scrubSentryEvent,
} from "./src/lib/diagnostics";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // 0.1 in production, 0 elsewhere (see getSentryTracesSampleRate).
    tracesSampleRate: getSentryTracesSampleRate(),
    // Never collect PII by default; scrubSentryEvent enforces the secret denylist.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}
