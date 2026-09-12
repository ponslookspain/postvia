import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Sourcemap upload needs SENTRY_AUTH_TOKEN; skip it when absent so
  // local and CI builds without Sentry credentials stay green.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // No build-time telemetry to Sentry.
  telemetry: false,
});
