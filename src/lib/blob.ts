import { del, get, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { GetBlobResult } from "@vercel/blob";

export type UploadedBlob = {
  url: string;
  pathname: string;
};

export async function uploadPrivateBlob(input: {
  pathname: string;
  body: ArrayBuffer | File | Blob;
  contentType: string;
}): Promise<UploadedBlob> {
  const result = await put(input.pathname, input.body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: input.contentType,
  });
  return { url: result.url, pathname: result.pathname };
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

export async function createSignedGetUrl(input: {
  pathname: string;
  ttlMs: number;
}): Promise<string> {
  const validUntil = Date.now() + input.ttlMs;
  const signedToken = await issueSignedToken({
    pathname: input.pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname: input.pathname,
    validUntil,
  });
  return presignedUrl;
}