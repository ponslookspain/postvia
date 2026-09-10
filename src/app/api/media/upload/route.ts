import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { validateMediaInput, makeBlobPathname } from "@/lib/media";
import { uploadPrivateBlob, deleteBlobs } from "@/lib/blob";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const form = await request.formData();
    const postIdValue = form.get("postId");
    const postId = typeof postIdValue === "string" ? postIdValue : "";
    const file = form.get("file");

    if (!postId) {
      return NextResponse.json({ error: "postId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: user.id },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const validation = validateMediaInput(file.type, file.size);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const pathname = makeBlobPathname(user.id, file.name);

    let stored;
    try {
      stored = await uploadPrivateBlob({
        pathname,
        body: file,
        contentType: file.type,
      });
    } catch {
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    try {
      const media = await prisma.media.create({
        data: {
          userId: user.id,
          postId,
          url: stored.url,
          pathname: stored.pathname,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          type: validation.kind,
        },
      });
      return NextResponse.json(media, { status: 201 });
    } catch {
      try {
        await deleteBlobs([stored.pathname]);
      } catch {
        // Best-effort orphan cleanup; ignore secondary failures.
      }
      return NextResponse.json(
        { error: "Failed to create media record" },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}