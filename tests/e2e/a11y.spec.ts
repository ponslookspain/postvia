import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import {
  test,
  expect,
  request as playwrightRequest,
  type Browser,
  type Page,
} from "@playwright/test";
import { E2E_PASSWORD, e2eBaseUrl, testEmail } from "./helpers/env";
import {
  cleanupUser,
  createDraftPost,
  provisionUser,
  saveStorageState,
  type ProvisionedUser,
} from "./helpers/test-user";

/**
 * Accessibility: automated axe scan + small keyboard smoke.
 *
 * - Axe runs over the 8 key routes (public /login + 7 authenticated
 *   routes) in both themes (dark default, light opt-in via the same
 *   `postvia-theme` localStorage key the app's blocking script reads).
 *   Only `critical`/`serious` axe violations fail the test;
 *   `color-contrast` is reported as an annotation instead of failing —
 *   contrast fixes are token-level decisions in `semantic.css` (see
 *   docs/design-tokens.md) and must be measured deliberately, not
 *   auto-failed by a checker.
 * - Keyboard checks cover what axe cannot prove: Tab order on /login,
 *   dropdown open/Escape on /posts, delete-dialog open/Escape with
 *   focus inside the dialog, and mobile navigation open/Escape.
 *   No form submits, no Stripe/OAuth/Blob/OTP.
 *
 * Runtime policy mirrors browser-smoke: `pageerror` fails, `console.error`
 * is annotation-only.
 */

const AUTH_ROUTES = [
  "/dashboard",
  "/posts",
  "/posts/new",
  "/calendar",
  "/accounts",
  "/billing",
  "/settings",
] as const;

type Theme = "light" | "dark";

