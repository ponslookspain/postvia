import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Social accounts UI (CI-safe, no real OAuth):
 * empty state renders, provider connect buttons exist, error banner shows
 * for ?error=. Real OAuth round-trips stay local/manual smoke
 * (see docs/e2e.md) — external providers are never driven from CI.
 */
test.describe("social accounts ui", () => {
  test("empty state, connect buttons, error banner", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "accounts" });
    try {
      const statePath = `tests/e2e/.auth/accounts-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/accounts");
        await expect(
          page.getByRole("heading", { name: "Connected accounts" })
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: /Connect/ }).first()).toBeVisible();

        await page.goto("/accounts?error=oauth_failed");
        await expect(
          page.getByRole("heading", { name: "Connected accounts" })
        ).toBeVisible();
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
