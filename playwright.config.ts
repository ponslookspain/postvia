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
    },
  },
});
