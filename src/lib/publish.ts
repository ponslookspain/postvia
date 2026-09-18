import { prisma } from "@/lib/prisma";
import {
  XProvider,
  createXAttemptMarker,
  decideXStaleAttempt,
  ensureFreshXToken,
  resolveXMediaPolicy,
  uploadXMedia,
  xAmbiguousRetryMessage,
  xErrorMessage,
  xMediaCategoryForMime,
} from "@/lib/social/x";
import {
  ThreadsProvider,
  ensureFreshThreadsToken,
  isThreadsAuthError,
  monitorThreadsContainer,
  publishThreadsMedia,
  threadsErrorMessage,
  THREADS_PUBLISH_IMAGE_TTL_MS,
  THREADS_PUBLISH_VIDEO_TTL_MS,
} from "@/lib/social/threads";
import type { PublishMedia } from "@/lib/social/provider";
import type { Platform } from "@prisma/client";
import {
  getDispatchEntry,
  type PlatformDispatch,
} from "@/lib/platforms/providers";
import {
  isTiktokAuthErrorCode,
  TiktokApiError,
  ensureFreshTiktokToken,
  fetchTiktokPublishStatus,
  publishTiktokDirectPhoto,
  publishTiktokDirectVideo,
  resolveTiktokMediaPolicy,
  tiktokErrorMessage,
  tiktokFailReasonMessage,
  TIKTOK_CAPTION_MAX_LENGTH,
  TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH,
  TIKTOK_PHOTO_TITLE_MAX_LENGTH,
  TIKTOK_STATUS_COMPLETE,
  TIKTOK_STATUS_FAILED,
  type TiktokPublishSettings,
} from "@/lib/social/tiktok";
import { createTiktokMediaUrl } from "@/lib/tiktok-media-bridge";
import {
  ensureFreshInstagramToken,
  InstagramApiError,
  InstagramProvider,
  instagramErrorMessage,
  monitorInstagramContainer,
  publishInstagramMedia,
} from "@/lib/social/instagram";
import { getPlatformCapabilities } from "@/lib/platforms/capabilities";
import {
  normalizeTiktokContent,
  resolveEffectiveTargetContent,
  validateTargetMedia,
  validateTargetOverrides,
} from "@/lib/platforms/overrides";
import { resolveThreadsMediaPolicy, type MediaKind } from "@/lib/media";
import { createSignedGetUrl, fetchPrivateBlob } from "@/lib/blob";

export interface PublishOutcome {
  ok: boolean;
  error?: string;
  externalPostId?: string;
  username?: string;
  platform?: string;
}

export type AggregatePostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "PARTIALLY_PUBLISHED"
  | "FAILED";

export function isPublishableTargetStatus(status: string): boolean {
  return status === "PENDING" || status === "FAILED";
}

export function selectPublishableTargetIds(
  targets: readonly { id: string; status: string }[]
): string[] {
  return targets
    .filter((target) => isPublishableTargetStatus(target.status))
    .map((target) => target.id);
}

export async function publishTargetsInParallel<T extends { id: string }>(
  targets: readonly T[],
  publishTarget: (target: T) => Promise<PublishOutcome>
): Promise<PromiseSettledResult<PublishOutcome>[]> {
  return Promise.allSettled(targets.map((target) => publishTarget(target)));
}

/**
 * Single publish/resume dispatch table (E1 platform registry).
 * Every implemented platform resolves here; unknown platforms throw
 * `UnknownPlatformError`, which `publishPostTargets` converts into a
 * failed target via its settled-result handling (same as the old
 * `Unsupported platform` throw). Adding a platform means adding one
 * entry — never editing dispatch code.
 */
export const PLATFORM_DISPATCH: Partial<Record<Platform, PlatformDispatch>> = {
  X: {
    createProvider: () => new XProvider(),
    execute: (post, target, account, effective) =>
      executeXTarget(post, target, account, effective.text),
    resume: (targetId) => resumeXTarget(targetId),
  },
  THREADS: {
    createProvider: () => new ThreadsProvider(),
    execute: (post, target, account, effective) =>
      executeThreadsTarget(post, target, account, effective),
    resume: (targetId) => resumeThreadsTarget(targetId),
  },
  INSTAGRAM: {
    createProvider: () => new InstagramProvider(),
    execute: (post, target, account, effective) =>
      executeInstagramTarget(post, target, account, effective),
    resume: (targetId) => resumeInstagramTarget(targetId),
  },
  TIKTOK: {
    // No generic provider: TikTok publishes only through its custom
    // Direct Post pipeline (see executeTiktokTarget).
    execute: (post, target, account, effective) =>
      executeTiktokTarget(post, target, account, effective),
    resume: (targetId) => resumeTiktokTarget(targetId),
  },
};

export function threadsMediaTtlMs(kind: MediaKind): number {
  return kind === "VIDEO"
    ? THREADS_PUBLISH_VIDEO_TTL_MS
    : THREADS_PUBLISH_IMAGE_TTL_MS;
}

