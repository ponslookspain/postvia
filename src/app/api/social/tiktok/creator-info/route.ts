import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { gateWriteRequest, WRITE_LIMIT_CREATOR_INFO } from "@/lib/abuse";
import {
  TiktokApiError,
  ensureFreshTiktokToken,
  isTiktokAuthErrorCode,
  queryTiktokCreatorInfo,
  tiktokErrorCode,
  tiktokErrorMessage,
} from "@/lib/social/tiktok";

/**
 * Live per-account posting settings for the composer. Options come straight
 * from TikTok creator info — the UI must not hardcode privacy levels.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    // Each call fans out to the TikTok API server-side: roomy persistent
    // gate so composer polling cannot be scripted into provider abuse.
    if (
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "creator-info",
        userMax: WRITE_LIMIT_CREATOR_INFO,
      }))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, userId: user.id, platform: "TIKTOK" },
    });
    if (!account) {
      return NextResponse.json({ error: "TikTok account not found" }, { status: 404 });
    }

    const accessToken = await ensureFreshTiktokToken(account);
    const info = await queryTiktokCreatorInfo(accessToken);

    if (info.creatorUsername && info.creatorUsername !== account.username) {
      await prisma.socialAccount.updateMany({
        where: { id: account.id, userId: user.id },
        data: { username: info.creatorUsername },
      });
    }

    return NextResponse.json({
      username: info.creatorUsername || account.username,
      nickname: info.creatorNickname,
      privacyLevelOptions: info.privacyLevelOptions,
      commentDisabled: info.commentDisabled,
      duetDisabled: info.duetDisabled,
      stitchDisabled: info.stitchDisabled,
      maxVideoPostDurationSec: info.maxVideoPostDurationSec,
    });
  } catch (error) {
    // Auth failures mean "reconnect", not a transient upstream error.
    const code = error instanceof TiktokApiError ? error.code : tiktokErrorCode(error);
    if (isTiktokAuthErrorCode(code)) {
      return NextResponse.json(
        { error: tiktokErrorMessage(error), code: "reconnect_required" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: tiktokErrorMessage(error) },
      { status: 502 }
    );
  }
}
