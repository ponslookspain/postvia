import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDemoUser } from "@/lib/auth";
import { executePublish } from "@/lib/publish";

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

    const target = post.targets.find((t) => t.status === "FAILED");
    if (!target) {
      return NextResponse.json(
        { error: "No failed target found" },
        { status: 400 }
      );
    }

    const claim = await prisma.post.updateMany({
      where: { id, status: "FAILED" },
      data: { status: "PUBLISHING", errorMessage: null },
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Post is no longer in a failed state" },
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
      await prisma.post.update({
        where: { id },
        data: { status: "FAILED" },
      });
      return NextResponse.json(
        { error: `${target.platform} account not connected` },
        { status: 400 }
      );
    }

    const result = await executePublish(post, account, target);

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        platform: result.platform,
        externalPostId: result.externalPostId,
        username: result.username,
      });
    }

    return NextResponse.json(
      { error: result.error || "Publication failed" },
      { status: 422 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}