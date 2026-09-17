import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Local development only: allow the permanent ngrok development
  // hostname to fetch Next.js dev resources (/_next/hmr, React Refresh).
  // Dev-server-only setting — production behavior is unchanged.
  allowedDevOrigins: ["lavish-passion-dipped.ngrok-free.dev"],
  // Single canonical host: www.postvia.online 308-redirects to the apex.
  // The rule only matches the www host, so Preview/local hostnames are
  // untouched. Kills the www-vs-apex session/origin split class entirely.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.postvia.online" }],
        destination: "https://postvia.online/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Security headers (defence-in-depth; server-side auth/z is unchanged).
    // CSP keeps 'unsafe-inline' for scripts+styles: required by the static
    // theme init script (layout.tsx) and Next.js runtime/Tailwind. No
    // 'unsafe-eval', no wildcard script sources, no 'allow-all' CORS.
    // Development only (`next dev`, Turbopack HMR + React dev builds
    // evaluate modules via eval()): 'unsafe-eval' is appended to
    // script-src there. Production keeps the strict value below —
    // shipped bundles never eval, so the dev exception cannot leak.
    // Browser connect targets are same-origin API + Stripe.js/Sentry/Blob;
    // provider token exchanges run server-side and need no browser egress.
    const allowDevEval = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${allowDevEval ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://*.blob.vercel-storage.com https://*.vercel-storage.com https://vercel.com/api/blob/",
      "frame-src https://js.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