export async function chooseThreadsMedia(
  media: readonly {
    id: string;
    type: MediaKind;
    pathname: string;
    mimeType: string;
  }[],
  signUrl: (pathname: string, ttlMs: number) => Promise<string>
): Promise<{ media?: PublishMedia; error?: string }> {
  const policy = resolveThreadsMediaPolicy(media);
  if (policy.kind === "text") return {};
  if (policy.kind === "error") return { error: policy.message };

  const chosen = media.find((m) => m.id === policy.mediaId);
  if (!chosen) return { error: "Threads media could not be resolved" };

  try {
    const url = await signUrl(chosen.pathname, threadsMediaTtlMs(chosen.type));
    return { media: { url, kind: chosen.type } };
  } catch {
    return { error: "Failed to generate media URL for Threads" };
  }
}

export type PublishPost = {
  id: string;
  userId: string;
  text: string;
  status: string;
  media: readonly {
    id: string;
    type: MediaKind;
    pathname: string;
    mimeType: string;
    size: number;
  }[];
};

export type PublishTarget = {
  id: string;
  platform: string;
  status: string;
  socialAccountId: string | null;
  overrides: unknown;
  externalJobId: string | null;
};

export type PublishAccount = {
  id: string;
  userId: string;
  platform: string;
  accessToken: string;
  externalId: string;
  username: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export function derivePostStatus(
  targets: readonly { status: string }[],
  fallback: AggregatePostStatus = "DRAFT"
): AggregatePostStatus {
  if (targets.length === 0) return fallback;
  const published = targets.filter((target) => target.status === "PUBLISHED").length;
  const failed = targets.filter((target) => target.status === "FAILED").length;
  const publishing = targets.some((target) => target.status === "PUBLISHING");
  const pending = targets.some((target) => target.status === "PENDING");
  if (published === targets.length) return "PUBLISHED";
  if (published > 0 && failed > 0) return "PARTIALLY_PUBLISHED";
  // A leftover PENDING alongside settled/in-flight siblings means a
  // concurrent run owns it — the post is still in flight, not a draft.
  // All-PENDING (nothing happened yet) keeps the fallback.
  if (publishing || (pending && (published > 0 || failed > 0))) return "PUBLISHING";
  if (failed === targets.length) return "FAILED";
  return fallback === "SCHEDULED" ? "SCHEDULED" : "DRAFT";
}

function failedOutcome(
  target: PublishTarget,
  error: string
): PublishOutcome {
  return { ok: false, error, platform: target.platform };
}

export type PublishTargetRef = {
  socialAccountId: string | null;
  platform: string;
};

export type PublishAccountRef = {
  id: string;
  userId: string;
  platform: string;
};

/**
 * Pure ownership/binding check for publishing. Fails closed: a target
 * without a bound socialAccountId, a missing row, a cross-user row, an
 * id mismatch or a platform mismatch all resolve to null — the publisher
 * must never fall back to "the first account of the platform".
 */
export function matchTargetAccount(
  postUserId: string,
  target: PublishTargetRef,
  account: PublishAccountRef | null
): PublishAccountRef | null {
  if (!target.socialAccountId) return null;
  if (!account) return null;
  if (account.id !== target.socialAccountId) return null;
  if (account.userId !== postUserId) return null;
  if (account.platform !== target.platform) return null;
  return account;
}

async function resolveTargetAccount(
  postUserId: string,
  target: PublishTarget
): Promise<PublishAccount | null> {
  if (!target.socialAccountId) {
    return null;
  }
  const account = await prisma.socialAccount.findFirst({
    where: { id: target.socialAccountId, userId: postUserId },
  });
  if (!matchTargetAccount(postUserId, target, account)) {
    return null;
  }
  // Tokens stay AS STORED here (possibly encrypted). Each provider's
  // `ensureFresh*Token` needs the raw stored value for its rotation
  // compare-and-swap and decrypts internally at the point of use — see
  // social-token-crypto.ts. Decrypting here would break that CAS.
  return account;
}

async function updateTargetFailure(
  postId: string,
  targetId: string,
  error: string,
  options: { clearJobId?: boolean } = {}
): Promise<void> {
  await prisma.postTarget.update({
    where: { id: targetId },
    data: {
      status: "FAILED",
      errorMessage: error,
      // Terminal platform-side failures must drop the job id so the next
      // manual retry legitimately starts a fresh container/upload.
      ...(options.clearJobId ? { externalJobId: null } : {}),
    },
  });
}


async function executeTargetPublish(
  post: PublishPost,
  target: PublishTarget
): Promise<PublishOutcome> {
  const claim = await prisma.postTarget.updateMany({
    where: { id: target.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PUBLISHING", errorMessage: null },
  });
  if (claim.count === 0) {
    return failedOutcome(target, "Target is already being published or published");
  }

  const caps = getPlatformCapabilities(target.platform as never);
  const account = await resolveTargetAccount(post.userId, target);
  if (!account) {
    const error = `${target.platform} account not found or does not belong to this user`;
    await updateTargetFailure(post.id, target.id, error);
    return failedOutcome(target, error);
  }
  if (!caps.implemented) {
    const error = `${caps.label} publishing is not implemented yet`;
    await updateTargetFailure(post.id, target.id, error);
    return failedOutcome(target, error);
  }

  const overrideValidation = validateTargetOverrides(target.platform as never, target.overrides);
  if (!overrideValidation.ok) {
    await updateTargetFailure(post.id, target.id, overrideValidation.error);
    return failedOutcome(target, overrideValidation.error);
  }
  const effective = resolveEffectiveTargetContent(post.text, overrideValidation.overrides);

  // Single dispatch table (E1): every implemented platform resolves
  // here. Unknown platforms throw UnknownPlatformError, which surfaces
  // as a failed target through publishPostTargets' settled handling.
  const entry = getDispatchEntry(PLATFORM_DISPATCH, target.platform);
  return entry.execute(post, target, account, effective);
}

/**
 * Threads publishes by pointing Meta at a short-lived signed GET URL of the
 * PRIVATE blob (same fetch model as Instagram). The container id is
 * persisted to PostTarget.externalJobId IMMEDIATELY after creation: every
 * later attempt resumes the SAME container instead of creating a second
 * one (duplicate protection).
 */
/**
 * X publishes synchronously (no platform job id): refresh the token first,
 * upload media (if any) via the v2 chunked upload, then create the tweet
 * with the resulting media_ids. Expired/revoked tokens map to a reconnect
 * message instead of a raw 401 so the UI can offer Reconnect.
 *
 * Idempotency note: X offers no idempotency key for tweet creation. If the
 * tweet is created remotely but the response is lost (crash before the DB
 * update below), a retry posts again. This matches the pre-existing text
 * behavior; media does not make it worse.
 */
async function executeXTarget(
  post: PublishPost,
  target: PublishTarget,
  account: PublishAccount,
  text: string
): Promise<PublishOutcome> {
  const caps = getPlatformCapabilities("X");
  const mediaValidation = validateTargetMedia(caps, post.media);
  if (!mediaValidation.ok) {
    await updateTargetFailure(post.id, target.id, mediaValidation.error);
    return failedOutcome(target, mediaValidation.error);
  }
  const policy = resolveXMediaPolicy(post.media);
  if (policy.kind === "error") {
    await updateTargetFailure(post.id, target.id, policy.message, { clearJobId: true });
    return failedOutcome(target, policy.message);
  }

  let accessToken: string;
  try {
    accessToken = await ensureFreshXToken({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    });
  } catch (error) {
    const message = xErrorMessage(error);
    await updateTargetFailure(post.id, target.id, message);
    return failedOutcome(target, message);
  }

  // Upload media first (sequentially, preserving composer order), then
  // attach all media_ids to a single tweet. Text-only posts skip this.
  const mediaIds: string[] = [];
  if (policy.kind !== "text") {
    const byId = new Map(post.media.map((item) => [item.id, item]));
    const orderedIds =
      policy.kind === "photo" ? policy.mediaIds : [policy.mediaId];
    try {
      for (const id of orderedIds) {
        const item = byId.get(id);
        if (!item) {
          const error = "X media could not be resolved.";
          await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
          return failedOutcome(target, error);
        }
        // Ranged reads instead of buffering the whole file: X's INIT only
        // needs the byte count, which the Media row already carries, so peak
        // memory is one 4 MB segment rather than up to the full 100 MB video
        // limit. Same model the TikTok video path already uses.
        const uploaded = await uploadXMedia(
          accessToken,
          {
            source: {
              totalBytes: item.size,
              readChunk: async (start, endInclusive) => {
                const blob = await fetchPrivateBlob(
                  item.pathname,
                  `bytes=${start}-${endInclusive}`
                );
                if (!blob?.stream) {
                  throw new Error(
                    "The stored media could not be read for X upload. Retry the post."
                  );
                }
                return new Response(blob.stream).arrayBuffer();
              },
            },
            mediaType: item.mimeType,
            mediaCategory: xMediaCategoryForMime(item.mimeType),
          }
        );
        if (uploaded.state === "failed") {
          // Upload-only failure: no tweet POST was reached, so no tweet
          // can exist — a plain retryable failure, no ambiguity.
          await updateTargetFailure(post.id, target.id, uploaded.error, { clearJobId: true });
          return failedOutcome(target, uploaded.error);
        }
        mediaIds.push(uploaded.mediaId);
      }
    } catch (error) {
      // Upload-phase failure happens before any tweet POST: unambiguous.
      const message = xErrorMessage(error);
      await updateTargetFailure(post.id, target.id, message, { clearJobId: true });
      return failedOutcome(target, message);
    }
  }

  // Attempt marker BEFORE the tweet POST: a crash or transport failure
  // past this point has an UNKNOWN outcome (the tweet may exist
  // remotely), which stale recovery must not blindly republish. Media
  // uploads above already finished and cannot have created a tweet.
  try {
    await prisma.postTarget.update({
      where: { id: target.id },
      data: { externalJobId: createXAttemptMarker() },
    });
  } catch (error) {
    const message = xErrorMessage(error);
    await updateTargetFailure(post.id, target.id, message);
    return failedOutcome(target, message);
  }

  const provider = new XProvider();
  let result: { success: boolean; externalPostId?: string; error?: string };
  try {
    result = await provider.publishPostWithMedia(accessToken, text, mediaIds);
  } catch {
    // Transport-level failure: the request may already have been applied
    // remotely. FAILED (cron never auto-retries FAILED) with check-first
    // guidance — never a blind "try again".
    const message = xAmbiguousRetryMessage();
    await updateTargetFailure(post.id, target.id, message, { clearJobId: true });
    return failedOutcome(target, message);
  }
  if (!result.success) {
    // An HTTP error response from X is unambiguous: the tweet was
    // rejected, so a later retry cannot duplicate it.
    const error = xErrorMessage(new Error(result.error || "Publication failed"));
    await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
    return failedOutcome(target, error);
  }

  await prisma.postTarget.update({
    where: { id: target.id },
    data: {
      status: "PUBLISHED",
      externalPostId: result.externalPostId,
      externalJobId: null,
      publishedAt: new Date(),
      errorMessage: null,
    },
  });
  return {
    ok: true,
    externalPostId: result.externalPostId,
    username: account.username,
    platform: target.platform,
  };
}

async function executeThreadsTarget(
  post: PublishPost,
  target: PublishTarget,
  account: PublishAccount,
  effective: { text: string; content: Record<string, unknown>; settings: Record<string, unknown> }
): Promise<PublishOutcome> {
  const caps = getPlatformCapabilities("THREADS");
  const mediaValidation = validateTargetMedia(caps, post.media);
  if (!mediaValidation.ok) {
    // A stale container id from an earlier attempt must not survive a
    // validation failure: the next retry would otherwise poll a dead
    // container instead of creating a fresh one.
    await updateTargetFailure(post.id, target.id, mediaValidation.error, {
      clearJobId: true,
    });
    return failedOutcome(target, mediaValidation.error);
  }

  let threadsMedia: PublishMedia | undefined;
  try {
    const resolvedMedia = await chooseThreadsMedia(post.media, (pathname, ttlMs) =>
      createSignedGetUrl({ pathname, ttlMs })
    );
    if (resolvedMedia.error) {
      await updateTargetFailure(post.id, target.id, resolvedMedia.error, {
        clearJobId: true,
      });
      return failedOutcome(target, resolvedMedia.error);
    }
    if (resolvedMedia.media) {
      threadsMedia = { url: resolvedMedia.media.url, kind: resolvedMedia.media.kind };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate media URL for Threads";
    await updateTargetFailure(post.id, target.id, message, { clearJobId: true });
    return failedOutcome(target, message);
  }

  // Refresh before any container exists: a terminal refresh failure is a
  // plain retryable failure (no container to drop, mirroring X).
  let accessToken: string;
  try {
    accessToken = await ensureFreshThreadsToken({
      id: account.id,
      accessToken: account.accessToken,
      expiresAt: account.expiresAt,
    });
  } catch (error) {
    const message = threadsErrorMessage(error);
    await updateTargetFailure(post.id, target.id, message);
    return failedOutcome(target, message);
  }

  const outcome = await publishThreadsMedia(
    accessToken,
    {
      threadsUserId: account.externalId,
      text: effective.text,
      media: threadsMedia,
      existingContainerId: target.externalJobId,
    },
    {
      onContainerId: async (containerId) => {
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { externalJobId: containerId },
        });
      },
    }
  );

  switch (outcome.state) {
    case "published": {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: outcome.externalPostId ?? null,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return {
        ok: true,
        externalPostId: outcome.externalPostId ?? undefined,
        username: account.username,
        platform: "THREADS",
      };
    }
    case "failed": {
      // ERROR/EXPIRED/transport failures are terminal on Meta's side for
      // this container: clear the id so the next manual retry starts a
      // fresh container.
      await updateTargetFailure(post.id, target.id, outcome.error, {
        clearJobId: true,
      });
      return failedOutcome(target, outcome.error);
    }
    case "processing": {
      return {
        ok: false,
        error: "Threads is still processing this media. Publishing continues automatically — do not retry yet.",
        platform: "THREADS",
      };
    }
  }
}

const TIKTOK_MEDIA_READ_TTL_MS = 30 * 60_000;

function tiktokSettingsFromRaw(settings: Record<string, unknown>): TiktokPublishSettings {
  return {
    privacyLevel: typeof settings.privacy_level === "string" ? settings.privacy_level : undefined,
    disableComment: typeof settings.disable_comment === "boolean" ? settings.disable_comment : undefined,
    disableDuet: typeof settings.disable_duet === "boolean" ? settings.disable_duet : undefined,
    disableStitch: typeof settings.disable_stitch === "boolean" ? settings.disable_stitch : undefined,
    videoCoverTimestampMs:
      typeof settings.video_cover_timestamp_ms === "number" &&
      Number.isInteger(settings.video_cover_timestamp_ms)
        ? settings.video_cover_timestamp_ms
        : undefined,
    photoCoverIndex:
      typeof settings.photo_cover_index === "number" &&
      Number.isInteger(settings.photo_cover_index)
        ? settings.photo_cover_index
        : undefined,
  };
}

async function executeTiktokTarget(
  post: PublishPost,
  target: PublishTarget,
  account: PublishAccount,
  effective: { text: string; content: Record<string, unknown>; settings: Record<string, unknown> }
): Promise<PublishOutcome> {
  const caps = getPlatformCapabilities("TIKTOK");
  const mediaValidation = validateTargetMedia(caps, post.media);
  if (!mediaValidation.ok) {
    await updateTargetFailure(post.id, target.id, mediaValidation.error);
    return failedOutcome(target, mediaValidation.error);
  }
  // One common Content field: the global post text is the default
  // TikTok caption/title (TikTok's title is API-optional); an explicit
  // per-target override still wins. Video publishes the title as its
  // caption (2200); photo publishes title (90) + description (4000).
  // The remaining empty-text gates below are safety nets for posts with
  // no text at all — unreachable through the composer, which requires
  // text before submit. The media policy decides the flow before text
  // validation so each flow enforces its own contract.
  const settings = tiktokSettingsFromRaw(effective.settings);
  const policy = resolveTiktokMediaPolicy(post.media, settings.photoCoverIndex);
  if (policy.kind === "error") {
    await updateTargetFailure(post.id, target.id, policy.message, { clearJobId: true });
    return failedOutcome(target, policy.message);
  }
  const tiktokContent = normalizeTiktokContent(effective.content);
  const title = tiktokContent.title.trim() || effective.text.trim();
  const description = tiktokContent.description.trim();

  if (policy.kind === "photo") {
    if (!title && !description) {
      const error = "TikTok photo post has no text. Add post text, a custom title, or a description.";
      await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
      return failedOutcome(target, error);
    }
    if (Array.from(title).length > TIKTOK_PHOTO_TITLE_MAX_LENGTH) {
      const error = `TikTok photo title exceeds the ${TIKTOK_PHOTO_TITLE_MAX_LENGTH} character limit.`;
      await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
      return failedOutcome(target, error);
    }
    if (Array.from(description).length > TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH) {
      const error = `TikTok photo description exceeds the ${TIKTOK_PHOTO_DESCRIPTION_MAX_LENGTH} character limit.`;
      await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
      return failedOutcome(target, error);
    }
    return executeTiktokPhotoTarget(post, target, account, {
      title,
      description,
      settings,
      mediaIds: policy.mediaIds,
      coverIndex: policy.coverIndex,
    });
  }

  if (!title) {
    const error = "TikTok video has no caption text. Add post text or a custom TikTok title.";
    await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
    return failedOutcome(target, error);
  }
  if (Array.from(title).length > TIKTOK_CAPTION_MAX_LENGTH) {
    const error = `TikTok title exceeds the ${TIKTOK_CAPTION_MAX_LENGTH} character limit.`;
    await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
    return failedOutcome(target, error);
  }

  const video = post.media.find((item) => item.id === policy.mediaId);
  if (!video) {
    const error = "TikTok media could not be resolved.";
    await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
    return failedOutcome(target, error);
  }

  let accessToken: string;
  let mediaReadUrl: string;
  try {
    accessToken = await ensureFreshTiktokToken({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    });
    mediaReadUrl = await createSignedGetUrl({
      pathname: video.pathname,
      ttlMs: TIKTOK_MEDIA_READ_TTL_MS,
    });
  } catch (error) {
    const message = tiktokErrorMessage(error);
    await updateTargetFailure(post.id, target.id, message);
    return failedOutcome(target, message);
  }

  const outcome = await publishTiktokDirectVideo(
    accessToken,
    {
      title,
      settings,
      videoSize: video.size,
      videoContentType: video.mimeType,
      existingPublishId: target.externalJobId,
    },
    {
      readChunk: async (range) => {
        const res = await fetch(mediaReadUrl, {
          headers: { Range: `bytes=${range.start}-${range.end}` },
        });
        if (!res.ok && res.status !== 206) {
          throw new Error("Failed to read the stored video from private media storage");
        }
        return res.arrayBuffer();
      },
      onPublishId: async (publishId) => {
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { externalJobId: publishId },
        });
      },
    }
  );

  switch (outcome.state) {
    case "published": {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: outcome.externalPostId ?? null,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return {
        ok: true,
        externalPostId: outcome.externalPostId,
        username: account.username,
        platform: "TIKTOK",
      };
    }
    case "invalid":
    case "failed": {
      // TikTok reports these states only when the job is terminal
      // (FAILED status / rejected init): safe to clear for a fresh retry.
      await updateTargetFailure(post.id, target.id, outcome.error, {
        clearJobId: true,
      });
      return failedOutcome(target, outcome.error);
    }
    case "processing": {
      // externalJobId is persisted; the next cron tick/resume or a manual
      // retry continues with status/fetch — never a second init.
      return {
        ok: false,
        error: "TikTok is still processing this video. Publishing continues automatically — do not reinitialize.",
        platform: "TIKTOK",
      };
    }
  }
}

