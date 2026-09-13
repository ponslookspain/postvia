import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPrivateBlob } from "@/lib/blob";
import { logDiagnostic } from "@/lib/diagnostics";
import { serveTiktokBridgeMedia } from "@/lib/tiktok-media-bridge";

/**
 * TikTok PHOTO delivery bridge: `GET /api/tiktok/media/{mediaId}?expires&sig`.
 *
 * No session, no cookies — TikTok's servers fetch this URL with only the
 * HMAC token minted at publish time (see `tiktok-media-bridge.ts`). The
 * response streams the private-blob bytes directly (200, correct
 * Content-Type, binary body, never a redirect) so it satisfies TikTok's
 * PULL_FROM_URL ownership/https/no-redirect/1h-access rules under
 * Postvia's own verified host/path.
 */
async function handleBridge(
  request: NextRequest,
  params: Promise<{ id: string }>,
  method: string
): Promise<NextResponse | Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const result = await serveTiktokBridgeMedia(
    {
      mediaId: id,
      expires: url.searchParams.get("expires"),
      sig: url.searchParams.get("sig"),
      method,
    },
    {},
    {
      findMedia: async (mediaId) =>
        prisma.media.findUnique({
          where: { id: mediaId },
          select: { mimeType: true, pathname: true, size: true },
        }),
      fetchBlob: async (pathname) => {
        const blob = await fetchPrivateBlob(pathname);
        if (!blob) return null;
        return {
          stream: blob.stream,
          contentLength: blob.headers.get("content-length"),
        };
      },
    }
  );
  if (result.status === 404) {
    // Generic 404 on every failure (bad/expired token, unknown media,
    // wrong mime, missing bytes): the endpoint must not reveal which.
    // Never log the token itself.
    logDiagnostic("tiktok", "bridge media denied", { method });
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  logDiagnostic("tiktok", "bridge media served", { method });
  return new Response(result.body as BodyInit, {
    status: 200,
    headers: result.headers,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleBridge(request, params, "GET");
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleBridge(request, params, "HEAD");
}
