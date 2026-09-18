import { test, expect, type Browser, type Page } from "@playwright/test";
import { e2eBaseUrl } from "./helpers/env";
import {
  cleanupUser,
  provisionUser,
  saveStorageState,
  type ProvisionedUser,
} from "./helpers/test-user";

/**
 * Browser smoke: fast, deterministic, read-only pass over the 8 key routes.
 *
 * - A. public smoke: logged-out behavior (/login renders, /dashboard bounces
 *   to /login, /billing renders its signed-out contract page — NOT a redirect).
 * - B. authenticated smoke: one throwaway free user (+ fake THREADS account),
 *   HTTP 200 + final URL + one stable key-UI anchor per route, no form
 *   submits, no Stripe/OAuth/Blob/OTP.
 * - C. navigation smoke: real Sidebar / account-menu clicks between routes.
 *
 * Runtime policy: `pageerror` fails the test; `console.error` is captured
 * for diagnostics only (React/Next dev warnings must not make CI flaky).
 * Depth (forms, dialogs, checkout/portal API, destructive flows) lives in
 * the journey specs — this file only proves the app renders and navigates.
 */

test.describe("browser smoke", () => {
  test.describe.configure({ mode: "serial" });

  let shared: ProvisionedUser | null = null;
  let statePath = "";

  test.beforeAll(async () => {
    e2eBaseUrl();
    shared = await provisionUser({ tag: "smoke", withFakeAccount: true });
    statePath = `tests/e2e/.auth/smoke-${Date.now()}.json`;
    await saveStorageState(shared.api, statePath);
  });

  test.afterAll(async () => {
    if (shared) {
      await cleanupUser(shared.api, shared.email).catch(() => undefined);
      await shared.api.dispose().catch(() => undefined);
      shared = null;
    }
  });

  function requireShared(): ProvisionedUser {
    if (!shared) throw new Error("smoke user was not provisioned (beforeAll failed?)");
    return shared;
  }

  async function authContext(browser: Browser) {
    const user = requireShared();
    void user;
    return browser.newContext({ storageState: statePath });
  }

  /** Attach runtime collectors; returns live buckets for end-of-test asserts. */
  function collectRuntime(page: Page) {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    return { pageErrors, consoleErrors };
  }

  function expectNoPageErrors(pageErrors: Error[], route: string) {
    expect(
      pageErrors,
      `pageerror on ${route}: ${pageErrors.map((e) => String(e?.message ?? e)).join("; ")}`
    ).toEqual([]);
  }

  function annotateConsoleErrors(route: string, consoleErrors: string[]) {
    if (consoleErrors.length > 0) {
      test.info().annotations.push({
        type: "smoke-console.error",
        description: `${route}: ${consoleErrors.slice(0, 5).join(" | ")}`,
      });
    }
  }

  test.describe("public smoke", () => {
    test("/login renders for logged-out visitors", async ({ browser }) => {
      e2eBaseUrl();
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { pageErrors, consoleErrors } = collectRuntime(page);
      try {
        const response = await page.goto("/login");
        expect(response?.status()).toBe(200);
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByLabel("Email")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Sign in", exact: true })
        ).toBeVisible();
        expectNoPageErrors(pageErrors, "/login (public)");
        annotateConsoleErrors("/login (public)", consoleErrors);
      } finally {
        await ctx.close();
      }
    });

    test("/dashboard bounces logged-out visitors to /login", async ({ browser }) => {
      e2eBaseUrl();
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { pageErrors, consoleErrors } = collectRuntime(page);
      try {
        // A redirect to /login is the CORRECT outcome here — it proves auth
        // protection and must never be mistaken for a successful /dashboard
        // render, so the final URL is asserted explicitly.
        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        await expect(page.getByLabel("Email")).toBeVisible();
        expectNoPageErrors(pageErrors, "/dashboard (public redirect)");
        annotateConsoleErrors("/dashboard (public redirect)", consoleErrors);
      } finally {
        await ctx.close();
      }
    });

    test("/billing renders its signed-out contract (200, no redirect)", async ({
      browser,
    }) => {
      e2eBaseUrl();
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { pageErrors, consoleErrors } = collectRuntime(page);
      try {
        // App contract (src/app/billing/page.tsx): signed-out visitors get
        // HTTP 200 with a sign-in prompt, NOT a redirect to /login.
        const response = await page.goto("/billing");
        expect(response?.status()).toBe(200);
        await expect(page).toHaveURL(/\/billing/);
        await expect(page.getByText("Sign in to view your plan")).toBeVisible();
        await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
        expectNoPageErrors(pageErrors, "/billing (public)");
        annotateConsoleErrors("/billing (public)", consoleErrors);
      } finally {
        await ctx.close();
      }
    });
  });

  test.describe("authenticated smoke", () => {
    async function gotoOk(
      browser: Browser,
      route: string,
      urlPattern: RegExp
    ): Promise<{ page: Page; close: () => Promise<void> }> {
      const ctx = await authContext(browser);
      const page = await ctx.newPage();
      const { pageErrors, consoleErrors } = collectRuntime(page);
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(urlPattern);
      // Attach collectors to the page for the caller to assert at the end.
      (page as unknown as { __smokeRuntime: unknown }).__smokeRuntime = {
        pageErrors,
        consoleErrors,
      };
      return {
        page,
        close: async () => {
          const runtime = (page as unknown as { __smokeRuntime: unknown })
            .__smokeRuntime as { pageErrors: Error[]; consoleErrors: string[] };
          expectNoPageErrors(runtime.pageErrors, `${route} (authenticated)`);
          annotateConsoleErrors(`${route} (authenticated)`, runtime.consoleErrors);
          await ctx.close();
        },
      };
    }

    test("/dashboard renders without greeting-text coupling", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/dashboard", /\/dashboard/);
      try {
        // Greeting text depends on time of day — assert structure, not copy.
        await expect(
          page.locator('[data-sidebar="sidebar"]').getByRole("link", {
            name: "Dashboard",
            exact: true,
          })
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Create post" }).first()
        ).toBeVisible();
        await expect(page.getByRole("link", { name: "View all" })).toBeVisible();
      } finally {
        await close();
      }
    });

    test("/posts renders list shell", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/posts", /\/posts/);
      try {
        await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          page.getByRole("link", { name: "Create post" }).first()
        ).toBeVisible();
      } finally {
        await close();
      }
    });

    test("/posts/new renders composer (no submit)", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/posts/new", /\/posts\/new/);
      try {
        await expect(
          page.getByRole("textbox", { name: "Post content" })
        ).toBeVisible({ timeout: 15_000 });
        // Visible only — smoke never saves/schedules/publishes.
        await expect(
          page.getByRole("button", { name: "Save draft" }).first()
        ).toBeVisible();
      } finally {
        await close();
      }
    });

    test("/calendar renders month navigation", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/calendar", /\/calendar/);
      try {
        await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          page.getByRole("link", { name: "Previous month" })
        ).toBeVisible();
        await expect(page.getByRole("link", { name: "Next month" })).toBeVisible();
      } finally {
        await close();
      }
    });

    test("/accounts renders connected-accounts shell", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/accounts", /\/accounts/);
      try {
        await expect(
          page.getByRole("heading", { name: "Connected accounts" })
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByRole("button", { name: /Connect/ }).first()
        ).toBeVisible();
      } finally {
        await close();
      }
    });

    test("/billing renders plan shell (no Stripe actions)", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/billing", /\/billing/);
      try {
        await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText("Current plan")).toBeVisible();
      } finally {
        await close();
      }
    });

    test("/settings renders profile shell (no save/delete)", async ({ browser }) => {
      const { page, close } = await gotoOk(browser, "/settings", /\/settings/);
      try {
        await expect(page.getByLabel("Name")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Danger zone")).toBeVisible();
      } finally {
        await close();
      }
    });
  });

  test.describe("navigation smoke", () => {
    test("sidebar + account menu reach every key route", async ({ browser }) => {
      e2eBaseUrl();
      const ctx = await authContext(browser);
      const page = await ctx.newPage();
      const { pageErrors, consoleErrors } = collectRuntime(page);
      try {
        const response = await page.goto("/dashboard");
        expect(response?.status()).toBe(200);
        await expect(page).toHaveURL(/\/dashboard/);

        const sidebar = page.locator('[data-sidebar="sidebar"]');
        const goViaSidebar = async (name: string, urlPattern: RegExp) => {
          await sidebar.getByRole("link", { name, exact: true }).click();
          await expect(page).toHaveURL(urlPattern, { timeout: 15_000 });
        };

        await goViaSidebar("Posts", /\/posts/);
        await goViaSidebar("Calendar", /\/calendar/);
        await goViaSidebar("Create post", /\/posts\/new/);
        await goViaSidebar("Accounts", /\/accounts/);
        await goViaSidebar("Dashboard", /\/dashboard/);

        const goViaAccountMenu = async (name: string, urlPattern: RegExp) => {
          const trigger = sidebar.getByRole("button", { name: "Account menu" });
          const item = page.getByRole("menuitem", { name });
          await trigger.click();
          // Cold `next dev` servers hydrate seconds after the SSR HTML (and
          // the URL) is already interactive for plain links: a trigger click
          // that lands pre-hydration opens no menu, and the item click below
          // would then wait until the test timeout. Toggle once more when
          // the menu did not appear — bounded, and a genuinely broken menu
          // still fails fast on the expect below instead of hanging.
          const opened = await item
            .waitFor({ state: "visible", timeout: 10_000 })
            .then(() => true)
            .catch(() => false);
          if (!opened) await trigger.click();
          try {
            await expect(item).toBeVisible({ timeout: 15_000 });
          } catch (error) {
            // Diagnostics for CI: annotations are invisible in the list
            // reporter, so print the captured browser errors to stdout.
            console.log(
              `[smoke-diagnostic] ${urlPattern} menu never opened. console.error: ${JSON.stringify(consoleErrors.slice(0, 10))}`
            );
            console.log(
              `[smoke-diagnostic] ${urlPattern} menu never opened. pageerror: ${pageErrors.map((e) => String(e?.message ?? e)).slice(0, 5).join(" | ")}`
            );
            console.log(
              `[smoke-diagnostic] role=menu count: ${await page.getByRole("menu").count()}, menuitem count: ${await page.getByRole("menuitem").count()}, trigger visible: ${await trigger.isVisible()}`
            );
            throw error;
          }
          await item.click();
          await expect(page).toHaveURL(urlPattern, { timeout: 15_000 });
        };

        await goViaAccountMenu("Settings", /\/settings/);
        await goViaAccountMenu("Billing", /\/billing/);

        expectNoPageErrors(pageErrors, "navigation chain");
        annotateConsoleErrors("navigation chain", consoleErrors);
      } finally {
        await ctx.close();
      }
    });
  });
});
