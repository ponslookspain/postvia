import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  isAscii,
  makeBlobPathname,
  MAX_MEDIA_PER_POST,
  sanitizeFilename,
  validateMediaInput,
  type MediaKind,
} from "@/lib/media";
import {
  deleteBlobs,
  fetchPrivateBlob,
  headPrivateBlob,
  putCanonicalImage,
} from "@/lib/blob";
import { selectImageOptimization } from "@/lib/media-optimize";
import {
  SIGNATURE_PROBE_BYTES,
  verifyMediaSignature,
  type SignatureCheck,
} from "@/lib/media-signature";
import {
  checkVideoDuration,
  isIsoBaseMediaMime,
  probeIsoBaseMediaDuration,
  VIDEO_HEAD_PROBE_BYTES,
  VIDEO_TAIL_PROBE_BYTES,
} from "@/lib/media-video";
import {
  logDiagnostic,
  logErrorDiagnostic,
  mediaTrace,
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
    ...mediaTrace({
      stage: "prepare",
      userId: authorized.userId,
      postId: authorized.postId,
      pathname,
    }),
    size: input.size,
    mimeType: input.mimeType,
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
 * The three DB operations a completed upload needs, as a seam so the
 * registration contract (cap enforcement, idempotency) is testable without a
 * database. `withPostLock` must serialize concurrent registrations for one
 * post — see `liveMediaRegistrationStore`.
 */
export type MediaRegistrationTx = {
  countForPost: (postId: string, userId: string) => Promise<number>;
  findByPathname: (pathname: string) => Promise<{ id: string } | null>;
  create: (data: {
    userId: string;
    postId: string;
    url: string;
    pathname: string;
    filename: string;
    mimeType: string;
    size: number;
    type: MediaKind;
  }) => Promise<void>;
};

export type MediaRegistrationStore = MediaRegistrationTx & {
  withPostLock: <T>(
    postId: string,
    fn: (tx: MediaRegistrationTx) => Promise<T>
  ) => Promise<T>;
};

function txFromClient(
  client: Pick<Prisma.TransactionClient, "media">
): MediaRegistrationTx {
  return {
    countForPost: (postId, userId) =>
      client.media.count({ where: { postId, userId } }),
    findByPathname: (pathname) =>
      client.media.findUnique({ where: { pathname }, select: { id: true } }),
    create: async (data) => {
      await client.media.create({ data });
    },
  };
}

export const liveMediaRegistrationStore: MediaRegistrationStore = {
  ...txFromClient(prisma),
  withPostLock: async (postId, fn) => {
    // Per-post serialization across instances, using the SAME primitive the
    // billing checkout already relies on (`pg_advisory_xact_lock` inside one
    // short transaction). A plain count-then-insert is NOT safe even inside a
    // transaction: under READ COMMITTED two concurrent registrations both
    // observe the same count and both insert (phantom write). The lock makes
    // the check and the insert one critical section per post.
    //
    // Nothing inside fn() touches the network — canonicalization and blob
    // deletion happen outside — so a pool connection is never parked on
    // third-party latency while holding the lock.
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        postId
      );
      return await fn(txFromClient(tx));
    });
  },
};

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

/**
 * Reads just the head of a stored object and confirms it really is the type
 * it claims to be.
 *
 * Only `SIGNATURE_PROBE_BYTES` are fetched (HTTP Range — the same mechanism
 * the TikTok publish path already uses against the private store), so this
 * costs a few bytes rather than a full download even for a 100 MB video.
 *
 * Fails CLOSED: a read error means the bytes could not be verified, and an
 * unverified object must not become a Media row.
 */
export async function verifyStoredSignature(
  pathname: string,
  declaredMimeType: string,
  fetchHead: (
    pathname: string,
    range: string
  ) => Promise<ArrayBuffer | null> = defaultFetchHead
): Promise<SignatureCheck> {
  let head: ArrayBuffer | null;
  try {
    head = await fetchHead(pathname, `bytes=0-${SIGNATURE_PROBE_BYTES - 1}`);
  } catch (error) {
    logErrorDiagnostic("media", "signature probe read failed", error, {
      stage: "media-signature",
      pathname: safePathname(pathname),
    });
    return { ok: false, error: "File contents could not be verified" };
  }
  if (!head) {
    return { ok: false, error: "File contents could not be verified" };
  }
  return verifyMediaSignature(declaredMimeType, new Uint8Array(head));
}

async function defaultFetchHead(
  pathname: string,
  range: string
): Promise<ArrayBuffer | null> {
  const blob = await fetchPrivateBlob(pathname, range);
  if (!blob?.stream) return null;
  return new Response(blob.stream).arrayBuffer();
}

export type MediaSlotClaim = "created" | "duplicate" | "over-cap";