/**
 * PHOTO branch of the TikTok target: hands TikTok ordered first-party
 * bridge URLs (`/api/tiktok/media/{mediaId}?expires&sig`) that stream the
 * PRIVATE blob bytes server-side with no redirect.
 *
 * A raw Vercel presigned Blob URL was deliberately NOT used here: its
 * hostname (`{store}.private.blob.vercel-storage.com`) can never be
 * covered by TikTok's domain/URL-prefix ownership verification, so
 * production would always fail with `url_ownership_unverified`. The
 * bridge lives under Postvia's own verified host/path instead.
 * (Threads/Instagram keep their Meta-proven signed-URL model — only
 * TikTok PHOTO needs first-party ownership.)
 *
 * URLs are minted fresh on every non-resume attempt so an expired link
 * can never strand a retry; a resume (existingPublishId) skips URL
 * generation entirely and only polls status/fetch. Ownership is enforced
 * because media ids come from this post's own Media rows validated by
 * `resolveTiktokMediaPolicy` — never from caller-supplied paths — and
 * each bridge token is HMAC-bound to exactly one media id.
 */
async function executeTiktokPhotoTarget(
  post: PublishPost,
  target: PublishTarget,
  account: PublishAccount,
  input: {
    title: string;
    description: string;
    settings: TiktokPublishSettings;
    mediaIds: string[];
    coverIndex: number;
  }
): Promise<PublishOutcome> {
  const byId = new Map(post.media.map((item) => [item.id, item]));
  const ordered = input.mediaIds.map((id) => byId.get(id));
  if (ordered.some((item) => !item)) {
    const error = "TikTok media could not be resolved.";
    await updateTargetFailure(post.id, target.id, error, { clearJobId: true });
    return failedOutcome(target, error);
  }

  let accessToken: string;
  let photoUrls: string[] = [];
  try {
    accessToken = await ensureFreshTiktokToken({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    });
    // Resume path: TikTok already has the bytes; polling needs no URLs.
    // Skipping URL generation also avoids extra Blob token calls against
    // TikTok's rate limits.
    if (!target.externalJobId) {
      photoUrls = [];
      for (const item of ordered) {
        if (!item) continue;
        photoUrls.push(createTiktokMediaUrl({ mediaId: item.id }));
      }
    }
  } catch (error) {
    const message = tiktokErrorMessage(error);
    await updateTargetFailure(post.id, target.id, message);
    return failedOutcome(target, message);
  }

  const outcome = await publishTiktokDirectPhoto(
    accessToken,
    {
      title: input.title,
      description: input.description,
      settings: input.settings,
      photoUrls,
      coverIndex: input.coverIndex,
      existingPublishId: target.externalJobId,
    },
    {
      onPublishId: async (publishId) => {
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { externalJobId: publishId },
        });
      },
    }
  );

  switch (outcome.state) {
    case "published": {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: outcome.externalPostId ?? null,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return {
        ok: true,
        externalPostId: outcome.externalPostId,
        username: account.username,
        platform: "TIKTOK",
      };
    }
    case "invalid":
    case "failed": {
      await updateTargetFailure(post.id, target.id, outcome.error, {
        clearJobId: true,
      });
      return failedOutcome(target, outcome.error);
    }
    case "processing": {
      return {
        ok: false,
        error: "TikTok is still processing these photos. Publishing continues automatically — do not reinitialize.",
        platform: "TIKTOK",
      };
    }
  }
}

