import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import {
  cleanupUser,
  createDraftPost,
  provisionUser,
  saveStorageState,
} from "./helpers/test-user";

/** Schedule: dialog opens with disabled confirm; API-scheduled post renders. */
test.describe("schedule post", () => {
  test("schedule dialog validates; scheduled state persists", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "schedule", withFakeAccount: true });
    try {
      const { id } = await createDraftPost(api, `E2E schedule ${Date.now()}`);

      const statePath = `tests/e2e/.auth/schedule-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/posts/new");
        await expect(page.getByRole("textbox", { name: "Post content" })).toBeVisible();
        await page.getByRole("button", { name: "Schedule", exact: true }).click();
        const dialog = page.getByTestId("schedule-dialog");
        await expect(dialog).toBeVisible();
        // Confirm is disabled until the composer state allows scheduling.
        await expect(page.getByTestId("confirm-schedule")).toBeDisabled();

        // Persisted scheduling state via API (cron execution is NOT part of
        // browser E2E by design): future date -> SCHEDULED.
        const future = new Date(Date.now() + 48 * 3600_000).toISOString();
        const patched = await api.patch(`/api/posts/${id}`, {
          data: { scheduledAt: future },
        });
        expect(patched.ok()).toBeTruthy();

        await page.goto(`/posts/${id}`);
        await expect(page.getByText(/Scheduled/i).first()).toBeVisible({ timeout: 15_000 });
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
