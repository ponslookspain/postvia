import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDemoUser } from "@/lib/auth";
import { XProvider } from "@/lib/social/x";
import { ThreadsProvider } from "@/lib/social/threads";
import type { SocialProvider } from "@/lib/social/provider";

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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getOrCreateDemoUser();

    const post = await prisma.post.findUnique({
      where: { id },
      include: { targets: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (post.status !== "FAILED") {
      return NextResponse.json(
        { error: "Only failed posts can be retried" },
        { status: 400 }
      );
    }

    const target = post.targets.find((t) => t.status === "FAILED");
    if (!target) {
      return NextResponse.json(
        { error: "No failed target found" },
        { status: 400 }
      );
    }

    const account = await prisma.socialAccount.findUnique({
      where: {
        userId_platform: {
          userId: user.id,
          platform: target.platform,
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: `${target.platform} account not connected` },
        { status: 400 }
      );
    }

    await prisma.post.update({
      where: { id },
      data: { status: "PUBLISHING", errorMessage: null },
    });
    await prisma.postTarget.update({
      where: { id: target.id },
      data: { status: "PUBLISHING", errorMessage: null },
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
        where: { id },
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

      return NextResponse.json({
        ok: true,
        platform: target.platform,
        externalPostId: result.externalPostId,
        username: account.username,
      });
    } else {
      await prisma.post.update({
        where: { id },
        data: {
          status: "FAILED",
          errorMessage: result.error || "Publication failed",
        },
      });
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage: result.error || "Publication failed",
        },
      });

      return NextResponse.json(
        { error: result.error || "Publication failed" },
        { status: 422 }
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}