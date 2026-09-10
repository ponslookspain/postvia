import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDemoUser } from "@/lib/auth";
import { XProvider } from "@/lib/social/x";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getOrCreateDemoUser();

    const account = await prisma.socialAccount.findUnique({
      where: {
        userId_platform: {
          userId: user.id,
          platform: "X",
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "X account not connected. Please connect your X account first." },
        { status: 400 }
      );
    }

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

    if (post.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "Post is already published" },
        { status: 400 }
      );
    }

    const target = post.targets.find((t) => t.platform === "X");
    if (!target) {
      return NextResponse.json(
        { error: "No X target found for this post" },
        { status: 400 }
      );
    }

    await prisma.post.update({
      where: { id },
      data: { status: "PUBLISHING" },
    });
    await prisma.postTarget.update({
      where: { id: target.id },
      data: { status: "PUBLISHING" },
    });

    const xProvider = new XProvider();
    const result = await xProvider.publishPost(account.accessToken, post.text);

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
      error instanceof Error ? error.message : "Failed to publish";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
