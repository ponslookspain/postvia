import { test, expect } from "@playwright/test";
import { E2E_PASSWORD, e2eBaseUrl } from "./helpers/env";
import { cleanupUser, provisionUser, saveStorageState } from "./helpers/test-user";

/**
 * Login (password): wrong-password error + successful UI login with
 * server-side post-auth routing. Covers src/app/login/LoginForm.tsx.
 */
test.describe("login", () => {
  test("wrong password shows error; correct password signs in", async ({ browser }) => {
    e2eBaseUrl();
    const { api, email, password } = await provisionUser({ tag: "login" });
    const statePath = `tests/e2e/.auth/login-${Date.now()}.json`;
    await saveStorageState(api, statePath);
    await api.dispose().catch(() => undefined);

    // Fresh (logged-out) context for the UI login.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/login");
      await expect(page.getByLabel("Email")).toBeVisible();
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill("Wrong-Password-1!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByText("Unable to sign in")).toBeVisible();

      await page.getByLabel("Password", { exact: true }).fill(password);
      void E2E_PASSWORD;
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      // Server-side post-auth routing: onboarded user lands on dashboard.
      await expect(page).toHaveURL(/\/post-auth|\/dashboard/, { timeout: 20_000 });
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard/);
    } finally {
      await ctx.close();
      const { request: req } = await import("@playwright/test");
      const cleanup = await req.newContext({ baseURL: e2eBaseUrl() });
      // Re-auth via API to run the destructive cleanup through the product flow.
      await cleanup.post("/api/auth/sign-in/email", { data: { email, password } });
      await cleanupUser(cleanup, email);
    }
  });
});
