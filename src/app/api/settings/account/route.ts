import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { XProvider } from "@/lib/social/x";
import { ThreadsProvider } from "@/lib/social/threads";
import { deleteBlobs } from "@/lib/blob";

const CONFIRMATION_PHRASE = "delete";

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const confirmation =
      typeof body?.confirmation === "string" ? body.confirmation : "";

    if (confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        { error: "Confirmation phrase is required" },
        { status: 400 }
      );
    }

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: user.id },
    });

    const mediaToDelete = await prisma.media.findMany({
      where: { userId: user.id },
      select: { pathname: true },
    });

    for (const account of accounts) {
      try {
        if (account.platform === "X") {
          await new XProvider().revokeToken(account.accessToken);
        } else if (account.platform === "THREADS") {
          await new ThreadsProvider().revokeToken();
        }
      } catch {
        // Best-effort: revocation failure must not block account deletion
      }
    }

    try {
      await deleteBlobs(mediaToDelete.map((m) => m.pathname));
    } catch {
      return NextResponse.json(
        { error: "Failed to delete media" },
        { status: 500 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.postTarget.deleteMany({
        where: { post: { userId: user.id } },
      });
      await tx.media.deleteMany({ where: { userId: user.id } });
      await tx.post.deleteMany({ where: { userId: user.id } });
      await tx.socialAccount.deleteMany({ where: { userId: user.id } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.account.deleteMany({ where: { userId: user.id } });
      await tx.userPreferences.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}