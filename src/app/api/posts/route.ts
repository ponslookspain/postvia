import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDemoUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getOrCreateDemoUser();
    const posts = await prisma.post.findMany({
      where: { userId: user.id },
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
    const { text } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const user = await getOrCreateDemoUser();

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        text: text.trim(),
        status: "DRAFT",
        targets: {
          create: {
            platform: "X",
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
