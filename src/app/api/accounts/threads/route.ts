import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { findDisconnectTarget } from "@/lib/social-accounts";
import { ThreadsProvider } from "@/lib/social/threads";
import { recordDisconnect } from "@/lib/abuse";

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const lookup = await findDisconnectTarget({
      userId: user.id,
      platform: "THREADS",
      accountId: request.nextUrl.searchParams.get("accountId"),
    });
    if (!lookup.ok) {
      return NextResponse.json(
        {
          error:
            lookup.code === "accountId_required"
              ? "accountId is required"
              : "Threads account not connected",
        },
        { status: lookup.code === "accountId_required" ? 400 : 404 }
      );
    }
    const account = lookup;

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

    // Atomic ownership: the delete itself is scoped to this user's row
    // instead of trusting the earlier lookup alone.
    const deleted = await prisma.socialAccount.deleteMany({
      where: { id: account.id, userId: user.id },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: "Threads account not connected" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
