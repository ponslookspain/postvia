import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import {
  cleanupUser,
  createDraftPost,
  provisionUser,
  saveStorageState,
} from "./helpers/test-user";

/**
 * Create post (draft): composer textarea -> Save draft -> terminal
 * "Draft saved" -> post visible in /posts. Uses a fake THREADS account row
 * (no real OAuth) so the flow is deterministic in CI.
 */
test.describe("create post", () => {
  test("composer saves a draft", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "create", withFakeAccount: true });
    try {
      const statePath = `tests/e2e/.auth/create-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      const text = `E2E draft ${Date.now()}`;
      try {
        await page.goto("/posts/new");
        // "Post content" names both the section and the textarea; target the box.
        const composer = page.getByRole("textbox", { name: "Post content" });
        await expect(composer).toBeVisible();
        await composer.fill(text);
        await page.getByRole("button", { name: "Save draft" }).click();
        await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 20_000 });
        await page.goto("/posts");
        await expect(page.getByText(text.slice(0, 24))).toBeVisible({ timeout: 15_000 });
      } finally {
        await ctx.close();
      }
      void createDraftPost;
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