/** Instagram publishes by pointing Meta at a short-lived signed GET URL of
 *  the PRIVATE blob (same fetch model already proven by Threads). */
const INSTAGRAM_MEDIA_READ_TTL_MS = 30 * 60_000;

async function executeInstagramTarget(
  post: PublishPost,
  target: PublishTarget,
  account: PublishAccount,
  effective: { text: string; content: Record<string, unknown>; settings: Record<string, unknown> }
): Promise<PublishOutcome> {
  const caps = getPlatformCapabilities("INSTAGRAM");
  const mediaValidation = validateTargetMedia(caps, post.media);
  if (!mediaValidation.ok) {
    // A stale container id from an earlier attempt must not survive a
    // validation failure: the next retry would otherwise poll a dead
    // container instead of creating a fresh one.
    await updateTargetFailure(post.id, target.id, mediaValidation.error, {
      clearJobId: true,
    });
    return failedOutcome(target, mediaValidation.error);
  }
  const media = post.media[0];
  const caption =
    typeof effective.content.text === "string" && effective.content.text.trim().length > 0
      ? effective.content.text
      : post.text;

  let accessToken: string;
  let mediaUrl: string;
  try {
    accessToken = await ensureFreshInstagramToken({
      id: account.id,
      accessToken: account.accessToken,
      expiresAt: account.expiresAt,
    });
    mediaUrl = await createSignedGetUrl({
      pathname: media.pathname,
      ttlMs: INSTAGRAM_MEDIA_READ_TTL_MS,
    });
  } catch (error) {
    const message = instagramErrorMessage(error);
    await updateTargetFailure(post.id, target.id, message, {
      clearJobId: true,
    });
    return failedOutcome(target, message);
  }

  const outcome = await publishInstagramMedia(
    accessToken,
    {
      igUserId: account.externalId,
      kind: media.type,
      mediaUrl,
      caption,
      existingContainerId: target.externalJobId,
    },
    {
      onContainerId: async (containerId) => {
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { externalJobId: containerId },
        });
      },
    }
  );

  switch (outcome.state) {
    case "published": {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: outcome.externalPostId ?? null,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return {
        ok: true,
        externalPostId: outcome.externalPostId ?? undefined,
        username: account.username,
        platform: "INSTAGRAM",
      };
    }
    case "invalid":
    case "failed": {
      // ERROR/EXPIRED/media errors are terminal on Instagram's side: clear the
      // container id so the next manual retry starts a fresh container.
      await updateTargetFailure(post.id, target.id, outcome.error, {
        clearJobId: true,
      });
      return failedOutcome(target, outcome.error);
    }
    case "processing": {
      return {
        ok: false,
        error: "Instagram is still processing this media. Publishing continues automatically — do not retry yet.",
        platform: "INSTAGRAM",
      };
    }
  }
}

