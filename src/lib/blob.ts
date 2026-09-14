import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  list,
  presignUrl,
  putImage,
} from "@vercel/blob";
import type { GetBlobResult, ListBlobResult } from "@vercel/blob";
import { isAscii } from "@/lib/media";
import {
  logDiagnostic,
  logErrorDiagnostic,
  safePathname,
} from "@/lib/diagnostics";

export type BlobHead = {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
};

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
  env: Record<string, string | undefined> = process.env
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

export type GetPresignRequest = {
  access: "private";
  operation: "get";
  pathname: string;
};

export function buildGetPresignOptions(pathname: string): GetPresignRequest {
  return { access: "private", operation: "get", pathname };
}

function nonAsciiPathnameError(): Error {
  return new Error(
    "Blob pathname for signed URLs must be ASCII-only. Re-upload the media so the object name is regenerated."
  );
}

export async function deleteBlobs(
  pathnamesOrUrls: string[]
): Promise<void> {
  if (pathnamesOrUrls.length === 0) return;
  await del(pathnamesOrUrls);
}

export type ListedBlob = {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: Date;
};

export type ListMediaPage = {
  blobs: ListedBlob[];
  cursor?: string;
  hasMore: boolean;
};

/**
 * Paginated listing of everything under the `media/` scope, used by the
 * orphan-blob sweep. Narrow rows keep the scan cheap.
 */
export async function listMediaBlobs(cursor?: string): Promise<ListMediaPage> {
  const page: ListBlobResult = await list({
    prefix: "media/",
    limit: 500,
    ...(cursor ? { cursor } : {}),
  });
  return {
    blobs: page.blobs
      .filter((blob) => blob.pathname.startsWith("media/"))
      .map((blob) => ({
        pathname: blob.pathname,
        url: blob.url,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      })),
    cursor: page.cursor,
    hasMore: page.hasMore,
  };
}

export type CanonicalImageResult = {
  url: string;
  pathname: string;
  contentType: string;
};

/**
 * Stores the optimized canonical version of an already-uploaded image at
 * the SAME pathname (overwrite), so Media rows, reserved-path validation
 * and composer status polling keep working unchanged. Requires OIDC
 * (production); throws otherwise and the caller must fall back to the
 * original bytes.
 */
export async function putCanonicalImage(input: {
  pathname: string;
  bytes: ArrayBuffer;
  width: number;
  quality: number;
}): Promise<CanonicalImageResult> {
  if (!isAscii(input.pathname)) {
    throw nonAsciiPathnameError();
  }
  try {
    const stored = await putImage(input.pathname, input.bytes, {
      access: "private",
      allowOverwrite: true,
      optimizeImage: {
        width: input.width,
        quality: input.quality,
        format: "jpeg",
      },
    });
    logDiagnostic("blob", "stored canonical image", {
      pathname: safePathname(input.pathname),
      contentType: stored.contentType,
    });
    return {
      url: stored.url,
      pathname: stored.pathname,
      contentType: stored.contentType,
    };
  } catch (error) {
    logErrorDiagnostic("blob", "canonical image put failed", error, {
      pathname: safePathname(input.pathname),
    });
    throw error;
  }
}

export async function fetchPrivateBlob(
  pathname: string,
  rangeHeader?: string | null
): Promise<GetBlobResult | null> {
  return get(pathname, {
    access: "private",
    useCache: false,
    headers: rangeHeader ? { Range: rangeHeader } : undefined,
  });
}

export async function headPrivateBlob(
  pathname: string
): Promise<BlobHead | null> {
  try {
    const meta = await head(pathname);
    return {
      url: meta.url,
      pathname: meta.pathname,
      size: meta.size,
      contentType: meta.contentType,
    };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    logErrorDiagnostic("blob", "head failed", error, {
      pathname: safePathname(pathname),
    });
    throw error;
  }
}

/**
 * Issues a `put` signed token for the official client upload flow
 * (`uploadPresigned()` + `handleUploadPresigned()`).
 *
 * Uses `issueSignedToken`, which authenticates through the Vercel OIDC
 * credentials injected by the platform (no BLOB_READ_WRITE_TOKEN needed),
 * and keeps the store PRIVATE.
 */
export async function createPutSignedToken(input: {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  ttlMs: number;
}): Promise<Awaited<ReturnType<typeof issueSignedToken>>> {
  if (!isAscii(input.pathname)) {
    logErrorDiagnostic(
      "blob",
      "signed put token aborted: non-ascii pathname",
      new Error("Blob pathname must be ASCII-only for signed tokens."),
      { pathname: safePathname(input.pathname) }
    );
    throw nonAsciiPathnameError();
  }
  try {
    const token = await issueSignedToken({
      pathname: input.pathname,
      operations: ["put"],
      validUntil: Date.now() + input.ttlMs,
      maximumSizeInBytes: input.maximumSizeInBytes,
      allowedContentTypes: [input.contentType],
    });
    logDiagnostic("blob", "issued put signed token", {
      contentType: input.contentType,
      pathname: safePathname(input.pathname),
      maximumSizeInBytes: input.maximumSizeInBytes,
      ttlMs: input.ttlMs,
    });
    return token;
  } catch (error) {
    logErrorDiagnostic("blob", "put signed token failed", error, {
      contentType: input.contentType,
      pathname: safePathname(input.pathname),
    });
    throw error;
  }
}

/**
 * Creates a short-lived signed GET URL for a private blob so that
 * Threads can fetch the image during publishing.
 */
export async function createSignedGetUrl(input: {
  pathname: string;
  ttlMs: number;
}): Promise<string> {
  if (!isAscii(input.pathname)) {
    logErrorDiagnostic(
      "blob",
      "signed get aborted: non-ascii pathname",
      new Error("Blob pathname must be ASCII-only for signed URLs."),
      { pathname: safePathname(input.pathname) }
    );
    throw nonAsciiPathnameError();
  }
  try {
    const validUntil = Date.now() + input.ttlMs;
    const signedToken = await issueSignedToken({
      pathname: input.pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl: signedGetUrl } = await presignUrl(
      signedToken,
      buildGetPresignOptions(input.pathname)
    );
    logDiagnostic("blob", "prepared signed get url", {
      pathname: safePathname(input.pathname),
      ttlMs: input.ttlMs,
    });
    return signedGetUrl;
  } catch (error) {
    logErrorDiagnostic("blob", "signed get url generation failed", error, {
      pathname: safePathname(input.pathname),
      ttlMs: input.ttlMs,
    });
    throw error;
  }
}
