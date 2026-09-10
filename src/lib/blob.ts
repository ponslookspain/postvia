import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from "@vercel/blob";
import type { GetBlobResult } from "@vercel/blob";
import {
  logDiagnostic,
  logErrorDiagnostic,
  safePathname,
} from "@/lib/diagnostics";

export type UploadedBlob = {
  url: string;
  pathname: string;
};

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

export type PutPresignRequest = {
  access: "private";
  operation: "put";
  pathname: string;
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
};

export function buildGetPresignOptions(pathname: string): GetPresignRequest {
  return { access: "private", operation: "get", pathname };
}

export function buildPutPresignOptions(
  pathname: string,
  constraints: { maximumSizeInBytes: number; allowedContentTypes: readonly string[] }
): PutPresignRequest {
  return {
    access: "private",
    operation: "put",
    pathname,
    allowedContentTypes: [...constraints.allowedContentTypes],
    maximumSizeInBytes: constraints.maximumSizeInBytes,
  };
}

export async function uploadPrivateBlob(input: {
  pathname: string;
  body: ArrayBuffer | File | Blob;
  contentType: string;
}): Promise<UploadedBlob> {
  try {
    const result = await put(input.pathname, input.body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.contentType,
    });
    logDiagnostic("blob", "server upload ok", {
      method: "server",
      contentType: input.contentType,
      pathname: safePathname(result.pathname),
    });
    return { url: result.url, pathname: result.pathname };
  } catch (error) {
    logErrorDiagnostic("blob", "server upload failed", error, {
      method: "server",
      contentType: input.contentType,
      pathname: safePathname(input.pathname),
    });
    throw error;
  }
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

export async function headPrivateBlob(pathname: string): Promise<BlobHead | null> {
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

export async function createPresignedUploadUrl(input: {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  ttlMs: number;
}): Promise<{ presignedUrl: string; pathname: string }> {
  try {
    const validUntil = Date.now() + input.ttlMs;
    const signedToken = await issueSignedToken({
      pathname: input.pathname,
      operations: ["put"],
      validUntil,
      maximumSizeInBytes: input.maximumSizeInBytes,
      allowedContentTypes: [input.contentType],
    });
    const { presignedUrl } = await presignUrl(
      signedToken,
      buildPutPresignOptions(input.pathname, {
        maximumSizeInBytes: input.maximumSizeInBytes,
        allowedContentTypes: [input.contentType],
      })
    );
    logDiagnostic("blob", "prepared presigned put url", {
      method: "client",
      contentType: input.contentType,
      pathname: safePathname(input.pathname),
    });
    return { presignedUrl, pathname: input.pathname };
  } catch (error) {
    logErrorDiagnostic("blob", "presigned put url preparation failed", error, {
      contentType: input.contentType,
      pathname: safePathname(input.pathname),
    });
    throw error;
  }
}

export async function createSignedGetUrl(input: {
  pathname: string;
  ttlMs: number;
}): Promise<string> {
  try {
    const validUntil = Date.now() + input.ttlMs;
    const signedToken = await issueSignedToken({
      pathname: input.pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(
      signedToken,
      buildGetPresignOptions(input.pathname)
    );
    logDiagnostic("blob", "prepared signed get url", {
      pathname: safePathname(input.pathname),
      ttlMs: input.ttlMs,
    });
    return presignedUrl;
  } catch (error) {
    logErrorDiagnostic("blob", "signed get url generation failed", error, {
      pathname: safePathname(input.pathname),
      ttlMs: input.ttlMs,
    });
    throw error;
  }
}