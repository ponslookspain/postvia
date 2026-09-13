/**
 * Safe cleanup of TEST users (Postvia OTP migration).
 *
 * Deletes every User EXCEPT protected accounts, with per-user verification
 * first. Abuse ledger (AbuseIdentity / AbuseSignal / AbuseTombstone /
 * AbuseFreeUsage) is NEVER deleted blindly:
 * - identity rows shared with a protected user are left fully intact and
 *   the test user linked to them is SKIPPED with a warning;
 * - identity-scoped rows are removed only for identities that become
 *   completely orphaned (zero remaining user links) after the delete.
 *
 * Protected (never deleted, never touched):
 * - ponslookdesign@gmail.com (admin, regular login must keep working)
 * - every address in ADMIN_EMAILS
 *
 * Usage:
 *   npm run cleanup:test-users:check                        # read-only verification
 *   npm run cleanup:test-users -- --email a@x.com --email b@y.com --confirm DELETE-TEST-USERS
 *   npm run cleanup:test-users -- --all-test --confirm DELETE-TEST-USERS
 *
 * --execute requires ALLOW_TEST_CLEANUP=1 in the environment plus the
 * --confirm phrase, so production can never be wiped by accident.
 */

import { PrismaClient } from "@prisma/client";

const ADMIN_PROTECTED_EMAIL = "ponslookdesign@gmail.com";

function protectedEmails(): Set<string> {
  const set = new Set<string>([ADMIN_PROTECTED_EMAIL.toLowerCase()]);
  const extra = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const e of extra) set.add(e);
  return set;
}

