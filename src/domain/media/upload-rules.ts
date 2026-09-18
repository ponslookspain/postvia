/**
 * Pure media upload rules (domain).
 *
 * Deterministic validation + codecs + security decisions for the upload
 * flow. No Prisma, no Blob SDK, no network, no logging, no environment
 * access — everything here is a pure function over its inputs, so every
 * case is unit-testable. Orchestration (Prisma reads, Blob IO, orphan
 * cleanup, advisory-locked registration) stays in `src/lib/media-upload.ts`,
 * which re-exports this module for compatibility.
 *
 * DOMAIN RULE: import only `@/domain/media/policy` (pure). Never Prisma,
 * Blob, Next.js, React, fetch, diagnostics, Sentry, or `process.env`.
 */
import {
  isAscii,
  sanitizeFilename,
  validateMediaInput,
  type MediaKind,
} from "./policy";

export const CLIENT_UPLOAD_TTL_MS = 5 * 60 * 1000;

/**
 * Result of authorizing a user to upload media to a post.
 */
export type MediaAuthorizeResult =
  | { ok: true; userId: string; postId: string }
  | { ok: false; status: number; error: string };

/**
 * Authorize a user to upload media to a post.
 *
 * Self-contained security boundary: checks authentication, post existence,
 * AND ownership (post.userId === user.id) internally, so safety never
 * depends on the caller having pre-scoped the post lookup. Caller-side
 * scoped queries remain as defence-in-depth.
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
  if (input.post.userId !== input.user.id) {
    // Same 404 as missing: no oracle for other users' post ids.
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
        type: MediaKind;
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
 *
 * Never deletes anything: on rejection the orchestration layer
 * (`src/lib/media-upload.ts`) removes the rejected blob.
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
 * Thrown when a completed upload cannot become a row for a permanent reason
 * (over the per-post cap, failed signature check). Distinguished from
 * transient failures so callers and logs can tell "will never succeed" from
 * "retry me" — the blob is always removed before this is raised.
 */
export class MediaRegistrationRejected extends Error {
  readonly reason: "media-cap" | "signature-mismatch" | "video-invalid";

  constructor(
    reason: "media-cap" | "signature-mismatch" | "video-invalid",
    message: string
  ) {
    super(message);
    this.name = "MediaRegistrationRejected";
    this.reason = reason;
  }
}
