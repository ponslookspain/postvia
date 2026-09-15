import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  isAscii,
  makeBlobPathname,
  MAX_MEDIA_PER_POST,
  sanitizeFilename,
  validateMediaInput,
} from "@/lib/media";
import {
  deleteBlobs,
  fetchPrivateBlob,
  headPrivateBlob,
  putCanonicalImage,
} from "@/lib/blob";
import { selectImageOptimization } from "@/lib/media-optimize";
import {
  logDiagnostic,
  logErrorDiagnostic,
  safePathname,
} from "@/lib/diagnostics";

export const CLIENT_UPLOAD_TTL_MS = 5 * 60 * 1000;

/**
 * Result of authorizing a user to upload media to a post.
 */
export type MediaAuthorizeResult =
  | { ok: true; userId: string; postId: string }
  | { ok: false; status: number; error: string };

/**
 * Authorize a user to upload media to a post.
 * Checks authentication, post existence, and ownership.
 */
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

/**
 * Payload the client passes as `clientPayload` (a string) to
 * `uploadPresigned()` from `@vercel/blob/client`.
 */
export type ClientUploadPayload = {
  postId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type ClientPayloadResult =
  | { ok: true; data: ClientUploadPayload }
  | { ok: false; error: string };

export function parseClientPayload(raw: string | null): ClientPayloadResult {
  if (!raw) {
    return { ok: false, error: "clientPayload is required" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "clientPayload must be valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "clientPayload must be a JSON object" };
  }
  const o = parsed as Record<string, unknown>;
  const postId = typeof o.postId === "string" ? o.postId.trim() : "";
  const filename = typeof o.filename === "string" ? o.filename : "";
  const mimeType = typeof o.mimeType === "string" ? o.mimeType : "";
  const size = typeof o.size === "number" ? o.size : Number.NaN;
  if (!postId) {
    return { ok: false, error: "clientPayload.postId is required" };
  }
  return { ok: true, data: { postId, filename, mimeType, size } };
}

/**
 * Shape of a server-generated (trusted) upload path:
 *   media/{userId}/{postId}/{32 hex chars}-{ascii-name}
 */
const RESERVED_LEAF = "[A-Za-z0-9][A-Za-z0-9._-]{0,99}";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildReservedPathnameRegex(
  userId: string,
  postId: string
): RegExp {
  return new RegExp(
    `^media/${escapeRegex(userId)}/${escapeRegex(postId)}/[0-9a-f]{32}-${RESERVED_LEAF}$`
  );
}

/**
 * Validates that a client-supplied pathname was actually minted by
 * `/api/media/prepare` for this exact user + post. Blocks path
 * traversal, other users' folders, and non-ASCII keys.
 */
export function validateReservedPathname(
  pathname: string,
  userId: string,
  postId: string
): boolean {
  if (!isAscii(pathname)) return false;
  return buildReservedPathnameRegex(userId, postId).test(pathname);
}

export type ReserveUploadResult =
  | { ok: true; pathname: string }
  | { ok: false; status: number; error: string };

/**
 * Step 1 of the official client-upload flow (browser, session-authenticated):
 * reserve the authoritative, user/post-scoped, ASCII-only blob pathname.
 * The client never invents pathnames; the server does.
 */
export async function reserveUploadPathname(input: {
  user: { id: string } | null;
  postId: string;
  filename: string;
  mimeType: string;
  size: number;
}): Promise<ReserveUploadResult> {
  // Pure input gates before any database work: unauthenticated or
  // post-less requests fail without touching Prisma.
  if (!input.user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  if (!input.postId) {
    return { ok: false, status: 400, error: "postId is required" };
  }
  // Ownership lookup and the per-post media count are independent reads
  // (both scoped by user id); every decision below still short-circuits
  // on the authorization/validation results in the same order as before.
  const [post, existingMediaCount] = await Promise.all([
    prisma.post.findFirst({
      where: { id: input.postId, userId: input.user.id },
      select: { userId: true },
    }),
    prisma.media.count({
      where: { postId: input.postId, userId: input.user.id },
    }),
  ]);

  const authorized = authorizeMediaUpload({
    user: input.user,
    post,
    statedPostId: input.postId,
  });
  if (!authorized.ok) return authorized;

  const validation = validateMediaInput(input.mimeType, input.size);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }

  const existing = existingMediaCount;
  if (existing >= MAX_MEDIA_PER_POST) {
    return {
      ok: false,
      status: 400,
      error: `A post can have at most ${MAX_MEDIA_PER_POST} media files`,
    };
  }

  const pathname = makeBlobPathname(
    authorized.userId,
    authorized.postId,
    input.filename
  );
  logDiagnostic("media", "upload path reserved", {
    stage: "prepare",
    size: input.size,
    mimeType: input.mimeType,
    pathname: safePathname(pathname),
  });
  return { ok: true, pathname };
}

/**
 * Trusted server-side context attached to the signed token
 * (`urlOptions.tokenPayload`). Vercel Blob echoes it back verbatim in
 * the `blob.upload-completed` webhook, so Media creation never has to
 * trust anything the browser sends.
 */
export type UploadTokenPayload = {
  userId: string;
  postId: string;
  filename: string;
};

export function buildUploadTokenPayload(input: UploadTokenPayload): string {
  return JSON.stringify(input);
}

export function parseUploadTokenPayload(
  raw: string | null | undefined
): { ok: true; data: UploadTokenPayload } | { ok: false; error: string } {
  if (!raw) {
    return { ok: false, error: "tokenPayload is missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "tokenPayload is not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "tokenPayload must be a JSON object" };
  }
  const o = parsed as Record<string, unknown>;
  const userId = typeof o.userId === "string" ? o.userId : "";
  const postId = typeof o.postId === "string" ? o.postId : "";
  const filename = typeof o.filename === "string" ? o.filename : "";
  if (!userId || !postId) {
    return { ok: false, error: "tokenPayload is missing userId or postId" };
  }
  return { ok: true, data: { userId, postId, filename } };
}

/**
 * Minimal blob fields present in the `blob.upload-completed` payload
 * (`PutBlobResult` from the SDK).
 */
export type CompletedBlobInfo = {
  pathname: string;
  url: string;
  contentType: string;
};

export type CompletedUploadOutcome =
  | {
      ok: true;
      userId: string;
      postId: string;
      createInput: {
        userId: string;
        postId: string;
        url: string;
        pathname: string;
        filename: string;
        mimeType: string;
        size: number;
        type: "IMAGE" | "VIDEO";
      };
    }
  | { ok: false; error: string };

/**
 * Pure validation of a completed-upload event before it becomes a row:
 * - the tokenPayload (server-issued) determines user/post/filename,
 * - the stored pathname must be a pathname this server reserved
 *   (strict reserved-path check, not a prefix match, so a re-encoded or
 *   non-ASCII pathname can never validate),
 * - the actual stored content type + size must pass media policy.
 */
export function validateCompletedUpload(input: {
  blob: CompletedBlobInfo;
  tokenPayloadRaw: string | null | undefined;
  size: number;
}): CompletedUploadOutcome {
  const parsed = parseUploadTokenPayload(input.tokenPayloadRaw);
  if (!parsed.ok) return parsed;
  const { userId, postId, filename } = parsed.data;

  if (!validateReservedPathname(input.blob.pathname, userId, postId)) {
    return {
      ok: false,
      error: "Uploaded blob path does not match the authorized scope",
    };
  }

  const validation = validateMediaInput(input.blob.contentType, input.size);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  return {
    ok: true,
    userId,
    postId,
    createInput: {
      userId,
      postId,
      url: input.blob.url,
      pathname: input.blob.pathname,
      filename: sanitizeFilename(filename),
      mimeType: input.blob.contentType,
      size: input.size,
      type: validation.kind,
    },
  };
}

/**
 * Step 4 of the official flow: called by `handleUploadPresigned` when
 * Vercel Blob reports the browser upload finished (webhook, Ed25519
 * signature-verified). Verifies the object in the PRIVATE store, replaces
 * still images with their optimized canonical version (same pathname, so
 * validation, polling and Media rows keep working unchanged), then creates
 * the Media row. Throws on any problem so the webhook retries.
 * Idempotent: a retried webhook for the same pathname is a no-op.
 *
 * Availability first: if canonicalization fails, the original bytes are
 * registered instead of failing the upload.
 */
export async function registerCompletedUpload(payload: {
  blob: CompletedBlobInfo;
  tokenPayload?: string | null;
}): Promise<void> {
  const meta = await headPrivateBlob(payload.blob.pathname);
  if (!meta) {
    logErrorDiagnostic(
      "media",
      "upload-completed for missing blob",
      new Error("Blob not present in store"),
      { stage: "upload-completed", pathname: safePathname(payload.blob.pathname) }
    );
    throw new Error("Uploaded blob not found in store; will retry");
  }

  const outcome = validateCompletedUpload({
    blob: {
      pathname: meta.pathname,
      url: meta.url,
      contentType: meta.contentType,
    },
    tokenPayloadRaw: payload.tokenPayload,
    size: meta.size,
  });
  if (!outcome.ok) {
    try {
      await deleteBlobs([meta.pathname]);
    } catch {
      // Best-effort orphan cleanup; ignore secondary failures.
    }
    throw new Error(outcome.error);
  }

  const existing = await prisma.media.findFirst({
    where: { pathname: meta.pathname },
    select: { id: true },
  });
  if (existing) {
    logDiagnostic("media", "upload already registered", {
      stage: "media-create",
      pathname: safePathname(meta.pathname),
    });
    return;
  }

  const canonical = await canonicalizeStoredImage({
    pathname: meta.pathname,
    originalUrl: meta.url,
    contentType: meta.contentType,
    size: meta.size,
  });

  try {
    await prisma.media.create({
      data: {
        ...outcome.createInput,
        url: canonical.url,
        mimeType: canonical.contentType,
        size: canonical.size,
      },
    });
  } catch (error) {
    if (isDuplicatePathnameError(error)) {
      // A concurrent webhook delivery already registered this pathname
      // (unique index): the upload is complete, this delivery is a no-op.
      logDiagnostic("media", "duplicate webhook collapsed to no-op", {
        stage: "media-create",
        pathname: safePathname(meta.pathname),
      });
      return;
    }
    throw error;
  }
  logDiagnostic("media", "media record created from client upload", {
    stage: "media-create",
    size: canonical.size,
    mimeType: canonical.contentType,
    pathname: safePathname(meta.pathname),
  });
}

/**
 * Replaces a stored still image with its canonical optimized version at
 * the same pathname and returns the canonical meta. GIFs, videos and
 * already-small JPEGs pass through untouched. Any failure falls back to
 * the original bytes (logged) so uploads never break on optimization.
 */
async function canonicalizeStoredImage(input: {
  pathname: string;
  originalUrl: string;
  contentType: string;
  size: number;
}): Promise<{ url: string; contentType: string; size: number }> {
  const spec = selectImageOptimization({
    mimeType: input.contentType,
    size: input.size,
  });
  if (!spec) {
    const current = await headPrivateBlob(input.pathname).catch(() => null);
    return {
      url: current?.url ?? input.originalUrl,
      contentType: current?.contentType ?? input.contentType,
      size: current?.size ?? input.size,
    };
  }
  try {
    const source = await fetchPrivateBlob(input.pathname);
    if (!source?.stream) {
      throw new Error("Stored image could not be read back for optimization");
    }
    const bytes = await new Response(source.stream).arrayBuffer();
    const stored = await putCanonicalImage({
      pathname: input.pathname,
      bytes,
      width: spec.width,
      quality: spec.quality,
    });
    const canonicalMeta = await headPrivateBlob(input.pathname);
    if (!canonicalMeta) {
      throw new Error("Canonical image missing after overwrite");
    }
    logDiagnostic("media", "canonical image stored", {
      stage: "media-optimize",
      pathname: safePathname(input.pathname),
      originalSize: input.size,
      canonicalSize: canonicalMeta.size,
    });
    return {
      url: stored.url,
      contentType: canonicalMeta.contentType,
      size: canonicalMeta.size,
    };
  } catch (error) {
    logErrorDiagnostic("media", "canonicalization failed, keeping original", error, {
      stage: "media-optimize",
      pathname: safePathname(input.pathname),
    });
    const current = await headPrivateBlob(input.pathname).catch(() => null);
    return {
      url: current?.url ?? input.originalUrl,
      contentType: current?.contentType ?? input.contentType,
      size: current?.size ?? input.size,
    };
  }
}

/**
 * True when a Media insert failed only because a concurrent webhook already
 * registered the same pathname (`@@unique([pathname])`). The upload is
 * complete either way, so the caller treats it as a successful no-op.
 */
export function isDuplicatePathnameError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Ownership-scoped lookup used by the composer to wait for the webhook
 * to land before publishing.
 */
export async function isUploadRegistered(input: {
  userId: string;
  postId: string;
  pathname: string;
}): Promise<boolean> {
  if (!input.pathname.startsWith(`media/${input.userId}/${input.postId}/`)) {
    return false;
  }
  const media = await prisma.media.findFirst({
    where: {
      userId: input.userId,
      postId: input.postId,
      pathname: input.pathname,
    },
    select: { id: true },
  });
  return Boolean(media);
}
