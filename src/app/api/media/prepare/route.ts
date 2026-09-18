import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { gateWriteRequest, WRITE_LIMIT_MEDIA_PREPARE } from "@/lib/abuse";
import { reserveUploadPathname } from "@/lib/media-upload";
import {
  AuthorizationError,
  DomainError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors/domain-error";
import { toApiResponse } from "@/lib/errors/to-response";

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
      const mapped = toApiResponse(new ValidationError("Invalid request body"));
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    // Auth first: unauthenticated callers get 401 without burning quota,
    // and the gate below always runs for authenticated users.
    const user = await getApiUser();
    if (!user) {
      const mapped = toApiResponse(new AuthorizationError("Not authenticated"));
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "media-prepare",
        userMax: WRITE_LIMIT_MEDIA_PREPARE,
      }))
    ) {
      const mapped = toApiResponse(
        new RateLimitError("Too many requests. Please wait before trying again.")
      );
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const result = await reserveUploadPathname({
      user,
      postId: typeof body.postId === "string" ? body.postId : "",
      filename: typeof body.filename === "string" ? body.filename : "",
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
      size: typeof body.size === "number" ? body.size : 0,
    });

    if (!result.ok) {
      // Flat backward-compatible shape: same `error` string + added `code`.
      const mapped = toApiResponse({
        error: result.error,
        status: result.status,
        code: result.code,
      });
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    return NextResponse.json({ pathname: result.pathname });
  } catch {
    const mapped = toApiResponse(
      new DomainError("Failed to prepare upload", { code: "INTERNAL", status: 500 })
    );
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
