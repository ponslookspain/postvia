import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { fetchPrivateBlob, deleteBlobs } from "@/lib/blob";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const media = await prisma.media.findFirst({
      where: { id, userId: user.id },
    });
    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    const range = request.headers.get("range");
    const result = await fetchPrivateBlob(media.pathname, range);
    if (!result) {
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 }
      );
    }

    if (result.statusCode === 304) {
      return new Response(null, { status: 304 });
    }

    const headers = new Headers();
    headers.set("Content-Type", media.mimeType);
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Accept-Ranges", "bytes");

    const contentLength = result.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    const contentRange = result.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    return new Response(result.stream, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { error: "Failed to load media" },
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

    const media = await prisma.media.findFirst({
      where: { id, userId: user.id },
    });
    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    try {
      await deleteBlobs([media.pathname]);
    } catch {
      return NextResponse.json(
        { error: "Failed to delete file" },
        { status: 500 }
      );
    }

    try {
      await prisma.media.delete({ where: { id } });
    } catch {
      return NextResponse.json(
        { error: "Failed to delete media record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete media" },
      { status: 500 }
    );
  }
}