/**
 * The race fix, isolated so it can be reasoned about (and tested) on its own.
 *
 * The per-post media cap used to be a `count()` in `/api/media/prepare`
 * followed — in a LATER, separate request — by an unconditional insert in the
 * upload-completed webhook. Nothing connected the two, so N concurrent
 * prepares all saw the same count, all got a reserved pathname, and all
 * registered: a post capped at 4 could end up with 20.
 *
 * Here the count and the insert are one critical section, serialized per post
 * by `withPostLock`. Concurrent completions on the last free slot therefore
 * grant exactly one winner — the same "exactly one winner" property the quota
 * ledgers get from their conditional increments, obtained with a lock instead
 * because there is no counter row to increment (and adding one would mean a
 * schema migration on a database with no migration history).
 *
 * Duplicate delivery is re-checked INSIDE the lock as well: a retried webhook
 * must collapse to a no-op rather than consume a second slot.
 */
export async function claimMediaSlot(
  store: MediaRegistrationStore,
  data: {
    userId: string;
    postId: string;
    url: string;
    pathname: string;
    filename: string;
    mimeType: string;
    size: number;
    type: MediaKind;
  }
): Promise<MediaSlotClaim> {
  return store.withPostLock(data.postId, async (tx) => {
    const duplicate = await tx.findByPathname(data.pathname);
    if (duplicate) return "duplicate";

    const count = await tx.countForPost(data.postId, data.userId);
    if (count >= MAX_MEDIA_PER_POST) return "over-cap";

    await tx.create(data);
    return "created";
  });
}

/**
 * Inspects a stored video's container for a declared duration and rejects
 * files that prove themselves unusable (audit P2).
 *
 * Costs at most two ranged reads of a few hundred KB — the front of the file,
 * and the back only when `moov` is not at the front (the non-faststart layout
 * most phone exports produce). No demuxing, no transcoding, nothing that
 * could exceed the function budget.
 *
 * Fail-open: an undeterminable duration allows the upload. The security
 * boundary is the signature check that already ran; this is a quality gate.
 */
export async function verifyStoredVideo(
  pathname: string,
  mimeType: string,
  size: number,
  fetchRange: (
    pathname: string,
    range: string
  ) => Promise<ArrayBuffer | null> = defaultFetchHead
): Promise<{ ok: true; durationSeconds: number | null } | { ok: false; error: string }> {
  if (!isIsoBaseMediaMime(mimeType)) {
    // WebM duration lives in a variable-length EBML element; parsing it is a
    // separate exercise and is deliberately not attempted here.
    return { ok: true, durationSeconds: null };
  }

  const readOrNull = async (range: string): Promise<Uint8Array | undefined> => {
    try {
      const buffer = await fetchRange(pathname, range);
      return buffer ? new Uint8Array(buffer) : undefined;
    } catch {
      return undefined;
    }
  };

  const head = await readOrNull(
    `bytes=0-${Math.min(VIDEO_HEAD_PROBE_BYTES, size) - 1}`
  );
  let probe = probeIsoBaseMediaDuration(head ?? new Uint8Array(0));

  // `moov` at the front is the faststart layout; otherwise look at the end.
  if (probe.ok && probe.durationSeconds === null && size > VIDEO_HEAD_PROBE_BYTES) {
    const tailStart = Math.max(0, size - VIDEO_TAIL_PROBE_BYTES);
    const tail = await readOrNull(`bytes=${tailStart}-${size - 1}`);
    if (tail) {
      probe = probeIsoBaseMediaDuration(head ?? new Uint8Array(0), tail);
    }
  }

  if (!probe.ok) return probe;

  const durationCheck = checkVideoDuration(probe.durationSeconds);
  if (!durationCheck.ok) return durationCheck;

  return { ok: true, durationSeconds: probe.durationSeconds };
}

/** Removes rejected bytes. Never masks the rejection it is cleaning up after. */
async function discardRejectedBlob(
  pathname: string,
  reason: string
): Promise<void> {
  try {
    await deleteBlobs([pathname]);
  } catch (error) {
    // The bytes stay as a sweepable orphan (the 24h sweep reclaims them).
    // Logged rather than swallowed so a persistent storage failure is
    // visible instead of silently accumulating cost.
    logErrorDiagnostic("media", "rejected upload cleanup failed", error, {
      stage: "media-reject",
      reason,
      pathname: safePathname(pathname),
    });
  }
}

/**
 * Step 4 of the official flow: called by `handleUploadPresigned` when
 * Vercel Blob reports the browser upload finished (webhook, Ed25519
 * signature-verified). Verifies the object in the PRIVATE store, confirms the
 * bytes really are the declared type, replaces still images with their
 * optimized canonical version (same pathname, so validation, polling and Media
 * rows keep working unchanged), then creates the Media row under a per-post
 * lock. Throws on any problem so the webhook retries.
 * Idempotent: a retried webhook for the same pathname is a no-op.
 *
 * Availability first: if canonicalization fails, the original bytes are
 * registered instead of failing the upload.
 */
