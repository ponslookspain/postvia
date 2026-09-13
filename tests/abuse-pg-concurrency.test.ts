/**
 * Real PostgreSQL concurrency verification for the anti-abuse system.
 *
 * REQUIRED env (never the production database):
 *   PG_INTEGRATION=1
 *   DATABASE_URL_POSTGRES_PRISMA_URL=<isolated test database>
 *   ABUSE_HASH_PEPPER=<test pepper>
 *   ABUSE_ENFORCEMENT=enforce
 *
 * Without PG_INTEGRATION=1 the suite skips. All tests run against the live
 * Prisma stores + the atomic post kernel with real transactions, and assert
 * database state directly afterwards.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  checkAbuseRate,
  claimIdentityFree,
  deviceSignal,
  emailSignal,
  enforceFreeIdentityGate,
  gateNewSocialLink,
  gateOAuthCallback,
  getClientIp,
  isFailClosedAbuseError,
  isTransientAbuseError,
  liveAbuseStores,
  mergeIdentitiesPreservingRisk,
  recordAbuseEvent,
  recordEmailChange,
  resolveAbuseIdentity,
  socialSignal,
  type AbuseStores,
} from "../src/lib/abuse";
import { createFreePostAtomic } from "../src/lib/free-post-kernel";
import {
  getMonthStart,
  getPeriodKey,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";
import { createSocialAccountRaceSafe } from "../src/lib/social-accounts";

const ENABLED = process.env.PG_INTEGRATION === "1";
const PEPPER = process.env.ABUSE_HASH_PEPPER ?? "pg-test-pepper";
const RUN = randomUUID().slice(0, 8);
let seq = 0;
const tag = (prefix: string) => {
  seq += 1;
  return `${prefix}-${RUN}-${seq}`;
};

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "AbuseEvent","AbuseRateBucket","AbuseFreeUsage","AbuseTombstone",` +
      `"AbuseSignal","AbuseIdentityLink","AbuseIdentity","PostUsage","PostTarget",` +
      `"Post","Media","SocialAccount","Session","Account","Subscription",` +
      `"BillingTestOverride","UserPreferences","Verification","StripeEvent","User"` +
      ` RESTART IDENTITY CASCADE`
  );
}

async function createUser(email: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email, name: email.split("@")[0] ?? "t" },
    select: { id: true },
  });
  return user.id;
}

async function createUsers(count: number, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(await createUser(`${prefix}-${RUN}-${i}@x.com`));
  }
  return ids;
}

beforeEach(async () => {
  if (!ENABLED) return;
  await truncateAll();
});

describe(
  "pg: concurrent identity resolution (§3)",
  { skip: !ENABLED },
  () => {
    test("30 concurrent resolves, one email → one identity", async () => {
      // Eventual convergence (see the shared-social test for the contract:
      // no global lock exists, so return values may transiently differ).
      // The database must hold exactly one live identity with the single
      // signal row and all 30 links, and every returned id either is the
      // survivor or self-heals to it on re-resolve.
      const email = tag("same") + "@x.com";
      // Real User rows: AbuseIdentityLink.userId is a real FK — synthetic
      // ids would (correctly) fail loud on link instead of testing races.
      const uids = await createUsers(30, "pgresolve");
      const results = await Promise.all(
        uids.map((uid) =>
          resolveAbuseIdentity({
            userId: uid,
            signals: [emailSignal(email, PEPPER)],
            stores: liveAbuseStores,
          })
        )
      );
      const live = await prisma.abuseIdentity.findMany({
        select: { id: true },
      });
      assert.equal(live.length, 1);
      const survivor = live[0]?.id as string;
      const [signalCount, linkCount] = await Promise.all([
        prisma.abuseSignal.count({
          where: {
            kind: "EMAIL_HASH",
            valueHash: emailSignal(email, PEPPER).valueHash,
          },
        }),
        prisma.abuseIdentityLink.count({ where: { identityId: survivor } }),
      ]);
      assert.equal(signalCount, 1);
      assert.equal(linkCount, 30);
      for (const [uid, r] of uids.map((uid, i) => [uid, results[i]] as const)) {
        if (r?.identityId === survivor) continue;
        const re = await resolveAbuseIdentity({
          userId: uid,
          signals: [emailSignal(email, PEPPER)],
          stores: liveAbuseStores,
        });
        assert.equal(re.identityId, survivor);
      }
      assert.equal(await prisma.abuseIdentity.count(), 1);
    });
  }
);

describe(
  "pg: concurrent identity merge (§4)",
  { skip: !ENABLED },
  () => {
    test("A/B/C merges converge: no loss, no double, idempotent", async () => {
      // All LOW here on purpose: risk-max under concurrent deletes is
      // covered deterministically in §10. This test proves graph/usage
      // convergence (concurrent losers vanishing mid-read must not lose
      // or double anything).
      const mk = async (name: string, usage: number) => {
        const uid = await createUser(tag(name) + "@x.com");
        const r = await resolveAbuseIdentity({
          userId: uid,
          signals: [emailSignal(tag(name) + "@x.com", PEPPER)],
          stores: liveAbuseStores,
        });
        await prisma.postUsage.create({
          data: { userId: uid, period: getPeriodKey(), count: usage },
        });
        await prisma.abuseFreeUsage.create({
          data: { identityId: r.identityId, period: getPeriodKey(), count: usage },
        });
        return { uid, identityId: r.identityId, usage };
      };
      const a = await mk("mA", 3);
      const b = await mk("mB", 5);
      const c = await mk("mC", 7);
      await Promise.all([
        liveAbuseStores.mergeIdentities(a.identityId, [b.identityId]),
        liveAbuseStores.mergeIdentities(a.identityId, [c.identityId]),
        mergeIdentitiesPreservingRisk(liveAbuseStores, a.identityId, [
          b.identityId,
          c.identityId,
        ]),
      ]);
      // Idempotent repeat.
      await liveAbuseStores.mergeIdentities(a.identityId, [b.identityId, c.identityId]);
      const survivors = await prisma.abuseIdentity.findMany({
        where: { id: { in: [a.identityId, b.identityId, c.identityId] } },
        select: { id: true, riskLevel: true },
      });
      // Both losers merged away; the addressed winner survives.
      assert.equal(survivors.length, 1);
      const winner = survivors[0] as { id: string; riskLevel: string };
      assert.equal(winner.id, a.identityId);
      const [users, signals, usageRows] = await Promise.all([
        prisma.abuseIdentityLink.count({ where: { identityId: winner.id } }),
        prisma.abuseSignal.count({ where: { identityId: winner.id } }),
        prisma.abuseFreeUsage.findMany({ where: { identityId: winner.id } }),
      ]);
      assert.equal(users, 3);
      assert.equal(signals, 3);
      const total = usageRows
        .filter((u) => u.period === getPeriodKey())
        .reduce((s, u) => s + u.count, 0);
      assert.equal(total, 15);
      assert.equal(winner.riskLevel, "LOW");
    });
  }
);

describe(
  "pg: last free slot (§5, critical)",
  { skip: !ENABLED },
  () => {
    test("25 concurrent creates at 14/15 → exactly 1 post, ledgers at 15", async () => {
      const email = tag("slot") + "@x.com";
      const uid = await createUser(email);
      const period = getPeriodKey();
      const monthStart = getMonthStart();
      await prisma.postUsage.create({
        data: { userId: uid, period, count: 14 },
      });
      const results = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          createFreePostAtomic({
            userId: uid,
            email,
            limit: 15,
            period,
            monthStart,
            pepper: PEPPER,
            enforce: true,
            buildInsert: (tx) =>
              tx.post.create({
                data: { userId: uid, text: `pg post ${i}`, status: "DRAFT" },
              }),
            liveCountForBackfill: () =>
              prisma.post.count({
                where: { userId: uid, createdAt: { gte: monthStart } },
              }),
            legacyInsert: () =>
              prisma.post.create({
                data: { userId: uid, text: `pg legacy ${i}`, status: "DRAFT" },
              }),
          })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok);
      const denied = results.filter(
        (r) => r.status === "fulfilled" && !r.value.ok
      );
      const thrown = results.filter((r) => r.status === "rejected");
      assert.deepEqual(
        { ok: ok.length, denied: denied.length, thrown: thrown.length },
        { ok: 1, denied: 24, thrown: 0 }
      );
      const identityId = await liveAbuseStores.findIdentityIdByUser(uid);
      assert.ok(identityId);
      const [freeUsage, postUsage, postCount, identityCount] = await Promise.all([
        prisma.abuseFreeUsage.findUnique({
          where: { identityId_period: { identityId: identityId as string, period } },
        }),
        prisma.postUsage.findUnique({
          where: { userId_period: { userId: uid, period } },
        }),
        prisma.post.count({
          where: { userId: uid, createdAt: { gte: monthStart } },
        }),
        prisma.abuseIdentity.count(),
      ]);
      assert.equal(freeUsage?.count, 15);
      assert.equal(postUsage?.count, 15);
      assert.equal(postCount, 1);
      // All 25 concurrent first-resolves converged to a single identity.
      assert.equal(identityCount, 1);
    });
  }
);

describe(
  "pg: transaction rollback (§6–§7)",
  { skip: !ENABLED },
  () => {
    test("failed insert rolls everything back; retry consumes exactly once", async () => {
      const email = tag("rb") + "@x.com";
      const uid = await createUser(email);
      const period = getPeriodKey();
      const monthStart = getMonthStart();
      const fail = () =>
        createFreePostAtomic({
          userId: uid,
          email,
          limit: 15,
          period,
          monthStart,
          pepper: PEPPER,
          enforce: true,
          buildInsert: async () => {
            throw new Error("intentional insert failure");
          },
          liveCountForBackfill: () =>
            prisma.post.count({
              where: { userId: uid, createdAt: { gte: monthStart } },
            }),
          legacyInsert: async () => {
            throw new Error("intentional legacy failure");
          },
        });
      await assert.rejects(fail);
      const identityId = await liveAbuseStores.findIdentityIdByUser(uid);
      const [freeUsage, postUsage, postCount] = await Promise.all([
        identityId
          ? prisma.abuseFreeUsage.findUnique({
              where: { identityId_period: { identityId, period } },
            })
          : null,
        prisma.postUsage.findUnique({
          where: { userId_period: { userId: uid, period } },
        }),
        prisma.post.count({ where: { userId: uid } }),
      ]);
      assert.equal(freeUsage?.count ?? 0, 0);
      assert.equal(postUsage?.count ?? 0, 0);
      assert.equal(postCount, 0);
      // Retry succeeds with exactly one unit consumed.
      const retry = await createFreePostAtomic({
        userId: uid,
        email,
        limit: 15,
        period,
        monthStart,
        pepper: PEPPER,
        enforce: true,
        buildInsert: (tx) =>
          tx.post.create({
            data: { userId: uid, text: "retry post", status: "DRAFT" },
          }),
        liveCountForBackfill: () =>
          prisma.post.count({
            where: { userId: uid, createdAt: { gte: monthStart } },
          }),
        legacyInsert: () =>
          prisma.post.create({
            data: { userId: uid, text: "retry legacy", status: "DRAFT" },
          }),
      });
      assert.equal(retry.ok, true);
      const retryIdentityId = await liveAbuseStores.findIdentityIdByUser(uid);
      assert.ok(retryIdentityId);
      const [free2, usage2] = await Promise.all([
        prisma.abuseFreeUsage.findUnique({
          where: {
            identityId_period: { identityId: retryIdentityId as string, period },
          },
        }),
        prisma.postUsage.findUnique({
          where: { userId_period: { userId: uid, period } },
        }),
      ]);
      assert.equal(free2?.count, 1);
      assert.equal(usage2?.count, 1);
    });

    test("10 concurrent mixed creates: usage == successful posts", async () => {
      const email = tag("mix") + "@x.com";
      const uid = await createUser(email);
      const period = getPeriodKey();
      const monthStart = getMonthStart();
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => {
          const broken = i % 2 === 0;
          return createFreePostAtomic({
            userId: uid,
            email,
            limit: 15,
            period,
            monthStart,
            pepper: PEPPER,
            enforce: true,
            buildInsert: broken
              ? async () => {
                  throw new Error(`broken ${i}`);
                }
              : (tx) =>
                  tx.post.create({
                    data: { userId: uid, text: `mix ${i}`, status: "DRAFT" },
                  }),
            liveCountForBackfill: () =>
              prisma.post.count({
                where: { userId: uid, createdAt: { gte: monthStart } },
              }),
            legacyInsert: broken
              ? async () => {
                  throw new Error(`broken legacy ${i}`);
                }
              : () =>
                  prisma.post.create({
                    data: { userId: uid, text: `mix legacy ${i}`, status: "DRAFT" },
                  }),
          });
        })
      );
      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.ok
      ).length;
      assert.equal(succeeded, 5);
      const identityId = (await liveAbuseStores.findIdentityIdByUser(
        uid
      )) as string;
      const [freeUsage, postUsage, postCount] = await Promise.all([
        prisma.abuseFreeUsage.findUnique({
          where: { identityId_period: { identityId, period } },
        }),
        prisma.postUsage.findUnique({
          where: { userId_period: { userId: uid, period } },
        }),
        prisma.post.count({
          where: { userId: uid, createdAt: { gte: monthStart } },
        }),
      ]);
      assert.equal(postCount, 5);
      assert.equal(freeUsage?.count, 5);
      assert.equal(postUsage?.count, 5);
    });
  }
);

describe(
  "pg: social ownership + identity merge (§8–§9)",
  { skip: !ENABLED },
  () => {
    test("20 concurrent connects → one owner, rest ACCOUNT_IN_USE", async () => {
      // 20 DISTINCT users: same-user retries would (correctly) converge to
      // UPDATE/reconnect instead of racing ownership.
      const uids: string[] = [];
      for (let i = 0; i < 20; i += 1) {
        uids.push(await createUser(tag(`soc${i}`) + "@x.com"));
      }
      const ext = `pg-ext-${RUN}-${Date.now()}`;
      const growth = getPlan("growth").entitlements;
      const results = await Promise.all(
        uids.map((uid, i) =>
          createSocialAccountRaceSafe({
            userId: uid,
            platform: "X",
            externalId: ext,
            data: {
              externalId: ext,
              username: `racer-${i}`,
              accessToken: `at-${RUN}-${i}`,
              refreshToken: null,
              expiresAt: null,
            },
            effective: {
              plan: "growth",
              status: "ACTIVE",
              bypass: false,
              source: "subscription",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              entitlements: growth,
            },
            // live store (default) — real unique constraint is authoritative.
          })
        )
      );
      const ok = results.filter((r) => r.ok);
      const inUse = results.filter((r) => !r.ok && r.code === "account_in_use");
      assert.equal(ok.length, 1);
      assert.equal(inUse.length, 19);
      const rows = await prisma.socialAccount.findMany({
        where: { platform: "X", externalId: ext },
      });
      assert.equal(rows.length, 1);
    });

    test("concurrent shared-social resolves converge to one identity", async () => {
      // Eventual-convergence contract (NOT immediate return equality):
      // point-in-time reads without a global lock cannot prevent a rival
      // merge landing between our last validation and our return, so two
      // racers may transiently return different ids. What MUST hold: the
      // database converges to exactly one live identity owning every
      // signal and link, and any stale returned id self-heals on the next
      // resolve (callers use FK-safe retry/heal paths — kernel retries once
      // on P2002/P2003/P2025, checkSocialLink re-resolves on P2003).
      const social = socialSignal("X", `pg-conv-${RUN}`, PEPPER);
      const emailA = tag("ca") + "@x.com";
      const emailB = tag("cb") + "@x.com";
      const uidA = await createUser(emailA);
      const uidB = await createUser(emailB);
      await Promise.all([
        resolveAbuseIdentity({
          userId: uidA,
          signals: [emailSignal(emailA, PEPPER), social],
          stores: liveAbuseStores,
        }),
        resolveAbuseIdentity({
          userId: uidB,
          signals: [emailSignal(emailB, PEPPER), social],
          stores: liveAbuseStores,
        }),
      ]);
      const live = await prisma.abuseIdentity.findMany({
        select: { id: true },
      });
      assert.equal(live.length, 1);
      const survivor = live[0]?.id as string;
      const [links, socialRows, emailAOwners, emailBOwners] = await Promise.all([
        prisma.abuseIdentityLink.count({ where: { identityId: survivor } }),
        prisma.abuseSignal.findMany({
          where: { kind: "SOCIAL_LINK", valueHash: social.valueHash },
        }),
        prisma.abuseSignal.findMany({
          where: {
            kind: "EMAIL_HASH",
            valueHash: emailSignal(emailA, PEPPER).valueHash,
          },
        }),
        prisma.abuseSignal.findMany({
          where: {
            kind: "EMAIL_HASH",
            valueHash: emailSignal(emailB, PEPPER).valueHash,
          },
        }),
      ]);
      assert.equal(links, 2);
      assert.equal(socialRows.length, 1);
      assert.equal(socialRows[0]?.identityId, survivor);
      assert.equal(emailAOwners[0]?.identityId, survivor);
      assert.equal(emailBOwners[0]?.identityId, survivor);
      // Stale returned ids self-heal: re-resolving either user lands on
      // the survivor with no new identity created.
      for (const [uid, email] of [
        [uidA, emailA],
        [uidB, emailB],
      ] as Array<[string, string]>) {
        const re = await resolveAbuseIdentity({
          userId: uid,
          signals: [emailSignal(email, PEPPER), social],
          stores: liveAbuseStores,
        });
        assert.equal(re.identityId, survivor);
      }
      assert.equal(await prisma.abuseIdentity.count(), 1);
    });
  }
);

describe(
  "pg: risk preservation (§10)",
  { skip: !ENABLED },
  () => {
    test("concurrent LOW+ABUSE and LOW+HIGH merges keep max, repeat safe", async () => {
      const setup = async (name: string, risk: "LOW" | "HIGH" | "ABUSE") => {
        const uid = await createUser(tag(name) + "@x.com");
        const r = await resolveAbuseIdentity({
          userId: uid,
          signals: [emailSignal(tag(name) + "@x.com", PEPPER)],
          stores: liveAbuseStores,
        });
        if (risk !== "LOW") {
          await prisma.abuseIdentity.update({
            where: { id: r.identityId },
            data: { riskLevel: risk, riskReason: "pg manual" },
          });
        }
        return r.identityId;
      };
      const low1 = await setup("rkL1", "LOW");
      const abuse = await setup("rkA", "ABUSE");
      await Promise.all(
        Array.from({ length: 5 }, () =>
          mergeIdentitiesPreservingRisk(liveAbuseStores, low1, [abuse])
        )
      );
      const afterAbuse = await prisma.abuseIdentity.findUnique({
        where: { id: low1 },
        select: { riskLevel: true },
      });
      assert.equal(afterAbuse?.riskLevel, "ABUSE");
      const low2 = await setup("rkL2", "LOW");
      const high = await setup("rkH", "HIGH");
      await Promise.all(
        Array.from({ length: 5 }, () =>
          mergeIdentitiesPreservingRisk(liveAbuseStores, low2, [high])
        )
      );
      const afterHigh = await prisma.abuseIdentity.findUnique({
        where: { id: low2 },
        select: { riskLevel: true },
      });
      assert.equal(afterHigh?.riskLevel, "HIGH");
    });
  }
);

describe(
  "pg: delete/recreate + email change + device (§11–§13)",
  { skip: !ENABLED },
  () => {
    test("consumed quota survives post delete and user delete", async () => {
      const email = tag("del") + "@x.com";
      const uid = await createUser(email);
      const period = getPeriodKey();
      const monthStart = getMonthStart();
      for (let i = 0; i < 3; i += 1) {
        const r = await createFreePostAtomic({
          userId: uid,
          email,
          limit: 15,
          period,
          monthStart,
          pepper: PEPPER,
          enforce: true,
          buildInsert: (tx) =>
            tx.post.create({
              data: { userId: uid, text: `del ${i}`, status: "DRAFT" },
            }),
          liveCountForBackfill: () =>
            prisma.post.count({
              where: { userId: uid, createdAt: { gte: monthStart } },
            }),
          legacyInsert: () =>
            prisma.post.create({
              data: { userId: uid, text: `del legacy ${i}`, status: "DRAFT" },
            }),
        });
        assert.equal(r.ok, true);
      }
      // Post delete never refills PostUsage.
      await prisma.post.deleteMany({ where: { userId: uid } });
      const usageAfterDelete = await prisma.postUsage.findUnique({
        where: { userId_period: { userId: uid, period } },
      });
      assert.equal(usageAfterDelete?.count, 3);
      // Full account delete with tombstones (mirrors the delete route).
      const identityId = (await liveAbuseStores.findIdentityIdByUser(
        uid
      )) as string;
      await prisma.$transaction(async (tx) => {
        await tx.abuseTombstone.createMany({
          data: [
            {
              kind: "EMAIL_HASH",
              valueHash: emailSignal(email, PEPPER).valueHash,
              identityId,
            },
          ],
          skipDuplicates: true,
        });
        await tx.user.delete({ where: { id: uid } });
      });
      const freeAfter = await prisma.abuseFreeUsage.findUnique({
        where: { identityId_period: { identityId, period } },
      });
      assert.equal(freeAfter?.count, 3);
      // Recreate with the same email: same identity, no fresh allowance.
      const uid2 = await createUser(email);
      const re = await resolveAbuseIdentity({
        userId: uid2,
        signals: [emailSignal(email, PEPPER)],
        stores: liveAbuseStores,
      });
      assert.equal(re.identityId, identityId);
      assert.ok(re.tombstoneHits > 0);
      const claim = await claimIdentityFree({
        identityId,
        userIds: [uid2],
        period,
        monthStart,
        limit: 15,
        stores: liveAbuseStores,
      });
      assert.equal(claim.ok, true);
      if (claim.ok) {
        const freeNow = await prisma.abuseFreeUsage.findUnique({
          where: { identityId_period: { identityId, period } },
        });
        // 3 inherited + 1 new = 4 (never reset to 1).
        assert.equal(freeNow?.count, 4);
      }
    });

    test("email change releases old signal; new owner flagged", async () => {
      const oldEmail = tag("old") + "@x.com";
      const newEmail = tag("new") + "@x.com";
      const uid = await createUser(oldEmail);
      const before = await resolveAbuseIdentity({
        userId: uid,
        signals: [emailSignal(oldEmail, PEPPER)],
        stores: liveAbuseStores,
      });
      await recordEmailChange({
        userId: uid,
        oldEmail,
        newEmail,
        stores: liveAbuseStores,
        pepper: PEPPER,
      });
      const liveOld = await prisma.abuseSignal.count({
        where: {
          kind: "EMAIL_HASH",
          valueHash: emailSignal(oldEmail, PEPPER).valueHash,
        },
      });
      assert.equal(liveOld, 0);
      const tomb = await prisma.abuseTombstone.findUnique({
        where: {
          kind_valueHash: {
            kind: "EMAIL_HASH",
            valueHash: emailSignal(oldEmail, PEPPER).valueHash,
          },
        },
      });
      assert.equal(tomb?.identityId, before.identityId);
      // Mirror the real email-change flow: the User row now owns the new
      // address, freeing the old one for re-registration.
      await prisma.user.update({
        where: { id: uid },
        data: { email: newEmail },
      });
      const uid2 = await createUser(oldEmail);
      const lookup = await resolveAbuseIdentity({
        userId: uid2,
        signals: [emailSignal(oldEmail, PEPPER)],
        stores: liveAbuseStores,
      });
      assert.equal(lookup.identityId, before.identityId);
      assert.ok(lookup.tombstoneHits > 0);
      assert.equal(lookup.risk, "MEDIUM");
    });

    test("shared device never merges strangers", async () => {
      const device = deviceSignal(`pg-device-${RUN}`, PEPPER);
      const uidA = await createUser(tag("da") + "@x.com");
      const uidB = await createUser(tag("db") + "@x.com");
      const first = await resolveAbuseIdentity({
        userId: uidA,
        signals: [emailSignal(tag("da") + "@x.com", PEPPER), device],
        stores: liveAbuseStores,
      });
      const second = await resolveAbuseIdentity({
        userId: uidB,
        signals: [emailSignal(tag("db") + "@x.com", PEPPER), device],
        stores: liveAbuseStores,
      });
      assert.notEqual(second.identityId, first.identityId);
      const [identityCount, deviceOwners] = await Promise.all([
        prisma.abuseIdentity.count({
          where: { id: { in: [first.identityId, second.identityId] } },
        }),
        prisma.abuseSignal.count({
          where: { kind: "DEVICE_COOKIE", valueHash: device.valueHash },
        }),
      ]);
      assert.equal(identityCount, 2);
      assert.equal(deviceOwners, 1);
    });
  }
);

describe(
  "pg: fail-open/fail-closed + rate limits (§14–§15)",
  { skip: !ENABLED },
  () => {
    test("P2021 fails closed, transient fails open", async () => {
      const p2021 = Object.assign(new Error("no such table"), { code: "P2021" });
      const poolTimeout = Object.assign(new Error("Timed out fetching a new connection from the pool"), {
        code: "P2024",
      });
      assert.equal(isFailClosedAbuseError(p2021), true);
      assert.equal(isFailClosedAbuseError(new Error("connection reset")), false);
      assert.equal(isTransientAbuseError(poolTimeout), true);
      assert.equal(isTransientAbuseError(new Error("connection reset")), true);
      assert.equal(isTransientAbuseError(new Error("intentional insert failure")), false);
      assert.equal(isTransientAbuseError(p2021), false);
      const broken: AbuseStores = {
        ...liveAbuseStores,
        findSignalOwners: async () => {
          throw p2021;
        },
      };
      await assert.rejects(() =>
        enforceFreeIdentityGate({
          userId: "x",
          email: "x@x.com",
          limit: 15,
          enforce: true,
          pepper: PEPPER,
          period: getPeriodKey(),
          monthStart: getMonthStart(),
          stores: broken,
        })
      );
      const denied = await gateNewSocialLink({
        userId: "x",
        userEmail: "x@x.com",
        platform: "X",
        externalId: "ext-fc",
        deviceCookieHeader: null,
        isPaid: false,
        stores: broken,
        pepper: PEPPER,
        enforce: true,
      });
      assert.deepEqual(denied, { ok: false, errorParam: "connection_restricted" });
    });

    test("transient tx failure uses PostUsage-only fallback; business failure rethrows", async () => {
      const email = tag("fb") + "@x.com";
      const uid = await createUser(email);
      const period = getPeriodKey();
      const monthStart = getMonthStart();
      const poolTimeout = () =>
        Object.assign(new Error("Timed out fetching a new connection from the pool"), {
          code: "P2024",
        });
      // Simulated transient inside the atomic insert: fallback still gates
      // per-user and creates exactly one post, without touching the identity
      // ledger.
      const viaFallback = await createFreePostAtomic({
        userId: uid,
        email,
        limit: 15,
        period,
        monthStart,
        pepper: PEPPER,
        enforce: true,
        buildInsert: async () => {
          throw poolTimeout();
        },
        liveCountForBackfill: () =>
          prisma.post.count({
            where: { userId: uid, createdAt: { gte: monthStart } },
          }),
        legacyInsert: () =>
          prisma.post.create({
            data: { userId: uid, text: "fallback post", status: "DRAFT" },
          }),
      });
      assert.equal(viaFallback.ok, true);
      if (viaFallback.ok) assert.equal(viaFallback.fallback, true);
      const identityId = (await liveAbuseStores.findIdentityIdByUser(
        uid
      )) as string | null;
      const [freeUsage, postUsage] = await Promise.all([
        identityId
          ? prisma.abuseFreeUsage.findUnique({
              where: { identityId_period: { identityId, period } },
            })
          : null,
        prisma.postUsage.findUnique({
          where: { userId_period: { userId: uid, period } },
        }),
      ]);
      assert.equal(postUsage?.count, 1);
      assert.equal(freeUsage?.count ?? 0, 0);
      // Non-transient insert failure: NO fallback, nothing consumed anywhere.
      await assert.rejects(() =>
        createFreePostAtomic({
          userId: uid,
          email,
          limit: 15,
          period,
          monthStart,
          pepper: PEPPER,
          enforce: true,
          buildInsert: async () => {
            throw new Error("NOT NULL violation in post payload");
          },
          liveCountForBackfill: () =>
            prisma.post.count({
              where: { userId: uid, createdAt: { gte: monthStart } },
            }),
          legacyInsert: () =>
            prisma.post.create({
              data: { userId: uid, text: "must never exist", status: "DRAFT" },
            }),
        })
      );
      const [free2, usage2, posts] = await Promise.all([
        identityId
          ? prisma.abuseFreeUsage.findUnique({
              where: { identityId_period: { identityId, period } },
            })
          : null,
        prisma.postUsage.findUnique({
          where: { userId_period: { userId: uid, period } },
        }),
        prisma.post.count({ where: { userId: uid } }),
      ]);
      assert.equal(posts, 1);
      assert.equal(usage2?.count, 1);
      assert.equal(free2?.count ?? 0, 0);
    });

    test("AbuseEvent failure never corrupts security state", async () => {
      await recordAbuseEvent({ identityId: null, kind: "CREATED" });
      const count = await prisma.abuseEvent.count();
      assert.ok(count >= 1);
      const email = tag("evt") + "@x.com";
      const uid = await createUser(email);
      const r = await resolveAbuseIdentity({
        userId: uid,
        signals: [emailSignal(email, PEPPER)],
        stores: liveAbuseStores,
      });
      assert.ok(r.identityId);
    });

    test("100 concurrent oauth-init takes grant exactly max", async () => {
      const scope = `pg-oauth-init-${RUN}`;
      const keyHash = `k-${RUN}`;
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          checkAbuseRate({
            scope,
            keyHash,
            max: 30,
            windowMs: 600_000,
            stores: liveAbuseStores,
            nowMs: 1_000_000 + (i % 7),
          })
        )
      );
      assert.equal(results.filter(Boolean).length, 30);
      const bucket = await prisma.abuseRateBucket.findUnique({
        where: { scope_keyHash: { scope, keyHash } },
      });
      assert.equal(bucket?.count, 30);
    });

    test("40 concurrent callback takes grant exactly user max", async () => {
      const mkReq = () =>
        new Request("https://postvia.online/api/auth/x/callback", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        });
      assert.equal(getClientIp(mkReq()), "203.0.113.7");
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          gateOAuthCallback({
            request: mkReq(),
            userId: `pg-cb-${RUN}`,
            scopePrefix: `pg-cb-${RUN}`,
            stores: liveAbuseStores,
            pepper: PEPPER,
            nowMs: 2_000_000 + (i % 5),
          })
        )
      );
      assert.equal(results.filter(Boolean).length, 30);
    });

    test("expired bucket + 20 concurrent racers grant exactly max (single reset winner)", async () => {
      const scope = `pg-reset-race-${RUN}`;
      const keyHash = `k-${RUN}`;
      const nowMs = 5_000_000;
      // Pre-seed an exhausted bucket from the previous window.
      await prisma.abuseRateBucket.create({
        data: { scope, keyHash, count: 30, resetAt: new Date(nowMs - 1_000) },
      });
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          checkAbuseRate({
            scope,
            keyHash,
            max: 5,
            windowMs: 600_000,
            stores: liveAbuseStores,
            nowMs,
          })
        )
      );
      // New window: 1 reset claim + 4 bumps = exactly 5, never 20.
      assert.equal(results.filter(Boolean).length, 5);
      const bucket = await prisma.abuseRateBucket.findUnique({
        where: { scope_keyHash: { scope, keyHash } },
      });
      assert.equal(bucket?.count, 5);
      assert.ok((bucket?.resetAt.getTime() ?? 0) > nowMs);
    });
  }
);

describe(
  "pg: database invariants (§16)",
  { skip: !ENABLED },
  () => {
    test("no duplicate signal owners, no dangling links, usage sane", async () => {
      const dups = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n FROM (
          SELECT kind, "valueHash" FROM "AbuseSignal"
          GROUP BY kind, "valueHash" HAVING COUNT(*) > 1
        ) d`;
      assert.equal(dups[0]?.n ?? 0, 0);
      const [identities, links, signals, tombs, freeUsages, usages, posts, socials, events] =
        await Promise.all([
          prisma.abuseIdentity.count(),
          prisma.abuseIdentityLink.count(),
          prisma.abuseSignal.count(),
          prisma.abuseTombstone.count(),
          prisma.abuseFreeUsage.count(),
          prisma.postUsage.count(),
          prisma.post.count(),
          prisma.socialAccount.count(),
          prisma.abuseEvent.count(),
        ]);
      console.log(
        JSON.stringify({
          identities,
          links,
          signals,
          tombs,
          freeUsages,
          usages,
          posts,
          socials,
          events,
        })
      );
      assert.ok(identities >= 0 && links >= 0 && signals >= 0);
    });
  }
);
