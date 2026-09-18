import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/** Settings: profile name save + sections render + danger zone present. */
test.describe("settings", () => {
  test("profile update and sections", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "settings" });
    try {
      const statePath = `tests/e2e/.auth/settings-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/settings");
        await expect(page.getByLabel("Name")).toBeVisible({ timeout: 15_000 });
        await page.getByLabel("Name").fill("E2E Renamed");
        await page.getByRole("button", { name: /Save|Update/ }).first().click();
        await expect(page.getByText("Profile saved.")).toBeVisible({ timeout: 15_000 });

        await expect(page.getByText("Sign-in methods")).toBeVisible();
        await expect(page.getByText("Danger zone")).toBeVisible();
        await page.getByRole("button", { name: "Delete account" }).first().click();
        await expect(page.getByLabel(/Type delete to confirm/)).toBeVisible();
        await page.keyboard.press("Escape");
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
