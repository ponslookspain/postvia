import { prisma } from "@/lib/prisma";
import { XProvider } from "@/lib/social/x";
import {
  ThreadsProvider,
  THREADS_PUBLISH_IMAGE_TTL_MS,
  THREADS_PUBLISH_VIDEO_TTL_MS,
} from "@/lib/social/threads";
import type { PublishMedia, SocialProvider } from "@/lib/social/provider";
import { resolveThreadsMediaPolicy, type MediaKind } from "@/lib/media";
import { createSignedGetUrl } from "@/lib/blob";

export interface PublishOutcome {
  ok: boolean;
  error?: string;
  externalPostId?: string;
  username?: string;
  platform?: string;
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

async function resolveThreadsMedia(postId: string): Promise<{
  media?: PublishMedia;
  error?: string;
}> {
  const media = await prisma.media.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, pathname: true, mimeType: true },
  });

  return chooseThreadsMedia(media, (pathname, ttlMs) =>
    createSignedGetUrl({ pathname, ttlMs })
  );
}

async function markFailed(
  postId: string,
  targetId: string,
  errorMessage: string
): Promise<void> {
  await prisma.post.update({
    where: { id: postId },
    data: { status: "FAILED", errorMessage },
  });
  await prisma.postTarget.update({
    where: { id: targetId },
    data: { status: "FAILED", errorMessage },
  });
}

export async function executePublish(
  post: { id: string; text: string },
  account: {
    accessToken: string;
    externalId: string;
    username: string;
  },
  target: { id: string; platform: string }
): Promise<PublishOutcome> {
  let media: PublishMedia | undefined;
  if (target.platform === "THREADS") {
    const resolved = await resolveThreadsMedia(post.id);
    if (resolved.error) {
      await markFailed(post.id, target.id, resolved.error);
      return { ok: false, error: resolved.error, platform: target.platform };
    }
    media = resolved.media;
  }

  await prisma.post.update({
    where: { id: post.id },
    data: { status: "PUBLISHING" },
  });
  await prisma.postTarget.update({
    where: { id: target.id },
    data: { status: "PUBLISHING" },
  });

  const provider = getProvider(target.platform);
  const result = await provider.publishPost(
    account.accessToken,
    post.text,
    account.externalId,
    media
  );

  if (result.success) {
    const now = new Date();
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        errorMessage: null,
      },
    });
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "PUBLISHED",
        externalPostId: result.externalPostId,
        publishedAt: now,
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

  const errorMessage = result.error || "Publication failed";
  await markFailed(post.id, target.id, errorMessage);

  return { ok: false, error: errorMessage, platform: target.platform };
}