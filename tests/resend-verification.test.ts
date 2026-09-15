import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveVerificationCallbackURL } from "../src/app/api/auth/resend-verification/route";

/**
 * The verification email must never become an open redirect: only
 * root-relative app paths are honored, everything else falls back to
 * /verify-email.
 */
describe("resolveVerificationCallbackURL", () => {
  test("root-relative paths pass through", () => {
    assert.equal(resolveVerificationCallbackURL("/verify-email"), "/verify-email");
    assert.equal(resolveVerificationCallbackURL("/login?next=/billing"), "/login?next=/billing");
  });

  test("absolute, protocol-relative and non-string values fall back", () => {
    assert.equal(
      resolveVerificationCallbackURL("https://evil.example/steal"),
      "/verify-email"
    );
    assert.equal(resolveVerificationCallbackURL("//evil.example/x"), "/verify-email");
    assert.equal(resolveVerificationCallbackURL("javascript:alert(1)"), "/verify-email");
    assert.equal(resolveVerificationCallbackURL(null), "/verify-email");
    assert.equal(resolveVerificationCallbackURL(undefined), "/verify-email");
    assert.equal(resolveVerificationCallbackURL(42), "/verify-email");
  });
});
