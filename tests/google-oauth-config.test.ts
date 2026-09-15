import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isGoogleOAuthConfigured } from "../src/lib/auth";

/**
 * Google OAuth is optional per environment (src/lib/auth.ts): the
 * provider registers only when BOTH credentials exist, and the
 * login/signup pages gate the button on the same predicate. A missing
 * half must never expose a dead action.
 */
describe("isGoogleOAuthConfigured", () => {
  test("true only with both credentials", () => {
    assert.equal(
      isGoogleOAuthConfigured({
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      }),
      true
    );
  });

  test("false when either credential is missing", () => {
    assert.equal(isGoogleOAuthConfigured({}), false);
    assert.equal(isGoogleOAuthConfigured({ GOOGLE_CLIENT_ID: "id" }), false);
    assert.equal(
      isGoogleOAuthConfigured({ GOOGLE_CLIENT_SECRET: "secret" }),
      false
    );
  });

  test("false on empty strings", () => {
    assert.equal(
      isGoogleOAuthConfigured({
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      }),
      false
    );
  });
});
