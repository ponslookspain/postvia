import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { revokeInstagramToken } from "@/lib/social/instagram";

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId");
    const account = await prisma.socialAccount.findFirst({
      where: {
        userId: user.id,
        platform: "INSTAGRAM",
        ...(accountId ? { id: accountId } : {}),
      },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Instagram account not connected" },
        { status: 404 }
      );
    }
    try {
      await revokeInstagramToken(account.externalId, account.accessToken);
    } catch {
      // Best-effort revoke; local disconnect always proceeds.
    }
    await prisma.socialAccount.delete({ where: { id: account.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
