import { prisma } from "@/lib/prisma";
import { XProvider } from "@/lib/social/x";
import {
  ThreadsProvider,
  THREADS_PUBLISH_IMAGE_TTL_MS,
  THREADS_PUBLISH_VIDEO_TTL_MS,
} from "@/lib/social/threads";
import type { PublishMedia, SocialProvider } from "@/lib/social/provider";
import {
  getPlatformCapabilities,
  type PlatformCapabilities,
} from "@/lib/platforms/capabilities";
import {
  resolveEffectiveTargetContent,
  validateTargetMedia,
  validateTargetOverrides,
} from "@/lib/platforms/overrides";
import { resolveThreadsMediaPolicy, type MediaKind } from "@/lib/media";
import { createSignedGetUrl } from "@/lib/blob";

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

function getProvider(platform: string): SocialProvider {
  switch (platform) {
    case "X":
      return new XProvider();
    case "THREADS":
      return new ThreadsProvider();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

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

type PublishPost = {
  id: string;
  userId: string;
  text: string;
  status: string;
  media: readonly {
    id: string;
    type: MediaKind;
    pathname: string;
    mimeType: string;
  }[];
};

type PublishTarget = {
  id: string;
  platform: string;
  status: string;
  socialAccountId: string | null;
  overrides: unknown;
};

type PublishAccount = {
  id: string;
  userId: string;
  platform: string;
  accessToken: string;
  externalId: string;
  username: string;
};

export function derivePostStatus(
  targets: readonly { status: string }[],
  fallback: AggregatePostStatus = "DRAFT"
): AggregatePostStatus {
  if (targets.length === 0) return fallback;
  const published = targets.filter((target) => target.status === "PUBLISHED").length;
  const failed = targets.filter((target) => target.status === "FAILED").length;
  const publishing = targets.some((target) => target.status === "PUBLISHING");
  if (published === targets.length) return "PUBLISHED";
  if (published > 0 && failed > 0) return "PARTIALLY_PUBLISHED";
  if (publishing) return "PUBLISHING";
  if (failed === targets.length) return "FAILED";
  return fallback === "SCHEDULED" ? "SCHEDULED" : "DRAFT";
}

function failedOutcome(
  target: PublishTarget,
  error: string
): PublishOutcome {
  return { ok: false, error, platform: target.platform };
}

async function resolveTargetAccount(
  postUserId: string,
  target: PublishTarget
): Promise<PublishAccount | null> {
  const account = target.socialAccountId
    ? await prisma.socialAccount.findUnique({ where: { id: target.socialAccountId } })
    : await prisma.socialAccount.findFirst({
        where: { userId: postUserId, platform: target.platform as never },
      });
  if (!account || account.userId !== postUserId || account.platform !== target.platform) {
    return null;
  }
  return account;
}

async function updateTargetFailure(
  postId: string,
  targetId: string,
  error: string
): Promise<void> {
  await prisma.postTarget.update({
    where: { id: targetId },
    data: { status: "FAILED", errorMessage: error },
  });
}

async function resolveTargetMedia(
  post: PublishPost,
  target: PublishTarget,
  caps: PlatformCapabilities
): Promise<{ media?: PublishMedia; error?: string }> {
  const mediaValidation = validateTargetMedia(caps, post.media);
  if (!mediaValidation.ok) return { error: mediaValidation.error };
  if (target.platform !== "THREADS") return {};
  return chooseThreadsMedia(post.media, (pathname, ttlMs) =>
    createSignedGetUrl({ pathname, ttlMs })
  );
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
  const resolvedMedia = await resolveTargetMedia(post, target, caps);
  if (resolvedMedia.error) {
    await updateTargetFailure(post.id, target.id, resolvedMedia.error);
    return failedOutcome(target, resolvedMedia.error);
  }

  const provider = getProvider(target.platform);
  const result = await provider.publishPost(
    account.accessToken,
    effective.text,
    account.externalId,
    resolvedMedia.media
  );
  if (!result.success) {
    const error = result.error || "Publication failed";
    await updateTargetFailure(post.id, target.id, error);
    return failedOutcome(target, error);
  }

  await prisma.postTarget.update({
    where: { id: target.id },
    data: {
      status: "PUBLISHED",
      externalPostId: result.externalPostId,
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
  return {
    ok: status === "PUBLISHED",
    externalPostId: published?.externalPostId ?? undefined,
    error: status === "PUBLISHED" ? undefined : errors || "Publication failed",
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

  const targets = post.targets
    .filter((target) => target.status === "PENDING" || target.status === "FAILED")
    .filter((target) => !targetId || target.id === targetId)
    .map((target) => ({
      id: target.id,
      platform: target.platform,
      status: target.status,
      socialAccountId: target.socialAccountId,
      overrides: target.overrides,
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
