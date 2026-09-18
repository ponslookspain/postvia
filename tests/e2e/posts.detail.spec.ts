import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import {
  cleanupUser,
  createDraftPost,
  provisionUser,
  saveStorageState,
} from "./helpers/test-user";

/** Post details: reschedule dialog + delete dialog (destructive, throwaway). */
test.describe("post details", () => {
  test("reschedule and delete flow", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "detail", withFakeAccount: true });
    try {
      const { id } = await createDraftPost(api, `E2E detail ${Date.now()}`);
      const statePath = `tests/e2e/.auth/detail-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto(`/posts/${id}`);
        await expect(page.getByText(/Post/i).first()).toBeVisible();

        // Reschedule dialog opens (date/time inputs present).
        const rescheduleBtn = page.getByRole("button", { name: /Reschedule|Schedule/ }).first();
        if (await rescheduleBtn.isVisible()) {
          await rescheduleBtn.click();
          await expect(page.getByLabel("Date").first()).toBeVisible();
          await page.keyboard.press("Escape");
        }

        // Delete dialog confirms and redirects to /posts.
        const deleteBtn = page.getByRole("button", { name: /Delete/ }).first();
        await deleteBtn.click();
        await expect(page.getByTestId("delete-post-dialog")).toBeVisible();
        await page.getByTestId("confirm-delete-post").click();
        await expect(page).toHaveURL(/\/posts/, { timeout: 20_000 });
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
