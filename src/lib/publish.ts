import { prisma } from "@/lib/prisma";
import { XProvider } from "@/lib/social/x";
import { ThreadsProvider } from "@/lib/social/threads";
import type { SocialProvider } from "@/lib/social/provider";

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

export async function executePublish(
  post: { id: string; text: string },
  account: {
    accessToken: string;
    externalId: string;
    username: string;
  },
  target: { id: string; platform: string }
): Promise<PublishOutcome> {
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
    account.externalId
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
  await prisma.post.update({
    where: { id: post.id },
    data: { status: "FAILED", errorMessage },
  });
  await prisma.postTarget.update({
    where: { id: target.id },
    data: { status: "FAILED", errorMessage },
  });

  return { ok: false, error: errorMessage, platform: target.platform };
}