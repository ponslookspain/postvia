import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Platform-aware media gating (UX only — server validation stays
 * authoritative, see POST /api/posts).
 *
 * - The media counter/Add control follow the effective limit of the
 *   current target selection (Threads-only → 1, X-only → 4).
 * - The file picker hint narrows to the effective MIME intersection.
 * - Adding a restrictive target never deletes existing media: files
 *   stay, the existing "Media requirements" validation + disabled
 *   submit take over, and only new adds are gated.
 * - Removing the restrictive target recovers reactively.
 *
 * No Blob/upload happens here (files stay pending client-side), so the
 * spec is CI-safe.
 */
test.describe("platform-aware media gating", () => {
  test("Instagram caps the composer at 1 file; target changes never delete media", async ({
    browser,
  }) => {
    const { api, email } = await provisionUser({
      tag: "mediagate",
      withFakeAccount: true,
    });
    try {
      // Extra fake targets (DB-level rows for the throwaway user; no
      // OAuth, no provider calls, cascade-deleted with the user).
      const db = new PrismaClient();
      try {
        const user = await db.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (!user) throw new Error("E2E user vanished after onboarding");
        const stamp = Date.now();
        await db.socialAccount.createMany({
          data: [
            {
              userId: user.id,
              platform: "X",
              externalId: `e2e-x-${stamp}`,
              username: "e2e_x",
              accessToken: "e2e-fake-token-never-used-against-provider",
            },
            {
              userId: user.id,
              platform: "INSTAGRAM",
              externalId: `e2e-ig-${stamp}`,
              username: "e2e_ig",
              accessToken: "e2e-fake-token-never-used-against-provider",
            },
          ],
        });
      } finally {
        await db.$disconnect();
      }

      const statePath = `tests/e2e/.auth/mediagate-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/posts/new");
        await expect(
          page.getByRole("textbox", { name: "Post content" })
        ).toBeVisible();

        const fileInput = page.locator('input[type="file"]');
        const jpeg = (name: string) => ({
          name,
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        });

        // Default selection is Threads-only → effective max 1.
        await expect(page.getByText("0/1", { exact: true })).toBeVisible();

        await fileInput.setInputFiles([jpeg("one.jpg")]);
        await expect(page.getByText("1/1", { exact: true })).toBeVisible();
        // Add control hides at the effective limit.
        await expect(
          page.getByRole("button", { name: "Add media" })
        ).toHaveCount(0);

        // Selecting X keeps the effective max at 1 (Threads still selected).
        await page.getByRole("button", { name: "X @e2e_x", exact: true }).click();
        await expect(page.getByText("1/1", { exact: true })).toBeVisible();

        // Dropping Threads leaves X-only → effective max recovers to 4.
        await page
          .getByRole("button", { name: "Threads @e2e_fake, selected", exact: true })
          .click();
        await expect(page.getByText("1/4", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Add media" }).first()
        ).toBeVisible();

        await fileInput.setInputFiles([jpeg("two.jpg")]);
        await expect(page.getByText("2/4", { exact: true })).toBeVisible();

        // Adding Instagram shrinks the effective max to 1: both files
        // stay put, the existing validation explains the conflict, and
        // no further media can be added.
        await page
          .getByRole("button", { name: "Instagram @e2e_ig", exact: true })
          .click();
        await expect(page.getByText("2/1", { exact: true })).toBeVisible();
        await expect(page.getByText("one.jpg")).toBeVisible();
        await expect(page.getByText("two.jpg")).toBeVisible();
        await expect(page.getByText("Media requirements")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Add media" })
        ).toHaveCount(0);

        // Removing Instagram recovers reactively: no manual re-sync.
        await page
          .getByRole("button", { name: "Instagram @e2e_ig, selected", exact: true })
          .click();
        await expect(page.getByText("2/4", { exact: true })).toBeVisible();
        await expect(page.getByText("Media requirements")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Add media" }).first()
        ).toBeVisible();
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });

  test("picker hint narrows to the effective MIME intersection", async ({
    browser,
  }) => {
    const { api, email } = await provisionUser({
      tag: "mediagateacept",
      withFakeAccount: true,
    });
    try {
      const db = new PrismaClient();
      try {
        const user = await db.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (!user) throw new Error("E2E user vanished after onboarding");
        await db.socialAccount.create({
          data: {
            userId: user.id,
            platform: "INSTAGRAM",
            externalId: `e2e-ig-${Date.now()}`,
            username: "e2e_ig",
            accessToken: "e2e-fake-token-never-used-against-provider",
          },
        });
      } finally {
        await db.$disconnect();
      }

      const statePath = `tests/e2e/.auth/mediagateaccept-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/posts/new");
        await expect(
          page.getByRole("textbox", { name: "Post content" })
        ).toBeVisible();

        const fileInput = page.locator('input[type="file"]');
        // Threads-only: JPEG/PNG/WebP/GIF + MP4.
        await expect(fileInput).toHaveAttribute(
          "accept",
          "image/jpeg,image/png,image/webp,image/gif,video/mp4,.jpg,.jpeg,.png,.webp,.gif,.mp4,.m4v"
        );

        // Threads + Instagram: intersection narrows to JPEG + MP4.
        await page
          .getByRole("button", { name: "Instagram @e2e_ig", exact: true })
          .click();
        await expect(fileInput).toHaveAttribute(
          "accept",
          "image/jpeg,video/mp4,.jpg,.jpeg,.mp4,.m4v"
        );
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