export async function registerCompletedUpload(
  payload: {
    blob: CompletedBlobInfo;
    tokenPayload?: string | null;
  },
  store: MediaRegistrationStore = liveMediaRegistrationStore
): Promise<void> {
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
    await discardRejectedBlob(meta.pathname, "scope-or-policy");
    throw new Error(outcome.error);
  }

  // `@@unique([pathname])`: the true unique lookup (Batch 2 pattern).
  const existing = await store.findByPathname(meta.pathname);
  if (existing) {
    logDiagnostic("media", "upload already registered", {
      ...mediaTrace({
        stage: "media-create",
        userId: outcome.userId,
        postId: outcome.postId,
        mediaId: existing.id,
        pathname: meta.pathname,
      }),
    });
    return;
  }

  // The declared content type is client-supplied all the way through (it pins
  // `allowedContentTypes` on the signed token and is echoed back by the
  // store), so it proves intent, never content. Confirm the actual bytes
  // before anything durable is written.
  const signature = await verifyStoredSignature(meta.pathname, meta.contentType);
  if (!signature.ok) {
    await discardRejectedBlob(meta.pathname, "signature-mismatch");
    logErrorDiagnostic(
      "media",
      "upload rejected: bytes do not match declared type",
      new Error(signature.error),
      {
        ...mediaTrace({
          stage: "media-signature",
          userId: outcome.userId,
          postId: outcome.postId,
          pathname: meta.pathname,
        }),
        declaredMimeType: meta.contentType,
      }
    );
    throw new MediaRegistrationRejected("signature-mismatch", signature.error);
  }

  // Video containers get a second, cheap inspection: a file that declares no
  // playable content fails here rather than minutes later at publish time.
  if (outcome.createInput.type === "VIDEO") {
    const video = await verifyStoredVideo(
      meta.pathname,
      meta.contentType,
      meta.size
    );
    if (!video.ok) {
      await discardRejectedBlob(meta.pathname, "video-invalid");
      logErrorDiagnostic(
        "media",
        "upload rejected: unusable video container",
        new Error(video.error),
        mediaTrace({
          stage: "media-video",
          userId: outcome.userId,
          postId: outcome.postId,
          pathname: meta.pathname,
        })
      );
      throw new MediaRegistrationRejected("video-invalid", video.error);
    }
    logDiagnostic("media", "video container inspected", {
      ...mediaTrace({
        stage: "media-video",
        userId: outcome.userId,
        postId: outcome.postId,
        pathname: meta.pathname,
      }),
      durationSeconds: video.durationSeconds,
    });
  }

  // Cheap advisory pre-check BEFORE the (billed) canonical transformation, so
  // an over-cap flood cannot amplify into image transformations. The
  // authoritative check is the locked one below.
  const preCount = await store.countForPost(outcome.postId, outcome.userId);
  if (preCount >= MAX_MEDIA_PER_POST) {
    await discardRejectedBlob(meta.pathname, "media-cap");
    throw new MediaRegistrationRejected(
      "media-cap",
      `A post can have at most ${MAX_MEDIA_PER_POST} media files`
    );
  }

  const canonical = await canonicalizeStoredImage({
    pathname: meta.pathname,
    originalUrl: meta.url,
    contentType: meta.contentType,
    size: meta.size,
  });

  // Authoritative cap + insert as ONE critical section per post. Without the
  // lock, N concurrent completions all read the same count and all insert.
  let result: MediaSlotClaim;
  try {
    result = await claimMediaSlot(store, {
      ...outcome.createInput,
      url: canonical.url,
      mimeType: canonical.contentType,
      size: canonical.size,
    });
  } catch (error) {
    if (isDuplicatePathnameError(error)) {
      // A concurrent webhook delivery already registered this pathname
      // (unique index): the upload is complete, this delivery is a no-op.
      logDiagnostic("media", "duplicate webhook collapsed to no-op", {
        ...mediaTrace({
          stage: "media-create",
          userId: outcome.userId,
          postId: outcome.postId,
          pathname: meta.pathname,
        }),
      });
      return;
    }
    throw error;
  }

  if (result === "duplicate") {
    logDiagnostic("media", "duplicate webhook collapsed to no-op", {
      ...mediaTrace({
        stage: "media-create",
        userId: outcome.userId,
        postId: outcome.postId,
        pathname: meta.pathname,
      }),
    });
    return;
  }

  if (result === "over-cap") {
    await discardRejectedBlob(meta.pathname, "media-cap");
    logErrorDiagnostic(
      "media",
      "upload rejected: post is at the media cap",
      new Error(`Post already holds ${MAX_MEDIA_PER_POST} media files`),
      mediaTrace({
        stage: "media-cap",
        userId: outcome.userId,
        postId: outcome.postId,
        pathname: meta.pathname,
      })
    );
    throw new MediaRegistrationRejected(
      "media-cap",
      `A post can have at most ${MAX_MEDIA_PER_POST} media files`
    );
  }

  logDiagnostic("media", "media record created from client upload", {
    ...mediaTrace({
      stage: "media-create",
      userId: outcome.userId,
      postId: outcome.postId,
      pathname: meta.pathname,
    }),
    size: canonical.size,
    mimeType: canonical.contentType,
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
