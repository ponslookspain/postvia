import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { gateWriteRequest, WRITE_LIMIT_MEDIA_PREPARE } from "@/lib/abuse";
import { reserveUploadPathname } from "@/lib/media-upload";

export async function POST(request: NextRequest) {
  try {
    let body: {
      postId?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const user = await getApiUser();
    if (
      user &&
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "media-prepare",
        userMax: WRITE_LIMIT_MEDIA_PREPARE,
      }))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }
    const result = await reserveUploadPathname({
      user,
      postId: typeof body.postId === "string" ? body.postId : "",
      filename: typeof body.filename === "string" ? body.filename : "",
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
      size: typeof body.size === "number" ? body.size : 0,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ pathname: result.pathname });
  } catch {
    return NextResponse.json(
      { error: "Failed to prepare upload" },
      { status: 500 }
    );
  }
}