type Args = {
  check: boolean;
  execute: boolean;
  allTest: boolean;
  emails: string[];
  confirm: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { check: true, execute: false, allTest: false, emails: [], confirm: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") {
      out.execute = true;
      out.check = false;
    } else if (a === "--check") {
      out.check = true;
      out.execute = false;
    } else if (a === "--all-test") {
      out.allTest = true;
    } else if (a === "--email" && argv[i + 1]) {
      out.emails.push(argv[++i].toLowerCase());
    } else if (a === "--confirm" && argv[i + 1]) {
      out.confirm = argv[++i];
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const prisma = new PrismaClient();
  try {
    const dbInfo = await prisma.$queryRawUnsafe<{ db: string; user: string }[]>(
      "SELECT current_database() AS db, current_user AS user"
    );
    console.log(`Database: ${dbInfo[0]?.user} / ${dbInfo[0]?.db}`);

    const prot = protectedEmails();
    console.log(`Protected: ${[...prot].join(", ")}`);

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        onboardingCompleted: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true, stripeSubId: true } },
        authAccounts: { select: { providerId: true } },
        identityLink: { select: { identityId: true } },
        _count: { select: { posts: true, socialAccounts: true, media: true } },
      },
    });

    // Identity sharing map: identityId -> linked user emails.
    const links = await prisma.abuseIdentityLink.findMany({
      select: { identityId: true, user: { select: { email: true } } },
    });
    const identityUsers = new Map<string, string[]>();
    for (const l of links) {
      const arr = identityUsers.get(l.identityId) ?? [];
      arr.push(l.user.email.toLowerCase());
      identityUsers.set(l.identityId, arr);
    }

    console.log("");
    console.log("Users (read-only verification):");
    for (const u of users) {
      const isProt = prot.has(u.email.toLowerCase());
      const sharedWithProtected =
        u.identityLink != null &&
        (identityUsers.get(u.identityLink.identityId) ?? []).some(
          (e) => prot.has(e) && e !== u.email.toLowerCase()
        );
      console.log(
        `  ${isProt ? "[PROTECTED]" : sharedWithProtected ? "[SHARED-IDENTITY]" : "[test]     "} ` +
          `${u.email} id=${u.id} verified=${u.emailVerified} onboarding=${u.onboardingCompleted} ` +
          `providers=${u.authAccounts.map((a) => a.providerId).join(",") || "none"} ` +
          `sub=${u.subscription ? `${u.subscription.plan}/${u.subscription.status}` : "none"} ` +
          `posts=${u._count.posts} social=${u._count.socialAccounts} media=${u._count.media}`
      );
    }

    const targets = args.allTest
      ? users.filter((u) => !prot.has(u.email.toLowerCase()))
      : users.filter((u) => args.emails.includes(u.email.toLowerCase()));

    if (!args.allTest && args.emails.length === 0) {
      console.log("");
      console.log("No targets selected. Use --all-test or --email <addr>.");
      return;
    }

    // Safety: refuse protected, paid-stake, media-owning, shared-identity.
    const deletable: typeof users = [];
    console.log("");
    for (const u of targets) {
      const email = u.email.toLowerCase();
      if (prot.has(email)) {
        console.log(`  SKIP ${u.email}: protected account, never deleted.`);
        continue;
      }
      if (u.subscription?.stripeSubId && u.subscription.status !== "CANCELED") {
        console.log(`  SKIP ${u.email}: live billing stake, handle manually.`);
        continue;
      }
      if (u._count.media > 0) {
        console.log(`  SKIP ${u.email}: owns ${u._count.media} media row(s), handle blobs manually.`);
        continue;
      }
      const shared =
        u.identityLink != null &&
        (identityUsers.get(u.identityLink.identityId) ?? []).some(
          (e) => prot.has(e) && e !== email
        );
      if (shared) {
        console.log(`  SKIP ${u.email}: identity shared with a protected user, ledger preserved.`);
        continue;
      }
      deletable.push(u);
    }

    console.log("");
    console.log(
      `Would delete ${deletable.length} user(s): ${deletable.map((u) => u.email).join(", ") || "none"}`
    );

    if (args.check || !args.execute) {
      console.log("DRY RUN -- nothing was changed.");
      return;
    }

    if (process.env.ALLOW_TEST_CLEANUP !== "1") {
      console.error("Refusing: set ALLOW_TEST_CLEANUP=1 to execute.");
      process.exitCode = 1;
      return;
    }
    if (args.confirm !== "DELETE-TEST-USERS") {
      console.error("Refusing: pass --confirm DELETE-TEST-USERS to execute.");
      process.exitCode = 1;
      return;
    }

    for (const u of deletable) {
      const identityId = u.identityLink?.identityId ?? null;
      await prisma.$transaction(async (tx) => {
        await tx.postTarget.deleteMany({
          where: { post: { userId: u.id } },
        });
        await tx.post.deleteMany({ where: { userId: u.id } });
        await tx.socialAccount.deleteMany({ where: { userId: u.id } });
        await tx.session.deleteMany({ where: { userId: u.id } });
        await tx.account.deleteMany({ where: { userId: u.id } });
        await tx.userPreferences.deleteMany({ where: { userId: u.id } });
        await tx.postUsage.deleteMany({ where: { userId: u.id } });
        // AbuseIdentityLink cascades with the user row. Identity, signals,
        // tombstones and Free usage survive unless orphaned (below).
        await tx.user.delete({ where: { id: u.id } });

        if (identityId) {
          const remaining = await tx.abuseIdentityLink.count({
            where: { identityId },
          });
          if (remaining === 0) {
            // Orphaned test identity: safe to remove its scoped rows so a
            // future re-registration starts from a clean test slate.
            await tx.abuseSignal.deleteMany({ where: { identityId } });
            await tx.abuseFreeUsage.deleteMany({ where: { identityId } });
            await tx.abuseTombstone.deleteMany({ where: { identityId } });
            await tx.abuseIdentity.deleteMany({ where: { id: identityId } });
            console.log(`  deleted orphaned identity ${identityId} scoped rows`);
          } else {
            console.log(
              `  kept identity ${identityId}: still linked to ${remaining} user(s)`
            );
          }
        }
      });
      console.log(`  deleted ${u.email}`);
    }
    console.log("Cleanup complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exitCode = 1;
});
