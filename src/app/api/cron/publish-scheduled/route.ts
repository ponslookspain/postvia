import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executePublish } from "@/lib/publish";

const AUTH_PREFIX = "Bearer ";

// One scheduled video publish can poll Meta's container for up to ~4
// minutes; keep the function inside the plan maxDuration (300s) and
// stop claiming new posts when the tick budget runs out - remaining
// SCHEDULED posts are picked up by the next cron tick.
export const maxDuration = 300;
const CRON_TICK_BUDGET_MS = 240_000;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) return false;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith(AUTH_PREFIX)) return false;

  const provided = header.slice(AUTH_PREFIX.length);
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tickStartedAt = Date.now();

  const duePosts = await prisma.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: { targets: true },
  });

  let published = 0;
  let failed = 0;
  let skipped = 0;

  for (const post of duePosts) {
    if (Date.now() - tickStartedAt > CRON_TICK_BUDGET_MS) {
      // Out of time for this tick; unclaimed posts stay SCHEDULED and are
      // picked up by the next cron invocation.
      break;
    }

    const claim = await prisma.post.updateMany({
      where: { id: post.id, status: "SCHEDULED" },
      data: { status: "PUBLISHING" },
    });

    if (claim.count === 0) {
      skipped++;
      continue;
    }

    const target = post.targets[0];

    if (!target) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMessage: "No publish target found" },
      });
      failed++;
      continue;
    }

    if (target.platform === "X") {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "FAILED",
          errorMessage:
            "Scheduling for X is not available yet. Connect a Threads account and try again.",
        },
      });
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage:
            "Scheduling for X is not available yet. Connect a Threads account and try again.",
        },
      });
      failed++;
      continue;
    }

    const account = await prisma.socialAccount.findUnique({
      where: {
        userId_platform: {
          userId: post.userId,
          platform: target.platform,
        },
      },
    });

    if (!account) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "FAILED",
          errorMessage: `${target.platform} account not connected. Please connect your ${target.platform} account first.`,
        },
      });
      await prisma.postTarget.update({
        where: { id: target.id },
        data: { status: "FAILED" },
      });
      failed++;
      continue;
    }

    try {
      const outcome = await executePublish(post, account, target);
      if (outcome.ok) {
        published++;
      } else {
        failed++;
      }
    } catch (error) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Publication failed",
        },
      });
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Publication failed",
        },
      });
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: duePosts.length,
    published,
    failed,
    skipped,
  });
}