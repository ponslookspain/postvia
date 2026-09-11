import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executePublish } from "@/lib/publish";
import {
  isCronAuthorized,
  runScheduledPublishTick,
  type SchedulingDb,
} from "@/lib/scheduling";
import { resumeTiktokTarget } from "@/lib/publish";

// One scheduled video publish can poll Meta's container for up to ~4
// minutes; the tick stops claiming new posts at the internal budget
// (CRON_TICK_BUDGET_MS) and the rest wait for the next invocation.
export const maxDuration = 300;

async function handleCron(request: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await runScheduledPublishTick({
      db: prisma as unknown as SchedulingDb,
      publish: executePublish,
      resumeJob: (target) => resumeTiktokTarget(target.id),
    });
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron invokes the path with GET (Authorization: Bearer CRON_SECRET
// is attached automatically when the CRON_SECRET env var exists); the
// external/manual trigger uses POST. Both share the same handler.
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleCron(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleCron(request);
}
