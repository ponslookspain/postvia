import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import {
  cleanupUser,
  createDraftPost,
  provisionUser,
  saveStorageState,
} from "./helpers/test-user";

/** Calendar: month navigation + scheduled-post chip linking to details. */
test.describe("calendar", () => {
  test("renders month nav and the scheduled post chip", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "calendar", withFakeAccount: true });
    try {
      const text = `E2E cal ${Date.now()}`;
      const future = new Date(Date.now() + 72 * 3600_000).toISOString();
      const { id } = await createDraftPost(api, text, { scheduledAt: future });
      void id;

      const statePath = `tests/e2e/.auth/calendar-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/calendar");
        await expect(page.getByRole("link", { name: "Previous month" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Next month" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Create post" }).first()).toBeVisible();
        // Chip links to the post details page.
        await expect(page.getByRole("link", { name: new RegExp(text.slice(0, 16)) }).first()).toBeVisible({
          timeout: 15_000,
        });
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