/**
 * Resume entry point used by the scheduler's stale-recovery: a TikTok target
 * stuck in PUBLISHING with a known publish_id is resolved via status/fetch,
 * never by re-publishing.
 */
export async function resumeTiktokTarget(
  targetId: string
): Promise<"complete" | "failed" | "pending" | "skip"> {
  const target = await prisma.postTarget.findUnique({
    where: { id: targetId },
    include: { socialAccount: true },
  });
  if (
    !target ||
    target.platform !== "TIKTOK" ||
    !target.externalJobId ||
    target.status !== "PUBLISHING" ||
    !target.socialAccount
  ) {
    return "skip";
  }
  const account = target.socialAccount;
  try {
    const accessToken = await ensureFreshTiktokToken(account);
    const status = await fetchTiktokPublishStatus(accessToken, target.externalJobId);
    if (status.status === TIKTOK_STATUS_COMPLETE) {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "PUBLISHED",
          externalPostId: status.postIds[0] ?? null,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return "complete";
    }
    if (status.status === TIKTOK_STATUS_FAILED) {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          // Terminal job result: clear the id so a later manual retry can
          // start a fresh publish instead of polling a dead job forever.
          externalJobId: null,
          errorMessage: tiktokFailReasonMessage(status.failReason),
        },
      });
      return "failed";
    }
    return "pending";
  } catch (error) {
    const code = error instanceof TiktokApiError ? error.code : "";
    if (isTiktokAuthErrorCode(code)) {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          externalJobId: null,
          errorMessage: tiktokErrorMessage(error),
        },
      });
      return "failed";
    }
    return "pending";
  }
}

