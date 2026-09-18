import { NextRequest, NextResponse } from "next/server";
import { handleUploadPresigned } from "@vercel/blob/client";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";
import { getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateWriteRequest, WRITE_LIMIT_MEDIA_UPLOAD } from "@/lib/abuse";
import { MEDIA_LIMITS, validateMediaInput } from "@/lib/media";
import {
  createPutSignedToken,
  describeMediaUploadConfig,
} from "@/lib/blob";
import {
  buildUploadTokenPayload,
  CLIENT_UPLOAD_TTL_MS,
  parseClientPayload,
  registerCompletedUpload,
  validateReservedPathname,
} from "@/lib/media-upload";
import { reportError } from "@/lib/diagnostics";
import {
  AuthorizationError,
  DomainError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors/domain-error";
import { toApiResponse } from "@/lib/errors/to-response";

/** Map legacy plain-Error messages (SDK passthrough) to typed errors. */
function mapUploadTokenError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const cause = error instanceof Error ? error : null;
  const message = cause?.message ?? String(error ?? "");
  if (message.includes("Not authenticated")) {
    return new AuthorizationError("Not authenticated", { cause: error });
  }
  if (message.includes("Too many upload requests")) {
    return new RateLimitError(message, { cause: error });
  }
  if (message.includes("Post not found")) {
    return new DomainError("Post not found", {
      code: "NOT_FOUND",
      status: 404,
      cause: error,
    });
  }
  if (
    message.includes("Multipart uploads are not supported") ||
    message.includes("clientPayload") ||
    message.includes("Invalid upload path") ||
    message.includes("Unsupported file type") ||
    message.includes("File exceeds") ||
    message.includes("File is empty") ||
    message.includes("could not be determined")
  ) {
    return new ValidationError(message, { cause: error });
  }
  return new DomainError("Upload handler failed", {
    code: "INTERNAL",
    status: 500,
    cause: error,
  });
}

/**
 * The upload-completed webhook may canonicalize a still image
 * (server-side optimize + overwrite) before registering the Media row.
 * Bumped for headroom; the platform clamps to the plan maximum.
 */
export const maxDuration = 60;

/**
 * Official Vercel Blob client-upload endpoint for the PRIVATE store.
 *
 * Browser requests  -> `blob.generate-presigned-url`:
 *   session auth, post ownership, pathname scope + media policy checks,
 *   then an `issueSignedToken` "put" token (Vercel OIDC) is presigned by
 *   handleUploadPresigned and returned to the SDK, which PUTs the file
 *   directly to Blob storage.
 *
 * Vercel Blob service -> `blob.upload-completed`:
 *   Ed25519 signature verified with BLOB_WEBHOOK_PUBLIC_KEY, then the
 *   Media row is created (idempotent; throws for retry on failure).
 */
export async function POST(request: NextRequest) {
  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    const mapped = toApiResponse(new ValidationError("Invalid request body"));
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  // Fail fast on missing Blob configuration (local dev without
  // BLOB_READ_WRITE_TOKEN and/or BLOB_WEBHOOK_PUBLIC_KEY): otherwise the
  // SDK throws deep inside (`No blob credentials found` / `Missing webhook
  // public key`) and the browser only sees the opaque SDK error "Failed to
  // retrieve the presigned URL". Presence flags only — never secret values.
  const uploadConfig = describeMediaUploadConfig();
  if (!uploadConfig.ok) {
    reportError(
      "media",
      "media upload not configured",
      new Error(`Missing media configuration: ${uploadConfig.missing.join(", ")}`),
      { stage: body?.type ?? "unknown", missing: uploadConfig.missing }
    );
    const mapped = toApiResponse(
      new DomainError(
        `Media storage is not configured on this environment (missing: ${uploadConfig.missing.join(", ")}). See docs/local-social-dev.md.`,
        { code: "INTERNAL", status: 500 }
      )
    );
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  try {
    const result = await handleUploadPresigned({
      request,
      body,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname, clientPayload, multipart) => {
        if (multipart) {
          throw new ValidationError("Multipart uploads are not supported");
        }
        const user = await getApiUser();
        if (!user) {
          throw new AuthorizationError("Not authenticated");
        }
        // Bound the signed-token mint rate per user+IP (persistent buckets):
        // tokens carry a 5-min TTL, so an unbounded mint is upload-amplification.
        if (
          !(await gateWriteRequest({
            request,
            userId: user.id,
            scope: "media-upload",
            userMax: WRITE_LIMIT_MEDIA_UPLOAD,
          }))
        ) {
          throw new RateLimitError("Too many upload requests. Please wait before trying again.");
        }
        const parsed = parseClientPayload(clientPayload);
        if (!parsed.ok) {
          throw new ValidationError(parsed.error);
        }
        const { postId, filename, mimeType, size } = parsed.data;

        const post = await prisma.post.findFirst({
          where: { id: postId, userId: user.id },
          select: { userId: true },
        });
        if (!post) {
          throw new DomainError("Post not found", { code: "NOT_FOUND", status: 404 });
        }

        if (!validateReservedPathname(pathname, user.id, postId)) {
          throw new ValidationError("Invalid upload path");
        }

        const validation = validateMediaInput(mimeType, size);
        if (!validation.ok) {
          throw new ValidationError(validation.error);
        }
        const maximumSizeInBytes = MEDIA_LIMITS[validation.kind].maxBytes;

        const token = await createPutSignedToken({
          pathname,
          contentType: mimeType,
          maximumSizeInBytes,
          ttlMs: CLIENT_UPLOAD_TTL_MS,
        });

        return {
          token,
          urlOptions: {
            validUntil: Date.now() + CLIENT_UPLOAD_TTL_MS,
            allowedContentTypes: [mimeType],
            maximumSizeInBytes,
            tokenPayload: buildUploadTokenPayload({
              userId: user.id,
              postId,
              filename,
            }),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        await registerCompletedUpload({
          blob: {
            pathname: blob.pathname,
            url: blob.url,
            contentType: blob.contentType,
          },
          tokenPayload,
        });
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapUploadTokenError(error);
    reportError("media", "upload handler failed", mapped.cause ?? error, {
      stage: body?.type ?? "unknown",
      code: mapped.code,
    });
    const response = toApiResponse(mapped);
    return NextResponse.json(response.body, { status: response.status });
  }
}
