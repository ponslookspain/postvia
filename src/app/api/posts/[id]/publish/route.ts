import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { gateWriteRequest, WRITE_LIMIT_PUBLISH } from "@/lib/abuse";
import { publishPostTargets } from "@/lib/publish";
import { reportError } from "@/lib/diagnostics";

// Threads/TikTok video publishing can keep processing for minutes; the
// work continues in the background (waitUntil) within this 300s window.
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Flood gate before provider work starts. Generous: manual retries
    // stay far below it; the entitlement gate still decides allow/deny.
    if (
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "publish",
        userMax: WRITE_LIMIT_PUBLISH,
      }))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
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

    // Atomic ownership: the claim itself is scoped to this user's row,
    // so a TOCTOU swap between the read above and this write can only
    // miss (400 below), never publish another user's post.
    const claim = await prisma.post.updateMany({
      where: {
        id,
        userId: user.id,
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
    // Generic client body: the raw cause stays server-side in diagnostics.
    reportError("publish", "publish request failed", error, { postId: id });
    return NextResponse.json(
      { error: "Failed to start publishing" },
      { status: 500 }
    );
  }
}
