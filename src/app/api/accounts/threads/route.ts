import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { ThreadsProvider } from "@/lib/social/threads";

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
          platform: "THREADS",
        },
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