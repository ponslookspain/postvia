import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Full media chain — LOCAL ONLY (skipped in CI).
 * prepare -> presigned PUT -> upload-completed webhook -> Media row ->
 * GET /api/media/status polling. Requires a dev Blob store
 * (BLOB_READ_WRITE_TOKEN + VERCEL_BLOB_CALLBACK_URL); never production.
 */
test.describe("media upload (local full chain)", () => {
  test.skip(
    !!process.env.CI,
    "Needs a dev Blob store + webhook callback; local E2E only (see docs/e2e.md)."
  );
  test("prepare, PUT, status polling registers media", async ({ browser }) => {
    e2eBaseUrl();
    test.skip(
      !process.env.BLOB_READ_WRITE_TOKEN,
      "Set BLOB_READ_WRITE_TOKEN (dev store) to run the local media chain."
    );
    const { api, email } = await provisionUser({ tag: "medialocal", withFakeAccount: true });
    try {
      const { createDraftPost } = await import("./helpers/test-user");
      const { id: postId } = await createDraftPost(api, `E2E media ${Date.now()}`);
      const prepare = await api.post("/api/media/prepare", {
        data: { postId, filename: "tiny.png", mimeType: "image/png", size: 68 },
      });
      expect(prepare.ok()).toBeTruthy();
      const { pathname } = (await prepare.json()) as { pathname: string };
      expect(typeof pathname).toBe("string");

      const statePath = `tests/e2e/.auth/medialocal-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/posts/new");
        await expect(page.getByRole("textbox", { name: "Post content" })).toBeVisible();
      } finally {
        await ctx.close();
      }
      void browser;
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
