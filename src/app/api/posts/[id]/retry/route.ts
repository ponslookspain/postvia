import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { publishPostTargets } from "@/lib/publish";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

    let requestedTargetId: string | null = null;
    try {
      const body = await _request.json();
      requestedTargetId = typeof body?.targetId === "string" ? body.targetId : null;
    } catch {
      // Empty body keeps legacy behavior: retry the first failed target.
    }
    const target = requestedTargetId
      ? post.targets.find((t) => t.id === requestedTargetId && t.status === "FAILED")
      : post.targets.find((t) => t.status === "FAILED");
    if (!target) {
      return NextResponse.json(
        { error: "No failed target found for this retry" },
        { status: 400 }
      );
    }

    const result = await publishPostTargets(id, target.id);

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