/** Instagram stale-recovery: poll the SAME container, never re-create it. */
export async function resumeInstagramTarget(
  targetId: string
): Promise<"complete" | "failed" | "pending" | "skip"> {
  const target = await prisma.postTarget.findUnique({
    where: { id: targetId },
    include: { socialAccount: true },
  });
  if (
    !target ||
    target.platform !== "INSTAGRAM" ||
    !target.externalJobId ||
    target.status !== "PUBLISHING" ||
    !target.socialAccount
  ) {
    return "skip";
  }
  const account = target.socialAccount;
  try {
    const accessToken = await ensureFreshInstagramToken(account);
    const outcome = await monitorInstagramContainer(
      accessToken,
      { igUserId: account.externalId, containerId: target.externalJobId }
    );
    if (outcome.state === "published") {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "PUBLISHED",
          externalPostId: outcome.externalPostId,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return "complete";
    }
    if (outcome.state === "failed") {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          externalJobId: null,
          errorMessage: outcome.error,
        },
      });
      return "failed";
    }
    return "pending";
  } catch (error) {
    // Mirror the TikTok resume: only terminal auth failures fail the
    // target (and drop the job id). Transient network/storage blips keep
    // the container id so the next tick resumes polling it.
    if (
      error instanceof InstagramApiError &&
      (error.code === "190" || /token|session|revoked/i.test(error.message))
    ) {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          externalJobId: null,
          errorMessage: instagramErrorMessage(error),
        },
      });
      return "failed";
    }
    return "pending";
  }
}

