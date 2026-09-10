import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
} from "@vercel/blob";
import type { GetBlobResult } from "@vercel/blob";
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
