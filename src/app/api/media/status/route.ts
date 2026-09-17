import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { gateWriteRequest, WRITE_LIMIT_MEDIA_STATUS } from "@/lib/abuse";
import { isUploadRegistered } from "@/lib/media-upload";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    // Polled by the composer (~500ms x 20s per upload): a roomy persistent
    // gate so a scripted poll flood cannot burn DB reads indefinitely.
    if (
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "media-status",
        userMax: WRITE_LIMIT_MEDIA_STATUS,
      }))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const postId = request.nextUrl.searchParams.get("postId") ?? "";
    const pathname = request.nextUrl.searchParams.get("pathname") ?? "";
    if (!postId || !pathname) {
      return NextResponse.json({ error: "postId and pathname are required" }, { status: 400 });
    }

    const exists = await isUploadRegistered({
      userId: user.id,
      postId,
      pathname,
    });
    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json({ error: "Failed to check upload" }, { status: 500 });
  }
}
