import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isOtpDebugEnabled } from "../src/app/api/auth/otp/debug/route";

/**
 * The OTP debug endpoint must answer ONLY on a local runtime. Any Vercel
 * environment (including preview with OTP_E2E_DEBUG=1 set by mistake)
 * stays dark — otherwise live OTP codes are readable with the debug
 * token. Auth plaintext storage (auth.ts otpE2EDebug) follows the same
 * predicate.
 */
describe("isOtpDebugEnabled", () => {
  test("enabled locally with the flag", () => {
    assert.equal(
      isOtpDebugEnabled({ OTP_E2E_DEBUG: "1", NODE_ENV: "development" }),
      true
    );
  });

  test("disabled without the flag, even locally", () => {
    assert.equal(isOtpDebugEnabled({ NODE_ENV: "development" }), false);
    assert.equal(
      isOtpDebugEnabled({ OTP_E2E_DEBUG: "0", NODE_ENV: "development" }),
      false
    );
  });

  test("disabled on every Vercel env, even with the flag set", () => {
    for (const VERCEL_ENV of ["development", "preview", "production"]) {
      assert.equal(
        isOtpDebugEnabled({
          OTP_E2E_DEBUG: "1",
          VERCEL_ENV,
          NODE_ENV: "production",
        }),
        false,
        `must stay dark on Vercel ${VERCEL_ENV}`
      );
    }
    assert.equal(
      isOtpDebugEnabled({
        OTP_E2E_DEBUG: "1",
        VERCEL_ENV: "preview",
        NODE_ENV: "development",
      }),
      false
    );
  });

  test("disabled under production node regardless of host", () => {
    assert.equal(
      isOtpDebugEnabled({ OTP_E2E_DEBUG: "1", NODE_ENV: "production" }),
      false
    );
  });
});
