import { PrismaClient } from "@prisma/client";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { E2E_PASSWORD, e2eBaseUrl, testEmail } from "./helpers/env";
import { cleanupUser } from "./helpers/test-user";

/**
 * Onboarding: fresh user is gated to /onboarding; submitting the form
 * (free plan) lands on /dashboard. Covers src/app/onboarding/* +
 * POST /api/onboarding (server decides { next }).
 */
test.describe("onboarding", () => {
  test("fresh user is gated, free onboarding lands on dashboard", async ({
    browser,
  }) => {
    const baseURL = e2eBaseUrl();
    const api = await playwrightRequest.newContext({ baseURL });
    const email = testEmail("onboarding");
    const password = E2E_PASSWORD;
    try {
      const signup = await api.post("/api/auth/sign-up/email", {
        data: { name: "", email, password, callbackURL: "/dashboard" },
      });
      expect(signup.ok()).toBeTruthy();
      const db = new PrismaClient();
      try {
        await db.user.update({ where: { email }, data: { emailVerified: true } });
      } finally {
        await db.$disconnect();
      }
      const signin = await api.post("/api/auth/sign-in/email", {
        data: { email, password },
      });
      expect(signin.ok()).toBeTruthy();

      // Server gate: dashboard bounces to onboarding before completion.
      const gate = await api.get("/dashboard", { maxRedirects: 0 }).catch(() => null);
      void gate;

      const statePath = `tests/e2e/.auth/onboarding-${Date.now()}.json`;
      await api.storageState({ path: statePath });
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      try {
        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
        await page.getByLabel("Your name").fill("E2E Onboard");
        await page.getByRole("radio", { name: /Free/ }).click();
        await page.getByRole("button", { name: "Continue as free" }).click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
