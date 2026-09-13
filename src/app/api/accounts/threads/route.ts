import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { ThreadsProvider } from "@/lib/social/threads";
import { recordDisconnect } from "@/lib/abuse";

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
        platform: "THREADS",
        ...(accountId ? { id: accountId } : {}),
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Threads account not connected" },
        { status: 404 }
      );
    }

    try {
      const threadsProvider = new ThreadsProvider();
      await threadsProvider.revokeToken();
    } catch {
      // Revocation is best-effort
    }

    // Abuse tombstone + signal release: the freed (platform, externalId)
    // pair stays remembered with its identity so re-linking by another user
    // inherits consumed value instead of minting fresh Free quota.
    await recordDisconnect({
      userId: user.id,
      platform: account.platform,
      externalId: account.externalId,
    });

    await prisma.socialAccount.delete({
      where: { id: account.id },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
