import { prisma } from "@/lib/prisma";
import { XProvider } from "@/lib/social/x";
import {
  ThreadsProvider,
  THREADS_PUBLISH_IMAGE_TTL_MS,
} from "@/lib/social/threads";
import type { SocialProvider } from "@/lib/social/provider";
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

export async function chooseThreadsImageUrl(
  media: readonly { id: string; type: MediaKind; pathname: string }[],
  signUrl: (pathname: string) => Promise<string>
): Promise<{ imageUrl?: string; error?: string }> {
  const policy = resolveThreadsMediaPolicy(media);
  if (policy.kind === "text") return {};
  if (policy.kind === "error") return { error: policy.message };

  const image = media.find((m) => m.id === policy.mediaId);
  if (!image) return { error: "Threads media could not be resolved" };

  try {
    const imageUrl = await signUrl(image.pathname);
    return { imageUrl };
  } catch {
    return { error: "Failed to generate media URL for Threads" };
  }
}

async function resolveThreadsImageUrl(postId: string): Promise<{
  imageUrl?: string;
  error?: string;
}> {
  const media = await prisma.media.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, pathname: true },
  });

  return chooseThreadsImageUrl(media, (pathname) =>
    createSignedGetUrl({ pathname, ttlMs: THREADS_PUBLISH_IMAGE_TTL_MS })
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
  let imageUrl: string | undefined;
  if (target.platform === "THREADS") {
    const resolved = await resolveThreadsImageUrl(post.id);
    if (resolved.error) {
      await markFailed(post.id, target.id, resolved.error);
      return { ok: false, error: resolved.error, platform: target.platform };
    }
    imageUrl = resolved.imageUrl;
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
    imageUrl
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