import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { publishPostTargets } from "@/lib/publish";
import { logErrorDiagnostic } from "@/lib/diagnostics";

// Retrying a video target can again take minutes; same background pattern
// as the publish route. Claims and resume semantics stay in publishPostTargets.
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let requestedTargetId: string | null = null;
    try {
      const body = await request.json();
      requestedTargetId =
        typeof body?.targetId === "string" ? body.targetId : null;
    } catch {
      // Empty body keeps legacy behavior: retry the first failed target.
    }

    const post = await prisma.post.findFirst({
      where: { id },
      select: {
        userId: true,
        targets: { select: { id: true, status: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (post.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Retry is allowed when the post overall failed OR partially failed
    // (some platforms published, others failed). PUBLISHED targets are
    // never re-published: publishPostTargets only claims PENDING/FAILED
    // targets, and a target-level atomic claim is taken inside it.
    const claim = await prisma.post.updateMany({
      where: { id, status: { in: ["FAILED", "PARTIALLY_PUBLISHED"] } },
      data: { status: "PUBLISHING", errorMessage: null },
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Post is no longer in a retryable state" },
        { status: 400 }
      );
    }

    waitUntil(
      publishPostTargets(id, target.id).catch((error) => {
        logErrorDiagnostic("publish", "background retry failed", error, {
          postId: id,
        });
      })
    );

    return NextResponse.json(
      { ok: true, status: "PUBLISHING" },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
