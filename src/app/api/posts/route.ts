import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDemoUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateDemoUser();
    const status = request.nextUrl.searchParams.get("status");

    const posts = await prisma.post.findMany({
      where: {
        userId: user.id,
        ...(status ? { status: status as "DRAFT" } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { targets: true },
    });
    return NextResponse.json(posts);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, platform: rawPlatform, scheduledAt } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const platform = rawPlatform === "THREADS" ? "THREADS" : "X";

    if (platform === "X" && scheduledAt) {
      return NextResponse.json(
        {
          error:
            "Scheduling for X is not available yet. Use Threads to schedule a post.",
        },
        { status: 400 }
      );
    }

    const isScheduled = Boolean(scheduledAt);

    if (isScheduled) {
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduled time" },
          { status: 400 }
        );
      }
      if (date.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Scheduled time must be in the future" },
          { status: 400 }
        );
      }
    }

    const user = await getOrCreateDemoUser();

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        text: text.trim(),
        status: isScheduled ? "SCHEDULED" : "DRAFT",
        scheduledAt: isScheduled ? new Date(scheduledAt) : null,
        publishedAt: null,
        targets: {
          create: {
            platform,
            status: "PENDING",
          },
        },
      },
      include: { targets: true },
    });

    return NextResponse.json(post, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
