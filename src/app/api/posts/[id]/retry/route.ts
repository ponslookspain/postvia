import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { publishPostTargets } from "@/lib/publish";
import { canRetry, getEffectivePlan } from "@/lib/entitlements";
import { STALE_PUBLISHING_MS } from "@/lib/scheduling";
import { reportError } from "@/lib/diagnostics";

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

    const retryGate = canRetry(
      await getEffectivePlan({ userId: user.id, userEmail: user.email })
    );
    if (!retryGate.ok) {
      return NextResponse.json(
        { code: retryGate.code, reason: retryGate.reason, upgradeTo: retryGate.upgradeTo },
        { status: 403 }
      );
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
        status: true,
        updatedAt: true,
        targets: { select: { id: true, status: true, externalJobId: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (post.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staleCutoff = new Date(Date.now() - STALE_PUBLISHING_MS);
    // A post stuck in PUBLISHING past the stale threshold has no running
    // function behind it (maxDuration 300s < STALE_PUBLISHING_MS): its
    // jobless sync targets (X) are safe to re-queue, while targets
    // holding a platform job/container id stay with the cron resume path.
    const isStalePublishing =
      post.status === "PUBLISHING" && post.updatedAt < staleCutoff;

    let target = requestedTargetId
      ? post.targets.find((t) => t.id === requestedTargetId && t.status === "FAILED")
      : post.targets.find((t) => t.status === "FAILED");

    if (!target && isStalePublishing) {
      await prisma.postTarget.updateMany({
        where: { postId: id, status: "PUBLISHING", externalJobId: null },
        data: { status: "PENDING", errorMessage: null },
      });
      const refreshed = await prisma.post.findFirst({
        where: { id },
        select: { targets: { select: { id: true, status: true, externalJobId: true } } },
      });
      target = refreshed?.targets.find((t) => t.status === "PENDING") ?? undefined;
    }

    if (!target) {
      return NextResponse.json(
        { error: "No failed target found for this retry" },
        { status: 400 }
      );
    }

    // Retry is allowed when the post overall failed OR partially failed
    // (some platforms published, others failed), or when it is stale in
    // PUBLISHING with no live function behind it. PUBLISHED targets are
    // never re-published: publishPostTargets only claims PENDING/FAILED
    // targets, and a target-level atomic claim is taken inside it.
    const claim = await prisma.post.updateMany({
      where: {
        id,
        OR: [
          { status: { in: ["FAILED", "PARTIALLY_PUBLISHED"] } },
          { status: "PUBLISHING", updatedAt: { lt: staleCutoff } },
        ],
      },
      data: { status: "PUBLISHING", errorMessage: null },
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Post is no longer in a retryable state" },
        { status: 400 }
      );
    }

    waitUntil(
      (async () => {
        try {
          await publishPostTargets(id, target.id);
        } catch (error) {
          reportError("publish", "background retry failed", error, {
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
      error instanceof Error ? error.message : "Failed to retry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
