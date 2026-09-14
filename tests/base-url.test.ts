import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCTION_URL, resolveBaseURL } from "../src/lib/base-url";

/**
 * resolveBaseURL() is the `fallback` for the dynamic Better Auth baseURL
 * (`allowedHosts` in src/lib/auth.ts). It must keep resolving the
 * production URL exactly as before — Preview stickiness comes from the
 * per-request host resolution, not from this function.
 */
describe("resolveBaseURL", () => {
  test("production prefers BETTER_AUTH_URL", () => {
    assert.equal(
      resolveBaseURL({
        VERCEL_ENV: "production",
        BETTER_AUTH_URL: "https://postvia.online",
        VERCEL_PROJECT_PRODUCTION_URL: "postvia.vercel.app",
      }),
      "https://postvia.online"
    );
  });

  test("production falls back to VERCEL_PROJECT_PRODUCTION_URL", () => {
    assert.equal(
      resolveBaseURL({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "postvia.vercel.app",
      }),
      "https://postvia.vercel.app"
    );
  });

  test("production bare env falls back to PRODUCTION_URL", () => {
    assert.equal(
      resolveBaseURL({ VERCEL_ENV: "production" }),
      PRODUCTION_URL
    );
  });

  test("shared BETTER_AUTH_URL still resolves (used only as fallback)", () => {
    // The shared Production+Preview BETTER_AUTH_URL value resolves here,
    // but on Preview it is only the `fallback` — the request host wins.
    assert.equal(
      resolveBaseURL({
        VERCEL_ENV: "preview",
        VERCEL_URL: "postvia-abc123-postvia.vercel.app",
        BETTER_AUTH_URL: "https://postvia.online",
      }),
      "https://postvia.online"
    );
  });

  test("preview without BETTER_AUTH_URL resolves VERCEL_URL", () => {
    assert.equal(
      resolveBaseURL({
        VERCEL_ENV: "preview",
        VERCEL_URL: "postvia-abc123-postvia.vercel.app",
      }),
      "https://postvia-abc123-postvia.vercel.app"
    );
  });

  test("local env without URLs resolves undefined (request host wins)", () => {
    assert.equal(resolveBaseURL({}), undefined);
  });
});
