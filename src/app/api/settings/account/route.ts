import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { XProvider } from "@/lib/social/x";
import { ThreadsProvider } from "@/lib/social/threads";
import { deleteBlobs } from "@/lib/blob";
import {
  emailSignal,
  getAbusePepper,
  googleSignal,
  socialSignal,
  type SignalInput,
} from "@/lib/abuse";
import { reportError } from "@/lib/diagnostics";

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

    const googleLinks = await prisma.account.findMany({
      where: { userId: user.id, providerId: "google" },
      select: { accountId: true },
    });

    // Abuse tombstones: deleting the user frees the email and the social
    // bindings, but the hashed signals survive with the identity id so
    // re-registration and re-linking resolve to the same identity instead
    // of minting fresh Free value. Written atomically with the deletion.
    let tombstones: SignalInput[] = [];
    try {
      const pepper = getAbusePepper();
      tombstones = [
        ...(user.email ? [emailSignal(user.email, pepper)] : []),
        ...googleLinks.map((link) => googleSignal(link.accountId, pepper)),
        ...accounts.map((account) =>
          socialSignal(account.platform, account.externalId, pepper)
        ),
      ];
    } catch (error) {
      // Account deletion is a user right and must not fail because abuse
      // bookkeeping is unconfigured; the gap is logged for operators.
      reportError("abuse", "tombstone pepper missing at delete", error, {
        userId: user.id,
      });
    }
    const tombstoneIdentityId =
      await prisma.abuseIdentityLink
        .findUnique({
          where: { userId: user.id },
          select: { identityId: true },
        })
        .then((link) => link?.identityId ?? null)
        .catch(() => null);

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
      if (tombstones.length > 0) {
        await tx.abuseTombstone.createMany({
          data: tombstones.map((tomb) => ({
            kind: tomb.kind,
            valueHash: tomb.valueHash,
            identityId: tombstoneIdentityId,
          })),
          skipDuplicates: true,
        });
      }
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