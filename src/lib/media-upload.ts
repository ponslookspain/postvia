import type { Media } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  MEDIA_LIMITS,
  makeBlobPathname,
  sanitizeFilename,
  validateMediaInput,
} from "@/lib/media";
import {
  createPresignedUploadUrl,
  deleteBlobs,
  headPrivateBlob,
} from "@/lib/blob";
import {
  logBlobAuthEnvPresence,
  logDiagnostic,
  logErrorDiagnostic,
  safePathname,
} from "@/lib/diagnostics";

export const CLIENT_UPLOAD_TTL_MS = 5 * 60 * 1000;

export type UploadErrorResult = {
  ok: false;
  status: number;
  error: string;
};

export function shouldUseClientUpload(sizeBytes: number): boolean {
  return sizeBytes > 0;
}

export type MediaAuthorizeResult =
  | { ok: true; userId: string; postId: string }
  | UploadErrorResult;

export function authorizeMediaUpload(input: {
  user: { id: string } | null;
  post: { userId: string } | null;
  statedPostId: string;
}): MediaAuthorizeResult {
  if (!input.user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  if (!input.statedPostId) {
    return { ok: false, status: 400, error: "postId is required" };
  }
  if (!input.post) {
    return { ok: false, status: 404, error: "Post not found" };
  }
  return { ok: true, userId: input.user.id, postId: input.statedPostId };
}

export type PrepareUploadResult =
  | { ok: true; presignedUrl: string; pathname: string }
  | UploadErrorResult;

export async function prepareClientUpload(input: {
  user: { id: string } | null;
  postId: string | null;
  filename: string;
  mimeType: string;
  size: number;
}): Promise<PrepareUploadResult> {
  if (!input.user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const post = input.postId
    ? await prisma.post.findFirst({
        where: { id: input.postId, userId: input.user.id },
        select: { userId: true },
      })
    : null;

  const authorized = authorizeMediaUpload({
    user: input.user,
    post,
    statedPostId: input.postId ?? "",
  });
  if (!authorized.ok) return authorized;

  const validation = validateMediaInput(input.mimeType, input.size);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }

  const pathname = makeBlobPathname(authorized.userId, input.filename);
  logBlobAuthEnvPresence();

  try {
    const { presignedUrl } = await createPresignedUploadUrl({
      pathname,
      contentType: input.mimeType,
      maximumSizeInBytes: MEDIA_LIMITS[validation.kind].maxBytes,
      ttlMs: CLIENT_UPLOAD_TTL_MS,
    });
    logDiagnostic("media", "client upload prepared", {
      method: "client",
      size: input.size,
      mimeType: input.mimeType,
      pathname: safePathname(pathname),
      status: 200,
    });
    return { ok: true, presignedUrl, pathname };
  } catch {
    return { ok: false, status: 500, error: "Failed to prepare upload" };
  }
}

export type ConfirmUploadResult =
  | { ok: false; status: number; error: string }
  | { ok: true; media: Media };

export async function confirmClientUpload(input: {
  user: { id: string } | null;
  postId: string | null;
  filename: string;
  pathname: string | null;
}): Promise<ConfirmUploadResult> {
  if (!input.user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const post = input.postId
    ? await prisma.post.findFirst({
        where: { id: input.postId, userId: input.user.id },
        select: { userId: true },
      })
    : null;

  const authorized = authorizeMediaUpload({
    user: input.user,
    post,
    statedPostId: input.postId ?? "",
  });
  if (!authorized.ok) return authorized;

  if (!input.pathname || !input.pathname.startsWith(`media/${authorized.userId}/`)) {
    return { ok: false, status: 404, error: "Upload not found" };
  }

  let meta;
  try {
    meta = await headPrivateBlob(input.pathname);
  } catch {
    return { ok: false, status: 500, error: "Failed to verify upload" };
  }
  if (!meta) {
    return { ok: false, status: 404, error: "Upload not found" };
  }

  const validation = validateMediaInput(meta.contentType, meta.size);
  if (!validation.ok) {
    try {
      await deleteBlobs([meta.pathname]);
    } catch {
      // Best-effort orphan cleanup; ignore secondary failures.
    }
    return { ok: false, status: 400, error: validation.error };
  }

  try {
    const media = await prisma.media.create({
      data: {
        userId: authorized.userId,
        postId: authorized.postId,
        url: meta.url,
        pathname: meta.pathname,
        filename: sanitizeFilename(input.filename),
        mimeType: meta.contentType,
        size: meta.size,
        type: validation.kind,
      },
    });
    logDiagnostic("media", "client upload confirmed", {
      method: "client",
      size: meta.size,
      mimeType: meta.contentType,
      pathname: safePathname(meta.pathname),
      status: 201,
    });
    return { ok: true, media };
  } catch (error) {
    logErrorDiagnostic(
      "media",
      "media record creation failed; removing blob",
      error,
      { pathname: safePathname(meta.pathname) }
    );
    try {
      await deleteBlobs([meta.pathname]);
    } catch {
      // Best-effort orphan cleanup; ignore secondary failures.
    }
    return { ok: false, status: 500, error: "Failed to create media record" };
  }
}