/**
 * One-off backfill: builds AbuseIdentity rows for pre-existing users.
 *
 * Idempotent and safe to re-run: every write is P2002-tolerant, merges
 * converge, and the identity Free ledger only ever floor-raises to the max
 * of the linked users' PostUsage — current access is never reduced.
 * Enforcement stays behind ABUSE_ENFORCEMENT (default: observe), so this
 * script only prepares data, it never blocks anyone.
 *
 * Usage (NEVER auto-run; an operator runs it once per environment AFTER
 * `prisma db push` with the abuse tables):
 *   node --import tsx --env-file-if-exists=.env scripts/backfill-abuse-identities.ts --dry-run
 *   node --import tsx --env-file-if-exists=.env scripts/backfill-abuse-identities.ts --execute
 *
 * Required environment:
 *   - DATABASE_URL_POSTGRES_PRISMA_URL (Prisma datasource)
 *   - ABUSE_HASH_PEPPER (same value as the app runtime)
 */

import { prisma } from "@/lib/prisma";
import {
  emailSignal,
  getAbusePepper,
  googleSignal,
  liveAbuseStores,
  resolveAbuseIdentity,
  socialSignal,
  syncIdentityFloor,
  type SignalInput,
} from "@/lib/abuse";
import { getMonthStart, getPeriodKey } from "@/lib/entitlements";

const BATCH = 200;

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  if (!execute) {
    console.log("dry-run: pass --execute to write. Nothing will be mutated.");
  }
  const pepper = getAbusePepper();
  const period = getPeriodKey();
  const monthStart = getMonthStart();
  let cursor: string | undefined;
  let users = 0;
  const identities = new Set<string>();
  for (;;) {
    const batch = await prisma.user.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        email: true,
        socialAccounts: { select: { platform: true, externalId: true } },
        authAccounts: {
          where: { providerId: "google" },
          select: { accountId: true },
        },
      },
    });
    if (batch.length === 0) break;
    for (const user of batch) {
      users += 1;
      const signals: SignalInput[] = [
        emailSignal(user.email, pepper),
        ...user.authAccounts.map((link) => googleSignal(link.accountId, pepper)),
        ...user.socialAccounts.map((account) =>
          socialSignal(account.platform, account.externalId, pepper)
        ),
      ];
      if (!execute) continue;
      const resolution = await resolveAbuseIdentity({
        userId: user.id,
        signals,
        stores: liveAbuseStores,
      });
      identities.add(resolution.identityId);
      await syncIdentityFloor({
        identityId: resolution.identityId,
        userIds: await liveAbuseStores.findUserIdsByIdentity(
          resolution.identityId
        ),
        period,
        monthStart,
        stores: liveAbuseStores,
      });
    }
    cursor = batch[batch.length - 1]?.id;
    console.log(`processed ${users} users (${identities.size} identities)`);
  }
  console.log(
    execute
      ? `done: ${users} users across ${identities.size} identities`
      : `dry-run complete: ${users} users would be linked`
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
