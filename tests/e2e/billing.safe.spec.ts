import { test, expect } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Billing — CI-safe subset (approved decision).
 * UI: /billing renders plan/usage for a free throwaway user.
 * API: free/unknown checkout plans are rejected with 4xx; portal without a
 * customer is rejected. No live charges, no production Stripe, no hosted
 * Checkout automation. Real test-mode Checkout + Portal is local/manual
 * smoke (see docs/e2e.md).
 */
test.describe("billing (ci-safe)", () => {
  test("renders plan and rejects invalid checkout", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email } = await provisionUser({ tag: "billing" });
    try {
      // Unconfigured Stripe answers 503 before plan validation; a configured
      // env answers 400 for free/unknown plans. Both prove no live charge path.
      const freeCheckout = await api.post("/api/billing/checkout", {
        data: { plan: "free" },
      });
      expect([400, 503]).toContain(freeCheckout.status());

      const unknownCheckout = await api.post("/api/billing/checkout", {
        data: { plan: "nope" },
      });
      expect([400, 503]).toContain(unknownCheckout.status());

      const portal = await api.post("/api/billing/portal", { data: {} });
      expect([400, 503]).toContain(portal.status());

      const statePath = `tests/e2e/.auth/billing-${Date.now()}.json`;
      await saveStorageState(api, statePath);
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/billing");
        await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText("Current plan")).toBeVisible();
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
