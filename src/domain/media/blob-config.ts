/**
 * Blob configuration description (domain).
 *
 * Pure credential/config preflight: presence flags and names only, never
 * secret values. No Blob SDK, no network, no logging — and no environment
 * access: the caller supplies `env` explicitly. The infrastructure adapter
 * (`src/lib/blob.ts`) reads `process.env` and delegates here.
 *
 * DOMAIN RULE: import nothing except standard primitives. Never Prisma,
 * Blob SDK, Next.js, React, fetch, diagnostics, Sentry, or `process.env`.
 */
export type BlobAuthStatus =
  | { mode: "read-write-token" }
  | { mode: "oidc" }
  | { mode: "unconfigured"; missing: string[] };

/**
 * Pure credential preflight mirroring @vercel/blob's `resolveBlobAuth`
 * (token option is never used by this codebase — every call relies on
 * ambient env, exactly like production where Vercel injects the store
 * binding). Returns presence flags only, never secret values.
 *
 * Why this exists: local development has no injected store binding, so a
 * missing `BLOB_READ_WRITE_TOKEN` (and no OIDC `BLOB_STORE_ID`) fails
 * every Blob call with "No blob credentials found" — surfacing in the
 * browser as the opaque SDK error "Failed to retrieve the presigned URL".
 * Callers use this to fail fast with an actionable message instead.
 */
export function describeBlobAuth(
  env: Record<string, string | undefined>
): BlobAuthStatus {
  if (env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return { mode: "read-write-token" };
  }
  if (env.VERCEL_OIDC_TOKEN?.trim() && env.BLOB_STORE_ID?.trim()) {
    return { mode: "oidc" };
  }
  const missing =
    env.VERCEL_OIDC_TOKEN?.trim() && !env.BLOB_STORE_ID?.trim()
      ? ["BLOB_STORE_ID"]
      : ["BLOB_READ_WRITE_TOKEN"];
  return { mode: "unconfigured", missing };
}

export type MediaUploadConfigStatus =
  | { ok: true }
  | { ok: false; missing: string[] };

/**
 * Full preflight for the presigned browser-upload endpoint
 * (`POST /api/media/upload` → `handleUploadPresigned`). Beyond Blob API
 * credentials, the SDK also requires `webhookPublicKey` up front to verify
 * the later `blob.upload-completed` callback — without it the SDK throws
 * "Missing webhook public key" before any token is minted, and the browser
 * only sees "Failed to retrieve the presigned URL". Names only, never
 * values.
 */
export function describeMediaUploadConfig(
  env: Record<string, string | undefined>
): MediaUploadConfigStatus {
  const missing: string[] = [];
  if (!env.BLOB_WEBHOOK_PUBLIC_KEY?.trim()) {
    missing.push("BLOB_WEBHOOK_PUBLIC_KEY");
  }
  const auth = describeBlobAuth(env);
  if (auth.mode === "unconfigured") {
    missing.push(...auth.missing);
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export type GetPresignRequest = {
  access: "private";
  operation: "get";
  pathname: string;
};

export function buildGetPresignOptions(pathname: string): GetPresignRequest {
  return { access: "private", operation: "get", pathname };
}
