import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { describeBlobAuth } from "../src/lib/blob";

/**
 * Regression test for the local upload failure behind the browser error
 * "Vercel Blob: Failed to retrieve the presigned URL": the dev machine had
 * neither BLOB_READ_WRITE_TOKEN nor an OIDC BLOB_STORE_ID binding, so every
 * `issueSignedToken` call threw "No blob credentials found" and
 * /api/media/upload answered 400. The route now prefights with
 * describeBlobAuth() and fails fast with an actionable message.
 *
 * Pure env-mapping tests — no network, no secrets asserted (only the
 * presence contract: status output must never echo credential values).
 */
describe("describeBlobAuth", () => {
  test("read-write token wins (production-linked shape)", () => {
    assert.deepEqual(
      describeBlobAuth({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc" }),
      { mode: "read-write-token" }
    );
  });

  test("read-write token wins even with a stale OIDC token present", () => {
    assert.deepEqual(
      describeBlobAuth({
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc",
        VERCEL_OIDC_TOKEN: "expired",
      }),
      { mode: "read-write-token" }
    );
  });

  test("OIDC token plus store id is a configured OIDC binding", () => {
    assert.deepEqual(
      describeBlobAuth({
        VERCEL_OIDC_TOKEN: "oidc",
        BLOB_STORE_ID: "store_abc",
      }),
      { mode: "oidc" }
    );
  });

  test("OIDC token without store id is unconfigured (SDK would throw)", () => {
    assert.deepEqual(describeBlobAuth({ VERCEL_OIDC_TOKEN: "oidc" }), {
      mode: "unconfigured",
      missing: ["BLOB_STORE_ID"],
    });
  });

  test("empty env is unconfigured and names the read-write token", () => {
    assert.deepEqual(describeBlobAuth({}), {
      mode: "unconfigured",
      missing: ["BLOB_READ_WRITE_TOKEN"],
    });
  });

  test("blank values count as missing, output never echoes secrets", () => {
    const secret = "vercel_blob_rw_SUPER_SECRET_VALUE";
    const status = describeBlobAuth({ BLOB_READ_WRITE_TOKEN: "   " });
    assert.deepEqual(status, {
      mode: "unconfigured",
      missing: ["BLOB_READ_WRITE_TOKEN"],
    });
    assert.ok(!JSON.stringify(status).includes("SUPER_SECRET_VALUE"));
    const okStatus = describeBlobAuth({ BLOB_READ_WRITE_TOKEN: secret });
    assert.ok(!JSON.stringify(okStatus).includes(secret));
  });
});
