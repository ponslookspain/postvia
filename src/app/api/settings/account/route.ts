import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { XProvider } from "@/lib/social/x";
import { ThreadsProvider } from "@/lib/social/threads";
import { TiktokProvider } from "@/lib/social/tiktok";
import { InstagramProvider } from "@/lib/social/instagram";
import { deleteBlobs } from "@/lib/blob";
import { cancelStripeSubscriptionNow, getStripeClient } from "@/lib/stripe";
import {
  emailSignal,
  gateWriteRequest,
  getAbusePepper,
  googleSignal,
  socialSignal,
  WRITE_LIMIT_ACCOUNT_DELETE,
  type SignalInput,
} from "@/lib/abuse";
import { logDiagnostic, reportError } from "@/lib/diagnostics";
import { runAccountDeleteFlow } from "@/lib/delete-resources";
import { decryptToken } from "@/lib/social-token-crypto";

const CONFIRMATION_PHRASE = "delete";

export async function DELETE(request: NextRequest) {
  // Hoisted so the failure report below can name the user without re-reading
  // the session on an already-failing path.
  let userId: string | undefined;
  try {
    const user = await getApiUser();
    userId = user?.id;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Destructive + irreversible: persistent gate on top of session +
    // exact confirmation phrase, so a stolen-session burst cannot be
    // scripted into rapid re-creation/deletion loops.
    if (
      !(await gateWriteRequest({
        request,
        userId: user.id,
        scope: "account-delete",
        userMax: WRITE_LIMIT_ACCOUNT_DELETE,
      }))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
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

    // Explicit select. The access token IS needed here (remote revocation
    // below), but the refresh token and the rest of the row are not — the
    // narrower the credential surface on any given path, the fewer places a
    // future change can leak one.
    const accounts = await prisma.socialAccount.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        platform: true,
        externalId: true,
        accessToken: true,
      },
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

    // Billing durability: a Stripe subscription must never survive its user
    // as an orphan that keeps billing. Cancel immediately (the paid period
    // is non-refunded by default; nothing bills afterwards). This gate is
    // fail-closed: when the subscription cannot be confirmed canceled, the
    // wipe is blocked with 500 and the user retries — a Stripe outage may
    // delay deletion but can never orphan billing. Webhooks arriving after
    // a completed deletion resolve to no user and grant nothing.
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { status: true, stripeSubId: true },
      });
      if (subscription?.stripeSubId && subscription.status !== "CANCELED") {
        if (!process.env.STRIPE_SECRET_KEY?.trim()) {
          reportError("billing", "stripe cancel on account delete blocked: no key", undefined, {
            userId: user.id,
          });
          return NextResponse.json(
            { error: "Billing cancellation is unavailable. Try again later." },
            { status: 500 }
          );
        }
        const outcome = await cancelStripeSubscriptionNow({
          stripeSubId: subscription.stripeSubId,
          cancel: (id) => getStripeClient().subscriptions.cancel(id),
          getStatus: async (id) => {
            try {
              const sub = await getStripeClient().subscriptions.retrieve(id);
              return sub.status;
            } catch (error) {
              // Positively gone (deleted/missing) means no future billing;
              // anything else is unverifiable and must block the wipe.
              const statusCode = (error as { statusCode?: unknown })?.statusCode;
              const code = (error as { code?: unknown })?.code;
              if (statusCode === 404 || code === "resource_missing") return null;
              throw error;
            }
          },
        });
        if (outcome.outcome === "failed") {
          reportError("billing", "stripe cancel on account delete failed", outcome.error, {
            userId: user.id,
          });
          return NextResponse.json(
            { error: "Billing cancellation failed. Try again later." },
            { status: 500 }
          );
        }
      }
    } catch (error) {
      reportError("billing", "stripe cancel on account delete failed", error, {
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Billing cancellation failed. Try again later." },
        { status: 500 }
      );
    }

    // Best-effort remote revocation before local rows disappear (Threads
    // exposes no revoke endpoint — its call is an honest no-op).
    for (const account of accounts) {
      try {
        // Providers need the real token, so decrypt at the point of use.
        // A decryption failure is caught below like any other revocation
        // failure: best-effort revocation must never block the wipe.
        const token = decryptToken(account.accessToken);
        if (account.platform === "X") {
          await new XProvider().revokeToken(token);
        } else if (account.platform === "THREADS") {
          await new ThreadsProvider().revokeToken(token);
        } else if (account.platform === "TIKTOK") {
          await new TiktokProvider().revokeToken(token);
        } else if (account.platform === "INSTAGRAM") {
          await new InstagramProvider().revokeToken(token, account.externalId);
        }
      } catch {
        // Best-effort: revocation failure must not block account deletion
      }
    }

    // DB-first, matching the policy in delete-resources.ts. Deleting the
    // bytes before the transaction (the previous order) left the user alive
    // with Media rows pointing at bytes that no longer existed whenever the
    // transaction failed — unrecoverable. This way a failed transaction
    // removes nothing, and a failed blob delete leaves sweepable orphans.
    const outcome = await runAccountDeleteFlow({
      userId: user.id,
      mediaPathnames: mediaToDelete.map((m) => m.pathname),
      deleteAccountRows: async () => {
        await prisma.$transaction(
          async (tx) => {
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
          },
          {
            // A heavy account (many posts/targets) can exceed the 5s default
            // and abort mid-wipe. The work is all local DDL-free deletes, so
            // a longer ceiling is safe — and it now runs BEFORE any network
            // call, so no connection is parked on storage latency.
            timeout: 20_000,
            maxWait: 10_000,
          }
        );
      },
      deleteBlobs,
    });

    if (outcome.outcome === "failed") {
      // Nothing was removed; the account is intact and the user can retry.
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 }
      );
    }

    if (outcome.outcome === "deleted-with-orphans") {
      // The account IS gone — that is what the user asked for. The leftover
      // bytes carry no rows, so the capped orphan sweep reclaims them.
      // Already reported with context inside the flow.
      logDiagnostic("account", "account deleted with sweepable orphan blobs", {
        orphanCount: outcome.orphanPathnames.length,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never a bare catch: a silent 500 here once hid a real failure for the
    // most destructive operation in the product.
    reportError("account", "account delete failed", error, { userId });
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}