/**
 * Threads stale-recovery: poll the SAME container, never re-create it.
 * Terminal container states fail the target (and drop the container id);
 * anything else keeps the id so the next tick resumes polling it.
 */
export async function resumeThreadsTarget(
  targetId: string
): Promise<"complete" | "failed" | "pending" | "skip"> {
  const target = await prisma.postTarget.findUnique({
    where: { id: targetId },
    include: {
      socialAccount: true,
      post: { select: { media: { select: { type: true } } } },
    },
  });
  if (
    !target ||
    target.platform !== "THREADS" ||
    !target.externalJobId ||
    target.status !== "PUBLISHING" ||
    !target.socialAccount
  ) {
    return "skip";
  }
  const account = target.socialAccount;
  // Video containers transcode server-side for minutes: resume with the
  // video budget when the post carries video so polling is not cut short
  // (a short budget only reports "processing" and retries next tick —
  // never a duplicate — but the generous budget settles faster).
  const video = target.post.media.some((item) => item.type === "VIDEO");
  let accessToken: string;
  try {
    accessToken = await ensureFreshThreadsToken(account);
  } catch (error) {
    // Terminal refresh failure (expired/revoked): fail with reconnect
    // guidance. Anything else stays pending below.
    if (isThreadsAuthError(error)) {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          externalJobId: null,
          errorMessage: threadsErrorMessage(error),
        },
      });
      return "failed";
    }
    return "pending";
  }
  try {
    const outcome = await monitorThreadsContainer(
      accessToken,
      {
        threadsUserId: account.externalId,
        containerId: target.externalJobId,
        video,
      }
    );
    if (outcome.state === "published") {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "PUBLISHED",
          externalPostId: outcome.externalPostId,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      return "complete";
    }
    if (outcome.state === "failed") {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          externalJobId: null,
          errorMessage: outcome.error,
        },
      });
      return "failed";
    }
    return "pending";
  } catch (error) {
    // Mirror the TikTok/Instagram resume: only terminal auth failures fail
    // the target (and drop the container id). Transient blips — transport
    // errors, rate limits, Meta 5xx — keep the id so the next tick resumes
    // polling the same container instead of forcing a fresh one.
    if (isThreadsAuthError(error)) {
      await prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          externalJobId: null,
          errorMessage: threadsErrorMessage(error),
        },
      });
      return "failed";
    }
    return "pending";
  }
}

