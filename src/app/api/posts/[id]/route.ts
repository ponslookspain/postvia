import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { deleteBlobs } from "@/lib/blob";
import { resolveScheduledAtUpdate } from "@/lib/schedule";
import { canRetry, getEffectivePlan } from "@/lib/entitlements";
import { getPlatformCapabilities } from "@/lib/platforms/capabilities";
import { validateTargetMedia } from "@/lib/platforms/overrides";

async function findOwnedPost(id: string, userId: string) {
  return prisma.post.findFirst({
    where: { id, userId },
    include: { targets: { include: { socialAccount: { select: { username: true } } } }, media: true },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const post = await findOwnedPost(id, user.id);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch post" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("bad body");
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const existing = await findOwnedPost(id, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Status is owned by the publish/retry/cron flow, never by clients.
    if (body.status !== undefined) {
      return NextResponse.json(
        { error: "Status is managed by publishing and cannot be set directly" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};

    if (body.text !== undefined) {
      if (typeof body.text !== "string" || body.text.trim().length === 0) {
        return NextResponse.json(
          { error: "Text is required" },
          { status: 400 }
        );
      }
      data.text = body.text.trim();
    }

    if (body.scheduledAt !== undefined) {
      const rescheduleGate = canRetry(
        await getEffectivePlan({ userId: user.id, userEmail: user.email })
      );
      if (!rescheduleGate.ok) {
        return NextResponse.json(
          {
            code: rescheduleGate.code,
            reason: rescheduleGate.reason,
            upgradeTo: rescheduleGate.upgradeTo,
          },
          { status: 403 }
        );
      }
      // The X-scheduling ban applies to the whole post, not just the first
      // target (matching the create route, which checks every account).
      const hasXTarget = existing.targets.some(
        (target) => target.platform === "X"
      );
      const resolution = resolveScheduledAtUpdate({
        currentStatus: existing.status,
        platform: hasXTarget ? "X" : (existing.targets[0]?.platform ?? ""),
        rawScheduledAt: body.scheduledAt,
      });
      if (!resolution.ok) {
        return NextResponse.json(
          { error: resolution.error },
          { status: resolution.status }
        );
      }
      data.scheduledAt = resolution.data.scheduledAt;
      data.status = resolution.data.status;
      data.errorMessage = null;

      // Defense-in-depth: never park a post in SCHEDULED with media its
      // targets cannot publish. The client blocks incompatible combos
      // before upload (capability validation) and the publish pipeline
      // re-checks at publish time; this is the middle layer that keeps a
      // broken combination a DRAFT instead of a doomed schedule. The post
      // is left untouched — the caller keeps the draft id for recovery.
      if (resolution.data.status === "SCHEDULED" && existing.media.length > 0) {
        const storedMedia = existing.media.map((item) => ({
          type: item.type,
          mimeType: item.mimeType,
          size: item.size,
        }));
        for (const target of existing.targets) {
          const verdict = validateTargetMedia(
            getPlatformCapabilities(target.platform),
            storedMedia
          );
          if (!verdict.ok) {
            return NextResponse.json(
              {
                error: `Cannot schedule: ${verdict.error} The post was kept as a draft.`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const post = await prisma.post.update({
      where: { id },
      data,
      include: { targets: { include: { socialAccount: { select: { username: true } } } }, media: true },
    });

    return NextResponse.json(post);
  } catch {
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const existing = await findOwnedPost(id, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (existing.media.length > 0) {
      try {
        await deleteBlobs(existing.media.map((m) => m.pathname));
      } catch {
        return NextResponse.json(
          { error: "Failed to delete media" },
          { status: 500 }
        );
      }
    }

    // Quota invariant: deleting a post never touches the PostUsage ledger,
    // so create/delete loops cannot refill the monthly quota. The deleted
    // unit stays consumed — fail-closed by design.
    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}
