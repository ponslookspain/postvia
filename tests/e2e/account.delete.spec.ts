import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Account deletion (destructive, throwaway user only): settings danger zone
 * -> confirmation phrase -> /login?deleted=1 -> private routes bounce.
 * Runs last in spirit; isolated by unique user so order does not matter.
 */
test.describe("account deletion", () => {
  test("danger zone deletes the throwaway account", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email, password } = await provisionUser({ tag: "delete" });
    const statePath = `tests/e2e/.auth/delete-${Date.now()}.json`;
    await saveStorageState(api, statePath);
    await api.dispose().catch(() => undefined);

    const ctx = await browser.newContext({ storageState: statePath });
    const page = await ctx.newPage();
    try {
      await page.goto("/settings");
      await expect(page.getByText("Danger zone")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Delete account" }).first().click();
      await page.getByLabel(/Type delete to confirm/).fill("delete");
      await page.getByRole("button", { name: "Delete account", exact: true }).click();
      await expect(page).toHaveURL(/\/login\?deleted=1/, { timeout: 20_000 });

      // Session invalidated: private routes bounce to login.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }

    // Server-side cleanup proof: password sign-in must now fail.
    const { request: req } = await import("@playwright/test");
    const probe = await req.newContext({ baseURL: e2eBaseUrl() });
    try {
      const res = await probe.post("/api/auth/sign-in/email", {
        data: { email, password },
      });
      expect(res.ok()).toBeFalsy();
    } finally {
      // Best-effort: the UI flow above should already have removed the row.
      await cleanupUser(probe, email).catch(() => undefined);
      await probe.dispose().catch(() => undefined);
    }
  });
});