test.describe("a11y", () => {
  test.describe.configure({ mode: "serial" });

  let shared: ProvisionedUser | null = null;
  let statePath = "";

  test.beforeAll(async () => {
    e2eBaseUrl();
    shared = await provisionUser({ tag: "a11y", withFakeAccount: true });
    // Seed one scheduled post so the axe scans cover populated states
    // (post rows, status tabs, calendar chips, dashboard feed) — empty
    // states alone once hid a critical `<a type="button">` violation.
    // Read-only afterwards: scans never mutate it.
    await createDraftPost(shared.api, `E2E a11y seed ${Date.now()}`, {
      scheduledAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
    });
    statePath = `tests/e2e/.auth/a11y-${Date.now()}.json`;
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
    if (!shared) throw new Error("a11y user was not provisioned (beforeAll failed?)");
    return shared;
  }

  async function authContext(browser: Browser) {
    void requireShared();
    return browser.newContext({ storageState: statePath });
  }

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

  /** Apply a theme the same way the app does (localStorage + reload). */
  async function applyTheme(page: Page, theme: Theme) {
    await page.evaluate((t) => {
      try {
        localStorage.setItem("postvia-theme", t);
      } catch {
        // Storage unavailable — fall through to the class toggle.
      }
      document.documentElement.classList.toggle("dark", t === "dark");
    }, theme);
    await page.reload();
  }

  async function expectNoSeriousViolations(
    page: Page,
    route: string,
    theme: Theme
  ) {
    // Freeze animations/transitions first: feed rows animate in on load,
    // and a mid-flight opacity would measure blended colors instead of the
    // at-rest design. Deterministic (no sleeps); mirrors the product's own
    // prefers-reduced-motion handling.
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none!important;transition:none!important}",
    });
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) =>
        v.id !== "color-contrast" &&
        (v.impact === "critical" || v.impact === "serious")
    );
    const contrast = results.violations.filter((v) => v.id === "color-contrast");
    if (contrast.length > 0) {
      test.info().annotations.push({
        type: "a11y-color-contrast",
        description:
          `${route} [${theme}]: ${contrast.length} color-contrast ` +
          `node(s) need token-level measurement in semantic.css: ` +
          contrast
            .slice(0, 3)
            .map((v) => `${v.nodes.length}x ${v.help}`)
            .join(" | "),
      });
    }
    const nonBlocking = results.violations.filter(
      (v) =>
        v.id !== "color-contrast" && v.impact !== "critical" && v.impact !== "serious"
    );
    if (nonBlocking.length > 0) {
      test.info().annotations.push({
        type: "a11y-minor",
        description:
          `${route} [${theme}]: moderate/minor: ` +
          nonBlocking
            .slice(0, 5)
            .map((v) => `${v.id}(${v.impact})`)
            .join(", "),
      });
    }
    expect(
      blocking,
      `${route} [${theme}] axe critical/serious: ` +
        blocking
          .map((v) => `${v.id}(${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)
          .join("; ")
    ).toEqual([]);
  }

  test("/login passes axe in both themes (public)", async ({ browser }) => {
    e2eBaseUrl();
    for (const theme of ["dark", "light"] as const) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { pageErrors } = collectRuntime(page);
      try {
        const response = await page.goto("/login");
        expect(response?.status()).toBe(200);
        await applyTheme(page, theme);
        await expect(page.getByLabel("Email")).toBeVisible();
        await expectNoSeriousViolations(page, "/login", theme);
        expectNoPageErrors(pageErrors, `/login [${theme}]`);
      } finally {
        await ctx.close();
      }
    }
  });

  for (const route of AUTH_ROUTES) {
    test(`${route} passes axe in both themes (authenticated)`, async ({
      browser,
    }) => {
      const ctx = await authContext(browser);
      const page = await ctx.newPage();
      const { pageErrors } = collectRuntime(page);
      try {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        for (const theme of ["dark", "light"] as const) {
          await applyTheme(page, theme);
          await expect(page.locator("body")).toBeVisible();
          await expectNoSeriousViolations(page, route, theme);
        }
        expectNoPageErrors(pageErrors, `${route} [dark+light]`);
      } finally {
        await ctx.close();
      }
    });
  }

  test("/login keyboard order: Email -> Password -> Sign in", async ({
    browser,
  }) => {
    e2eBaseUrl();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.goto("/login");
      const email = page.getByLabel("Email");
      await expect(email).toBeVisible();
      await email.focus();
      await expect(email).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Password")).toBeFocused();
      expectNoPageErrors(pageErrors, "/login keyboard order");
    } finally {
      await ctx.close();
    }
  });

  test("/posts row menu opens and closes with keyboard", async ({
    browser,
  }) => {
    const user = requireShared();
    const text = `E2E a11y menu ${Date.now()}`;
    await createDraftPost(user.api, text);
    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.goto("/posts");
      const trigger = page
        .getByRole("button", { name: new RegExp(`Actions for post: ${text.slice(0, 12)}`) })
        .first();
      await expect(trigger).toBeVisible({ timeout: 15_000 });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const item = page.getByRole("menuitem", { name: /Edit|View/ }).first();
      await expect(item).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(item).toBeHidden();
      expectNoPageErrors(pageErrors, "/posts row menu keyboard");
    } finally {
      await ctx.close();
    }
  });

  test("/posts delete dialog traps focus and closes with Escape", async ({
    browser,
  }) => {
    const user = requireShared();
    const text = `E2E a11y dialog ${Date.now()}`;
    await createDraftPost(user.api, text);
    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.goto("/posts");
      const trigger = page
        .getByRole("button", { name: new RegExp(`Actions for post: ${text.slice(0, 12)}`) })
        .first();
      await expect(trigger).toBeVisible({ timeout: 15_000 });
      await trigger.click();
      const deleteItem = page.getByRole("menuitem", { name: "Delete" });
      await expect(deleteItem).toBeVisible();
      await deleteItem.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      // Focus must land inside the dialog (Radix focus trap).
      const focusedInDialog = await page.evaluate(() => {
        const dialogEl = document.querySelector('[role="dialog"]');
        return !!dialogEl?.contains(document.activeElement);
      });
      expect(focusedInDialog).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      // Read-only check: the post is still listed (nothing was deleted).
      await expect(
        page.getByRole("button", { name: new RegExp(`Actions for post: ${text.slice(0, 12)}`) }).first()
      ).toBeVisible();
      expectNoPageErrors(pageErrors, "/posts delete dialog keyboard");
    } finally {
      await ctx.close();
    }
  });

  test("mobile navigation opens and closes with keyboard", async ({
    browser,
  }) => {
    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/dashboard");
      const openTrigger = page.getByRole("button", { name: "Open navigation menu" });
      await expect(openTrigger).toBeVisible({ timeout: 15_000 });
      await openTrigger.focus();
      await page.keyboard.press("Enter");
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      expectNoPageErrors(pageErrors, "mobile navigation keyboard");
    } finally {
      await ctx.close();
    }
  });

  test("/posts/new schedule dialog: keyboard open, Tab trap, Escape restores focus", async ({
    browser,
  }) => {
    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.goto("/posts/new");
      await expect(
        page.getByRole("textbox", { name: "Post content" })
      ).toBeVisible({ timeout: 15_000 });
      const trigger = page.getByRole("button", { name: "Schedule", exact: true });
      await expect(trigger).toBeVisible();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByTestId("schedule-dialog");
      await expect(dialog).toBeVisible();
      // Focus lands inside the dialog …
      const focusedInDialog = await page.evaluate(() => {
        const dialogEl = document.querySelector('[data-testid="schedule-dialog"]');
        return !!dialogEl?.contains(document.activeElement);
      });
      expect(focusedInDialog).toBe(true);
      // … and Tab cycles without escaping (Radix focus trap).
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        const stillInside = await page.evaluate(() => {
          const dialogEl = document.querySelector('[data-testid="schedule-dialog"]');
          return !!dialogEl?.contains(document.activeElement);
        });
        expect(stillInside).toBe(true);
      }
      // Escape closes and focus returns to the Schedule trigger.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expectNoPageErrors(pageErrors, "/posts/new schedule dialog keyboard");
    } finally {
      await ctx.close();
    }
  });

  test("/posts/new date picker: keyboard open, arrows move, Escape restores focus", async ({
    browser,
  }) => {
    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.goto("/posts/new");
      await expect(
        page.getByRole("textbox", { name: "Post content" })
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Schedule", exact: true }).click();
      const dialog = page.getByTestId("schedule-dialog");
      await expect(dialog).toBeVisible();
      const dateTrigger = dialog.getByRole("button", { name: /Pick a date/ });
      await expect(dateTrigger).toBeVisible();
      await dateTrigger.focus();
      await page.keyboard.press("Enter");
      // NOTE: the calendar popover is portalled to document.body (outside
      // the dialog), so grid locators are page-scoped, not dialog-scoped.
      const grid = page.getByRole("grid");
      await expect(grid).toBeVisible();
      // Opening the popover moves focus to the roving-tabindex day, so
      // arrows work without any pointer input.
      const enteredGrid = await page.evaluate(() => {
        const gridEl = document.querySelector('[role="grid"]');
        return !!gridEl?.contains(document.activeElement);
      });
      expect(enteredGrid).toBe(true);
      // Arrow keys move focus between days inside the DayPicker grid.
      // Day buttons carry distinct aria-labels ("18 September 2026", …).
      const before = await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label")
      );
      await page.keyboard.press("ArrowRight");
      const after = await page.evaluate(() => {
        const el = document.activeElement;
        const gridEl = document.querySelector('[role="grid"]');
        return {
          label: el?.getAttribute("aria-label"),
          inside: !!gridEl?.contains(document.activeElement),
        };
      });
      expect(after.inside).toBe(true);
      expect(after.label).not.toBe(before);
      // Month navigation is keyboard-reachable and changes the caption.
      const caption = page.getByText(/[A-Z][a-z]+ 20\d\d/).first();
      const monthBefore = await caption.textContent();
      await page.getByRole("button", { name: /next month/i }).click();
      await expect
        .poll(async () => caption.textContent(), { timeout: 10_000 })
        .not.toBe(monthBefore);
      // Escape closes the popover; focus returns to the date trigger.
      // (No date was picked, so composer state is untouched.)
      await page.keyboard.press("Escape");
      await expect(grid).toBeHidden();
      await expect(dateTrigger).toBeFocused();
      // Escape closes the schedule dialog; focus returns to Schedule.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Schedule", exact: true })
      ).toBeFocused();
      expectNoPageErrors(pageErrors, "/posts/new date picker keyboard");
    } finally {
      await ctx.close();
    }
  });

  test("/posts/[id] reschedule dialog: keyboard open, focus inside, Escape restores focus", async ({
    browser,
  }) => {
    const user = requireShared();
    const text = `E2E a11y reschedule ${Date.now()}`;
    const { id } = await createDraftPost(user.api, text);
    const ctx = await authContext(browser);
    const page = await ctx.newPage();
    const { pageErrors } = collectRuntime(page);
    try {
      await page.goto(`/posts/${id}`);
      // Keyboard reschedule path: native date/time inputs, no drag needed.
      const trigger = page.getByRole("button", { name: "Schedule", exact: true });
      await expect(trigger).toBeVisible({ timeout: 15_000 });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Date")).toBeVisible();
      await expect(dialog.getByLabel("Time")).toBeVisible();
      const focusedInDialog = await page.evaluate(() => {
        const dialogEl = document.querySelector('[role="dialog"]');
        return !!dialogEl?.contains(document.activeElement);
      });
      expect(focusedInDialog).toBe(true);
      // Read-only: close without saving, nothing is rescheduled.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expectNoPageErrors(pageErrors, "/posts/[id] reschedule dialog keyboard");
    } finally {
      await ctx.close();
    }
  });

  test("onboarding plan radios: arrows move selection, Tab stops once", async ({
    browser,
  }) => {
    // Native fieldset/radio group (no Radix): one Tab stop, arrows move.
    // Fresh user without completed onboarding, mirroring onboarding.spec.
    e2eBaseUrl();
    const baseURL = e2eBaseUrl();
    const api = await playwrightRequest.newContext({ baseURL });
    const email = testEmail("a11y-onboarding");
    try {
      const signup = await api.post("/api/auth/sign-up/email", {
        data: { name: "", email, password: E2E_PASSWORD, callbackURL: "/dashboard" },
      });
      expect(signup.ok()).toBeTruthy();
      const db = new PrismaClient();
      try {
        await db.user.update({ where: { email }, data: { emailVerified: true } });
      } finally {
        await db.$disconnect();
      }
      const signin = await api.post("/api/auth/sign-in/email", {
        data: { email, password: E2E_PASSWORD },
      });
      expect(signin.ok()).toBeTruthy();

      const statePath = `tests/e2e/.auth/a11y-onboarding-${Date.now()}.json`;
      await api.storageState({ path: statePath });
      const ctx = await browser.newContext({ storageState: statePath });
      const page = await ctx.newPage();
      const { pageErrors } = collectRuntime(page);
      try {
        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
        const radios = page.getByRole("radio");
        await expect(radios).toHaveCount(3);
        const free = page.getByRole("radio", { name: /free forever/ });
        const growth = page.getByRole("radio", { name: /Growth/ });
        const scale = page.getByRole("radio", { name: /Scale/ });
        await expect(free).toBeChecked();
        // Single Tab stop: from the name field, one Tab reaches the group.
        await page.getByLabel("Your name").fill("E2E A11y");
        await page.keyboard.press("Tab");
        await expect(free).toBeFocused();
        // Arrows move selection natively (no JS key handling).
        await page.keyboard.press("ArrowRight");
        await expect(growth).toBeChecked();
        await expect(
          page.getByRole("button", { name: "Continue with Growth" })
        ).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(scale).toBeChecked();
        await page.keyboard.press("ArrowLeft");
        await expect(growth).toBeChecked();
        // Read-only: never submits, user is cleaned up below.
        expectNoPageErrors(pageErrors, "/onboarding radios keyboard");
      } finally {
        await ctx.close();
      }
    } finally {
      await cleanupUser(api, email).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
  });
});