/**
 * X stale-recovery for crashed attempts (PUBLISHING + `x-req-` marker).
 * X has no remote job to poll, so this performs NO network calls: fresh
 * markers stay PUBLISHING ("pending" — blocks both the generic
 * auto-reset and manual republish), aged-out markers convert to FAILED
 * with check-first guidance ("failed"). Anything else returns "skip"
 * for the generic path. A second tweet POST is never issued here.
 */
export async function resumeXTarget(
  targetId: string
): Promise<"complete" | "failed" | "pending" | "skip"> {
  const target = await prisma.postTarget.findUnique({
    where: { id: targetId },
  });
  if (!target) return "skip";
  const decision = decideXStaleAttempt({
    platform: target.platform,
    status: target.status,
    externalJobId: target.externalJobId,
    updatedAtMs: target.updatedAt.getTime(),
    nowMs: Date.now(),
  });
  if (decision === "skip") return "skip";
  if (decision === "pending") return "pending";
  // Unknown outcome, aged out: convert to FAILED with informed-manual-
  // retry guidance. Conditional on still being PUBLISHING so a
  // concurrently settled target is never regressed.
  const claimed = await prisma.postTarget.updateMany({
    where: { id: targetId, status: "PUBLISHING" },
    data: {
      status: "FAILED",
      externalJobId: null,
      errorMessage: xAmbiguousRetryMessage(),
    },
  });
  return claimed.count > 0 ? "failed" : "skip";
}

/**
 * Pure resume routing behind the dispatch table: returns the platform's
 * resume function, or null when there is nothing jobbed to resume
 * (unknown platform, missing id). Unit-testable without a database;
 * `resumeJobTarget` is the DB-backed wrapper.
 */
export function resolveResumeEntry(
  platform: string | null | undefined
): ((targetId: string) => Promise<"complete" | "failed" | "pending" | "skip">) | null {
  if (!platform) return null;
  return PLATFORM_DISPATCH[platform as Platform]?.resume ?? null;
}

/**
 * Scheduler dispatch: resolve a stale PUBLISHING target by its own job,
 * routing to the right platform resume. Non-job targets return "skip" so
 * the standard stale-recovery resets them as before.
 */
export async function resumeJobTarget(
  targetId: string
): Promise<"complete" | "failed" | "pending" | "skip"> {
  const platform = await prisma.postTarget.findUnique({
    where: { id: targetId },
    select: { platform: true },
  });
  // Single dispatch table (E1): unknown platforms explicitly skip
  // instead of falling through to TikTok resume.
  const resume = resolveResumeEntry(platform?.platform);
  if (!resume) return "skip";
  return resume(targetId);
}

async function finalizePostStatus(postId: string, fallback: AggregatePostStatus): Promise<PublishOutcome> {
  const current = await prisma.post.findUnique({
    where: { id: postId },
    include: { targets: true },
  });
  if (!current) return { ok: false, error: "Post not found" };
  const status = derivePostStatus(current.targets, fallback);
  const errors = current.targets
    .filter((target) => target.status === "FAILED" && target.errorMessage)
    .map((target) => `${target.platform}: ${target.errorMessage}`)
    .join("; ");
  await prisma.post.update({
    where: { id: postId },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      errorMessage: errors || null,
    },
  });
  const published = current.targets.find((target) => target.status === "PUBLISHED");
  const stillProcessing = current.targets.some((target) => target.status === "PUBLISHING");
  return {
    ok: status === "PUBLISHED",
    externalPostId: published?.externalPostId ?? undefined,
    error:
      status === "PUBLISHED"
        ? undefined
        : errors ||
          (stillProcessing
            ? "Some platforms are still processing. Do not retry yet — publishing continues automatically."
            : "Publication failed"),
  };
}

export async function publishPostTargets(
  postId: string,
  targetId?: string
): Promise<PublishOutcome> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { targets: true, media: true },
  });
  if (!post) return { ok: false, error: "Post not found" };

  const publishableIds = new Set(selectPublishableTargetIds(post.targets));
  const targets = post.targets
    .filter((target) => publishableIds.has(target.id))
    .filter((target) => !targetId || target.id === targetId)
    .map((target) => ({
      id: target.id,
      platform: target.platform,
      status: target.status,
      socialAccountId: target.socialAccountId,
      overrides: target.overrides,
      externalJobId: target.externalJobId,
    }));
  if (targets.length === 0) {
    return finalizePostStatus(postId, post.status as AggregatePostStatus);
  }

  await prisma.post.update({ where: { id: postId }, data: { status: "PUBLISHING" } });
  const results = await publishTargetsInParallel(targets, (target) =>
    executeTargetPublish(post, target)
  );
  await Promise.all(
    results.map((result, index) => {
      if (result.status !== "rejected") return Promise.resolve();
      const error =
        result.reason instanceof Error ? result.reason.message : "Publication failed";
      return updateTargetFailure(postId, targets[index].id, error);
    })
  );
  return finalizePostStatus(postId, post.status as AggregatePostStatus);
}

/** Backward-compatible wrapper used by the scheduler during migration. */
export async function executePublish(
  post: { id: string; text: string },
  account?: { accessToken: string; externalId: string; username: string },
  target?: { id: string; platform: string }
): Promise<PublishOutcome> {
  void account;
  void target;
  return publishPostTargets(post.id);
}
