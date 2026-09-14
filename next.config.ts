import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Local development only: allow the permanent ngrok development
  // hostname to fetch Next.js dev resources (/_next/hmr, React Refresh).
  // Dev-server-only setting — production behavior is unchanged.
  allowedDevOrigins: ["lavish-passion-dipped.ngrok-free.dev"],
};

export default withSentryConfig(nextConfig, {
  // Verified Sentry organization/project slugs. The auth token always
  // comes from the SENTRY_AUTH_TOKEN environment variable (Vercel Secret
  // in deployed builds) — never hardcoded, never logged.
  org: "postvia",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Sourcemap upload needs SENTRY_AUTH_TOKEN; skip it when absent so
  // local and CI builds without Sentry credentials stay green.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // No build-time telemetry to Sentry.
  telemetry: false,
});
