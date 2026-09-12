import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { publishPostTargets } from "@/lib/publish";
import { reportError } from "@/lib/diagnostics";

// Threads/TikTok video publishing can keep processing for minutes; the
// work continues in the background (waitUntil) within this 300s window.
export const maxDuration = 300;

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

    // Ownership + publishability check in one light query; the full post
    // (targets + media) is loaded exactly once, inside publishPostTargets.
    const post = await prisma.post.findFirst({
      where: { id },
      select: {
        userId: true,
        targets: { select: { status: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hasPublishableTarget = post.targets.some(
      (t) => t.status === "PENDING" || t.status === "FAILED"
    );
    if (!hasPublishableTarget) {
      return NextResponse.json(
        { error: "No publishable target found for this post" },
        { status: 400 }
      );
    }

    const claim = await prisma.post.updateMany({
      where: {
        id,
        status: { in: ["DRAFT", "SCHEDULED", "FAILED", "PARTIALLY_PUBLISHED"] },
      },
      data: { status: "PUBLISHING" },
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Post is already being published or has been published" },
        { status: 400 }
      );
    }

    // Atomic target claims, externalJobId persistence, ownership re-checks
    // and finalize semantics all stay inside publishPostTargets — the
    // background continuation only removes the client from the critical path.
    waitUntil(
      (async () => {
        try {
          await publishPostTargets(id);
        } catch (error) {
          reportError("publish", "background publish failed", error, {
            postId: id,
          });
          // The response is already sent; flush so the event is not lost
          // when the function freezes.
          await Sentry.flush(2000);
        }
      })()
    );

    return NextResponse.json(
      { ok: true, status: "PUBLISHING" },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
