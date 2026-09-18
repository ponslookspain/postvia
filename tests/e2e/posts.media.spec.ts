import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Media upload — CI-safe subset (per approved decision: no dev Blob store
 * in GitHub Actions, no tunnel in CI).
 *
 * CI asserts (deterministic, no webhook dependency):
 * - composer exposes the "Add media" file control;
 * - POST /api/media/prepare rejects unauthenticated callers with 401;
 * - POST /api/media/prepare rejects invalid bodies with 4xx for an
 *   authenticated user (no Blob PUT happens).
 *
 * The full chain (prepare -> presigned PUT -> upload-completed webhook ->
 * Media row -> polling) is local-only: posts.media.local.spec.ts
 * (skipped in CI, see docs/e2e.md).
 */
test.describe("media upload (ci-safe)", () => {
  test("composer file control present; prepare validates without Blob", async ({
    browser,
  }) => {
    const baseURL = e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "media", withFakeAccount: true });
    try {
      // Unauthenticated prepare -> 401 (no quota burn, no Blob).
      const anon = await (await import("@playwright/test")).request.newContext({
        baseURL,
      });
      const denied = await anon.post("/api/media/prepare", {
        data: { postId: "x", filename: "a.png", mimeType: "image/png", size: 10 },
      });
      expect(denied.status()).toBe(401);
      await anon.dispose();

      // Authenticated invalid body -> 4xx, still no Blob involved.
      const bad = await api.post("/api/media/prepare", { data: {} });
      expect([400, 404, 422]).toContain(bad.status());

      const statePath = `tests/e2e/.auth/media-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/posts/new");
        await expect(page.getByRole("textbox", { name: "Post content" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Add media" }).first()).toBeVisible();
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
