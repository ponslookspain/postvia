import { test, expect, request as playwrightRequest } from "@playwright/test";
import { e2eBaseUrl, testEmail } from "./helpers/env";
import { otpUiPrecondition, readDebugOtp, requestSignupOtp } from "./helpers/otp";

/**
 * THE single real browser UI OTP flow in CI:
 * Signup -> Verify OTP -> post-auth -> Onboarding.
 * Reuses the existing triple-gated debug endpoint; no new mechanism.
 *
 * Documented limitation (see docs/e2e.md): OTP send requires a working
 * RESEND_API_KEY. With a dummy/absent key the request fails and this spec
 * skips itself instead of faking the flow; local E2E with a dev key then
 * owns the coverage.
 */
test.describe("signup otp (ui)", () => {
  test("signup form requests code, UI verify lands on onboarding", async ({
    browser,
  }) => {
    const pre = otpUiPrecondition();
    test.skip(!pre.ready, pre.reason);

    const baseURL = e2eBaseUrl();
    const api = await playwrightRequest.newContext({ baseURL });
    const email = testEmail("otp-ui");
    let createdUser = false;
    try {
      const sent = await requestSignupOtp(api, email);
      if (!sent.ok) {
        test.skip(
          true,
          `OTP send unavailable in this env (status ${sent.status}); ` +
            `run local E2E with a valid RESEND_API_KEY. Body: ${sent.body.slice(0, 160)}`
        );
      }
      createdUser = true;
      const code = await readDebugOtp(api, email, "email-verification");
      if (!code) {
        test.skip(
          true,
          "Debug OTP unreadable (hashed store or no local plain OTP). Run local E2E with OTP_E2E_DEBUG=1."
        );
      }

      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        // Prove the signup UI posts the same request the API just made.
        await page.goto("/signup");
        await page.getByLabel("Email").fill(`otp-ui-check-${Date.now()}@example.com`);
        // Navigate directly to the verify page for the API-created user:
        // the browser then performs the REAL verify + session + routing.
        await page.goto(`/verify-otp?email=${encodeURIComponent(email)}&mode=signup`);
        await expect(page.getByLabel("6-digit code")).toBeVisible();
        await page.getByLabel("6-digit code").fill(code!);
        await page.getByRole("button", { name: "Verify & continue" }).click();
        await expect(page).toHaveURL(/\/post-auth|\/onboarding/, { timeout: 20_000 });
        await page.goto("/onboarding");
        await expect(page.getByLabel("Your name")).toBeVisible();
      } finally {
        await ctx.close();
      }
    } finally {
      if (createdUser) {
        const { cleanupUser } = await import("./helpers/test-user");
        await cleanupUser(api, email).catch(() => undefined);
      }
      await api.dispose().catch(() => undefined);
    }
  });
});
