import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { XProvider } from "@/lib/social/x";

export async function DELETE() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const account = await prisma.socialAccount.findUnique({
      where: {
        userId_platform: {
          userId: user.id,
          platform: "X",
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "X account not connected" },
        { status: 404 }
      );
    }

    try {
      const xProvider = new XProvider();
      await xProvider.revokeToken(account.accessToken);
    } catch {
      // Revocation is best-effort
    }

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
