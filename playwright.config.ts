import { defineConfig, devices } from "@playwright/test";

/**
 * PostVIA browser E2E (Chromium only for Phase 1-8).
 *
 * Local:  E2E_BASE=http://localhost:3100 npx playwright test
 * CI:     the `e2e` job boots `next dev --port 3100` and runs the same suite.
 *
 * Safety: the suite refuses to run against production-like origins
 * (see helpers/env.ts `assertSafeBaseUrl`). No production DB, Blob,
 * Stripe or OAuth is ever touched by these tests.
 */
const BASE_URL = process.env.E2E_BASE ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const CI = !!process.env.CI;
// Derive the dev-server port from E2E_BASE so a locally running
// `next dev` (usually :3000) is reused instead of colliding.
const basePort = (() => {
  try {
    return String(new URL(BASE_URL).port || "3100");
  } catch {
    return "3100";
  }
})();
// Browser UI auth origin for the booted server (see webServer.env below).
const e2eOrigin = (() => {
  try {
    return new URL(BASE_URL).origin;
  } catch {
    return "http://127.0.0.1:3100";
  }
})();

export default defineConfig({
  testDir: "./tests/e2e",
  // Specs are self-contained (unique throwaway user per test); parallel is safe.
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  webServer: {
    command: `next dev --port ${basePort}`,
    url: `http://127.0.0.1:${basePort}/api/health`,
    // Reuse a running dev server when the port matches (local `next dev`);
    // CI boots its own (no server is running there).
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      // The webServer inherits the ambient env (DATABASE_URL_*, secrets).
      // Never set production values here.
      NODE_ENV: "development",
      // Ordinary browser E2E must not touch Resend: without this the booted
      // `next dev` picks RESEND_API_KEY up from .env.local and every
      // throwaway signup fires a real (422-rejected) verification email.
      // Empty string counts as absent (see src/lib/email.ts getResend), so
      // the default is Resend-off like CI; an ambient RESEND_API_KEY passes
      // through untouched for explicit OTP runs (see docs/e2e.md).
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
      // Browser UI auth (authClient) sends Origin + Sec-Fetch headers, so
      // Better Auth force-validates the origin even without cookies. The
      // hardcoded allowlist covers localhost:3000 but not the E2E base
      // (http://127.0.0.1:3100): without this, UI sign-in/sign-out die with
      // 403 INVALID_ORIGIN while API-authenticated specs pass — the exact
      // split that broke auth.login and account.delete locally. Same origin
      // the CI `e2e` job trusts; an ambient value is preserved (appended).
      BETTER_AUTH_TRUSTED_ORIGINS: [e2eOrigin, process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? ""]
        .filter(Boolean)
        .join(","),
    },
  },
});
