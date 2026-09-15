import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { fetchPrivateBlob, deleteBlobs } from "@/lib/blob";
import { runMediaDeleteFlow } from "@/lib/delete-resources";

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

    // A media id is an immutable, never-reused cuid: once served for this
    // (authenticated) user its bytes never change. Cache is `private`, so
    // only this user's own browser stores it - no cross-user exposure,
    // including after deletion (ids are never recycled).
    const etag = `"${media.id}"`;
    const range = request.headers.get("range");
    // Only short-circuit full reads; never shortcut a byte-range request
    // (that would break resumable/video byte fetching).
    if (!range && request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=3600" },
      });
    }

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
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("ETag", etag);
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

    // DB-first (see runMediaDeleteFlow): leftover bytes are sweepable
    // orphans, never rows pointing at missing blobs.
    const outcome = await runMediaDeleteFlow({
      mediaId: id,
      userId: user.id,
      pathname: media.pathname,
      deleteMediaRow: async (mediaId, userId) => {
        // Atomic ownership: scoped deleteMany + count check.
        const deleted = await prisma.media.deleteMany({
          where: { id: mediaId, userId },
        });
        return deleted.count > 0 ? "deleted" : "missing";
      },
      deleteBlobs,
    });
    if (outcome.outcome === "not-found") {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }
    if (outcome.outcome === "blobs-failed") {
      return NextResponse.json(
        { error: "Failed to delete file" },
        { status: 500 }
      );
    }
    if (outcome.outcome === "failed") {
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