import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { isUploadRegistered } from "@/lib/media-upload";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
