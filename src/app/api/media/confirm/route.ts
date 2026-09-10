import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { confirmClientUpload } from "@/lib/media-upload";

export async function POST(request: NextRequest) {
  try {
    let body: {
      postId?: string;
      pathname?: string;
      filename?: string;
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
    const result = await confirmClientUpload({
      user,
      postId: typeof body.postId === "string" ? body.postId : null,
      pathname: typeof body.pathname === "string" ? body.pathname : null,
      filename: typeof body.filename === "string" ? body.filename : "",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.media, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}