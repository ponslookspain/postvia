import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { findDisconnectTarget } from "@/lib/social-accounts";
import { XProvider } from "@/lib/social/x";
import { recordDisconnect } from "@/lib/abuse";

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const lookup = await findDisconnectTarget({
      userId: user.id,
      platform: "X",
      accountId: request.nextUrl.searchParams.get("accountId"),
    });
    if (!lookup.ok) {
      return NextResponse.json(
        {
          error:
            lookup.code === "accountId_required"
              ? "accountId is required"
              : "X account not connected",
        },
        { status: lookup.code === "accountId_required" ? 400 : 404 }
      );
    }
    const account = lookup;

    try {
      const xProvider = new XProvider();
      await xProvider.revokeToken(account.accessToken);
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
