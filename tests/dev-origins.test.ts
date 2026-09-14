import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  originToAllowedHost,
  resolveExtraTrustedOrigins,
} from "../src/lib/base-url";

/**
 * Local-dev origin extension for Better Auth (`allowedHosts` /
 * `trustedOrigins` in src/lib/auth.ts). Contract:
 * - unset/empty => no extras, so Production/Preview resolution is
 *   byte-for-byte identical to the historical allowlist;
 * - the dev hostname is never hardcoded — it always comes from
 *   `BETTER_AUTH_TRUSTED_ORIGINS` (see docs/local-social-dev.md).
 */
describe("resolveExtraTrustedOrigins", () => {
  test("unset env yields no extras (production untouched)", () => {
    assert.deepEqual(resolveExtraTrustedOrigins({}), []);
  });

  test("blank env yields no extras", () => {
    assert.deepEqual(
      resolveExtraTrustedOrigins({ BETTER_AUTH_TRUSTED_ORIGINS: "  ," }),
      []
    );
  });

  test("parses a single dev origin", () => {
    assert.deepEqual(
      resolveExtraTrustedOrigins({
        BETTER_AUTH_TRUSTED_ORIGINS: "https://dev.postvia.online",
      }),
      ["https://dev.postvia.online"]
    );
  });

  test("parses CSV, trims, dedupes, drops invalid entries", () => {
    assert.deepEqual(
      resolveExtraTrustedOrigins({
        BETTER_AUTH_TRUSTED_ORIGINS:
          " https://dev.postvia.online/,https://dev.postvia.online , ftp://x, not-a-url, http://localhost:3000 ",
      }),
      ["https://dev.postvia.online", "http://localhost:3000"]
    );
  });
});

describe("originToAllowedHost", () => {
  test("maps https origin to host", () => {
    assert.equal(
      originToAllowedHost("https://dev.postvia.online"),
      "dev.postvia.online"
    );
  });

  test("keeps non-default ports", () => {
    assert.equal(
      originToAllowedHost("http://localhost:3000"),
      "localhost:3000"
    );
  });

  test("rejects origins with paths and invalid input", () => {
    assert.equal(originToAllowedHost("https://host/app"), null);
    assert.equal(originToAllowedHost("not-a-url"), null);
  });
});
