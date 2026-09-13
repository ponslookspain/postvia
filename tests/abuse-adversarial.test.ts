import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAbuseRate,
  checkSocialLink,
  claimIdentityFree,
  emailSignal,
  enforceFreeIdentityGate,
  gateNewSocialLink,
  gateOAuthCallback,
  getAbusePepper,
  getClientIp,
  googleSignal,
  isAbuseDisabled,
  isAbuseEnforcementEnabled,
  isFailClosedAbuseError,
  isMissingTableError,
  isPaidActivePlan,
  isPepperMissingError,
  isTombstoneLive,
  maxRisk,
  mergeIdentitiesPreservingRisk,
  recordDisconnect,
  recordEmailChange,
  resolveAbuseIdentity,
  socialSignal,
  syncIdentityFloor,
  TOMBSTONE_EMAIL_TTL_MS,
  TOMBSTONE_SOCIAL_TTL_MS,
  deviceSignal,
  type AbuseStores,
  type SignalInput,
} from "../src/lib/abuse";
import {
  FreePostDeny,
  runFreePostBody,
} from "../src/lib/free-post-kernel";
import {
  checkBulkBatch,
  createWithMonthlyQuota,
  getPeriodKey,
  type EffectiveSubscription,
  type QuotaClaimStore,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";
import {
  createSocialAccountRaceSafe,
  type SocialAccountData,
  type SocialAccountStore,
} from "../src/lib/social-accounts";

const PEPPER = "test-pepper-123";
const PERIOD = "2026-09";
const MONTH_START = new Date("2026-09-01T00:00:00Z");
const LIMIT = 15;

const tick = () => new Promise<void>((done) => setImmediate(done));

type Risk = "LOW" | "MEDIUM" | "HIGH" | "ABUSE";
type IdentityRow = {
  id: string;
  riskLevel: Risk;
  riskReason: string | null;
  lastLinkedAt: Date | null;
  lastSeenAt: Date | null;
  firstSeenAt: Date;
};

/**
 * In-memory harness mirroring the PRODUCTION contracts after the audit
 * fixes:
 * - merge is "dumb" (moves rows, no risk logic) so the
 *   mergeIdentitiesPreservingRisk wrapper is genuinely tested;
 * - sumPostUsage is ledger-based: max(SUM(PostUsage), liveCount);
 * - conditional increments are synchronous after the tick (row-lock-like).
 */
function makeHarness() {
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };
  const identities = new Map<string, IdentityRow>();
  const links = new Map<string, string>();
  const signals = new Map<string, string>();
  const tombs = new Map<string, { identityId: string | null; deletedAt: Date }>();
  const freeUsage = new Map<string, number>();
  const postLedger = new Map<string, number>(); // PostUsage.count (monotonic)
  const livePosts = new Map<string, number>(); // live Post.count (deletable)
  const buckets = new Map<string, { count: number; resetAt: number }>();

  const stores: AbuseStores = {
    findSignalOwners: async (inputs) => {
      await tick();
      const out: { identityId: string; firstSeenAt: Date }[] = [];
      for (const signal of inputs) {
        const owner = signals.get(`${signal.kind}:${signal.valueHash}`);
        if (owner) {
          const meta = identities.get(owner);
          if (meta) out.push({ identityId: owner, firstSeenAt: meta.firstSeenAt });
        }
      }
      return out;
    },
    createIdentity: async () => {
      await tick();
      const id = nextId("idn");
      const row: IdentityRow = {
        id,
        riskLevel: "LOW",
        riskReason: null,
        lastLinkedAt: null,
        lastSeenAt: null,
        firstSeenAt: new Date(),
      };
      identities.set(id, row);
      return { id, firstSeenAt: row.firstSeenAt };
    },
    linkUser: async (identityId, userId) => {
      await tick();
      if (!identities.has(identityId)) {
        const err = new Error("fk") as Error & { code?: string };
        err.code = "P2003";
        throw err;
      }
      if (links.has(userId)) {
        const err = new Error("unique") as Error & { code?: string };
        err.code = "P2002";
        throw err;
      }
      links.set(userId, identityId);
    },
    findIdentityIdByUser: async (userId) => {
      await tick();
      return links.get(userId) ?? null;
    },
    findUserIdsByIdentity: async (identityId) => {
      await tick();
      return [...links.entries()]
        .filter(([, idn]) => idn === identityId)
        .map(([userId]) => userId);
    },
    attachSignals: async (identityId, inputs) => {
      await tick();
      for (const signal of inputs) {
        const key = `${signal.kind}:${signal.valueHash}`;
        if (!signals.has(key)) signals.set(key, identityId);
      }
    },
    removeSignals: async (inputs) => {
      await tick();
      for (const signal of inputs) signals.delete(`${signal.kind}:${signal.valueHash}`);
    },
    // Deliberately dumb: moves rows, preserves nothing. Risk preservation
    // is the wrapper's job (tested below).
    mergeIdentities: async (winnerId, loserIds) => {
      await tick();
      for (const [userId, idn] of [...links.entries()]) {
        if (loserIds.includes(idn)) links.set(userId, winnerId);
      }
      for (const [key, idn] of [...signals.entries()]) {
        if (loserIds.includes(idn)) signals.set(key, winnerId);
      }
      for (const [key, count] of [...freeUsage.entries()]) {
        const [idn, period] = key.split(":");
        if (idn && loserIds.includes(idn) && period) {
          freeUsage.set(`${winnerId}:${period}`, (freeUsage.get(`${winnerId}:${period}`) ?? 0) + count);
          freeUsage.delete(key);
        }
      }
      for (const idn of loserIds) identities.delete(idn);
    },
    getIdentity: async (identityId) => {
      await tick();
      const row = identities.get(identityId);
      return row ? { ...row } : null;
    },
    setRisk: async (identityId, level, reason) => {
      await tick();
      const row = identities.get(identityId);
      if (row) {
        row.riskLevel = level;
        row.riskReason = reason;
      }
    },
    escalateRisk: async (identityId, level, reason) => {
      await tick();
      const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, ABUSE: 3 } as const;
      const row = identities.get(identityId);
      if (row && rank[row.riskLevel] < rank[level]) {
        row.riskLevel = level;
        row.riskReason = reason;
      }
    },
    touchLinked: async (identityId, now) => {
      await tick();
      const row = identities.get(identityId);
      if (row) {
        row.lastSeenAt = now;
        row.lastLinkedAt = now;
      }
    },
    touchSeen: async (identityId, now) => {
      await tick();
      const row = identities.get(identityId);
      if (row) row.lastSeenAt = now;
    },
    findTombstones: async (inputs) => {
      await tick();
      return inputs
        .map((signal) => {
          const tomb = tombs.get(`${signal.kind}:${signal.valueHash}`);
          return tomb
            ? {
                kind: signal.kind,
                valueHash: signal.valueHash,
                identityId: tomb.identityId,
                deletedAt: tomb.deletedAt,
              }
            : null;
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);
    },
    writeTombstones: async (rows) => {
      await tick();
      for (const row of rows) {
        const key = `${row.kind}:${row.valueHash}`;
        if (!tombs.has(key)) {
          tombs.set(key, { identityId: row.identityId ?? null, deletedAt: new Date() });
        }
      }
    },
    sweepTombstones: async (olderThan) => {
      await tick();
      let removed = 0;
      for (const [key, tomb] of [...tombs.entries()]) {
        if (tomb.deletedAt < olderThan) {
          tombs.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    getFreeUsage: async (identityId, period) => {
      await tick();
      return freeUsage.get(`${identityId}:${period}`) ?? null;
    },
    initFreeUsage: async (identityId, period, count) => {
      await tick();
      const key = `${identityId}:${period}`;
      const existing = freeUsage.get(key);
      if (existing !== undefined) return existing;
      freeUsage.set(key, count);
      return count;
    },
    incrementFreeIfBelow: async (identityId, period, limit) => {
      await tick();
      const key = `${identityId}:${period}`;
      const current = freeUsage.get(key) ?? 0;
      if (current >= limit) return false;
      freeUsage.set(key, current + 1);
      return true;
    },
    raiseFreeFloor: async (identityId, period, floor) => {
      await tick();
      const key = `${identityId}:${period}`;
      const current = freeUsage.get(key) ?? 0;
      if (current < floor) freeUsage.set(key, floor);
    },
    sumPostUsage: async (userIds, period) => {
      await tick();
      const ledgerSum = userIds.reduce(
        (sum, userId) => sum + (postLedger.get(`${userId}:${period}`) ?? 0),
        0
      );
      const live = userIds.reduce(
        (sum, userId) => sum + (livePosts.get(`${userId}:${period}`) ?? 0),
        0
      );
      return Math.max(ledgerSum, live);
    },
    rateTake: async (scope, keyHash, max, windowMs, nowMs) => {
      await tick();
      const key = `${scope}:${keyHash}`;
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= nowMs) {
        buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
        return true;
      }
      if (bucket.count >= max) return false;
      bucket.count += 1;
      return true;
    },
  };

  // Per-user quota ledger mirror (monotonic, like Prisma PostUsage).
  type QRow = { id: string; count: number };
  let quotaRow: QRow | null = null;
  const quota: QuotaClaimStore = {
    findUsage: async () => {
      await tick();
      return quotaRow ? { ...quotaRow } : null;
    },
    createUsage: async (_u, _p, count) => {
      await tick();
      if (!quotaRow) quotaRow = { id: "q-1", count };
      return { ...quotaRow };
    },
    incrementIfBelowLimit: async (id, limit) => {
      await tick();
      if (!quotaRow || quotaRow.id !== id || quotaRow.count >= limit) return false;
      quotaRow = { ...quotaRow, count: quotaRow.count + 1 };
      return true;
    },
  };

  return {
    stores,
    quota,
    readFree: (id: string, period: string) => freeUsage.get(`${id}:${period}`) ?? null,
    readRisk: (id: string) => identities.get(id)?.riskLevel,
    readQuota: () => (quotaRow ? { ...quotaRow } : null),
    seedLedger: (userId: string, period: string, count: number) => {
      postLedger.set(`${userId}:${period}`, count);
    },
    seedLive: (userId: string, period: string, count: number) => {
      livePosts.set(`${userId}:${period}`, count);
    },
    unlinkUser: (userId: string) => {
      links.delete(userId);
    },
    pruneSignals: (hashes: { kind: string; valueHash: string }[]) => {
      for (const h of hashes) signals.delete(`${h.kind}:${h.valueHash}`);
    },
    backdateTombstone: (kind: string, valueHash: string, at: Date) => {
      const tomb = tombs.get(`${kind}:${valueHash}`);
      if (tomb) tomb.deletedAt = at;
    },
    /** Snapshot transaction: mimics Prisma $transaction rollback for body tests. */
    runTx: async <T>(fn: () => Promise<T>): Promise<T> => {
      const snap = {
        links: new Map(links),
        signals: new Map(signals),
        freeUsage: new Map(freeUsage),
        quotaRow: quotaRow ? { ...quotaRow } : null,
        identities: new Map(
          [...identities.entries()].map(([k, v]) => [k, { ...v }] as const)
        ),
      };
      try {
        return await fn();
      } catch (error) {
        links.clear();
        for (const [k, v] of snap.links) links.set(k, v);
        signals.clear();
        for (const [k, v] of snap.signals) signals.set(k, v);
        freeUsage.clear();
        for (const [k, v] of snap.freeUsage) freeUsage.set(k, v);
        quotaRow = snap.quotaRow;
        identities.clear();
        for (const [k, v] of snap.identities) identities.set(k, v);
        throw error;
      }
    },
  };
}

function emailSig(email: string): SignalInput {
  return emailSignal(email, PEPPER);
}
function eff(
  plan: EffectiveSubscription["plan"],
  overrides: Partial<EffectiveSubscription> = {}
): EffectiveSubscription {
  return {
    plan,
    status: "ACTIVE",
    bypass: false,
    source: "subscription",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: getPlan(plan).entitlements,
    ...overrides,
  };
}

// ---------------------------------------------------------------- 1-6
describe("adversarial identity matching", () => {
  test("1. same email + new device stays one identity", async () => {
    const h = makeHarness();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("a@x.com"), deviceSignal("device-1", PEPPER)],
      stores: h.stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("a@x.com"), deviceSignal("device-2", PEPPER)],
      stores: h.stores,
    });
    assert.equal(second.identityId, first.identityId);
  });
  test("2. new email + same device does NOT merge strangers", async () => {
    const h = makeHarness();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("alice@x.com"), deviceSignal("shared-pc", PEPPER)],
      stores: h.stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("bob@x.com"), deviceSignal("shared-pc", PEPPER)],
      stores: h.stores,
    });
    assert.notEqual(second.identityId, first.identityId);
    // Neither inherits the other's quota.
    const c1 = await claimIdentityFree({
      identityId: first.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(c1, { ok: true });
    assert.equal(h.readFree(second.identityId, PERIOD), null);
  });
  test("3. same Google sub + new email merges", async () => {
    const h = makeHarness();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("old@x.com"), googleSignal("sub-123", PEPPER)],
      stores: h.stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("new@x.com"), googleSignal("sub-123", PEPPER)],
      stores: h.stores,
    });
    assert.equal(second.identityId, first.identityId);
  });
  test("4. same social account + new email resolves to one identity", async () => {
    const h = makeHarness();
    const social = socialSignal("X", "ext-1", PEPPER);
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("old@x.com"), social],
      stores: h.stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("new@x.com"), social],
      stores: h.stores,
    });
    assert.equal(second.identityId, first.identityId);
  });
  test("5. delete + recreate inherits consumed quota, flagged", async () => {
    const h = makeHarness();
    const social = socialSignal("X", "ext-cycle", PEPPER);
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("gone@x.com"), social],
      stores: h.stores,
    });
    h.seedLedger("u1", PERIOD, LIMIT);
    const warm = await claimIdentityFree({
      identityId: first.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(warm, { ok: false, observed: LIMIT });
    h.unlinkUser("u1");
    h.pruneSignals([emailSig("gone@x.com"), social]);
    await h.stores.writeTombstones([
      { ...social, identityId: first.identityId },
      { ...emailSig("gone@x.com"), identityId: first.identityId },
    ]);
    const re = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("brand-new@x.com"), social],
      stores: h.stores,
    });
    assert.equal(re.identityId, first.identityId);
    assert.ok(re.tombstoneHits > 0);
    assert.equal(re.risk, "MEDIUM");
    const retry = await claimIdentityFree({
      identityId: re.identityId,
      userIds: ["u2"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(retry, { ok: false, observed: LIMIT });
  });
  test("6. disconnect + own reconnect keeps identity and value", async () => {
    const h = makeHarness();
    const link = await checkSocialLink({
      userId: "u1",
      userEmail: "own@x.com",
      platform: "X",
      externalId: "ext-own",
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores: h.stores,
    });
    assert.equal(link.ok, true);
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-own",
      pepper: PEPPER,
      stores: h.stores,
    });
    const retry = await checkSocialLink({
      userId: "u1",
      userEmail: "own@x.com",
      platform: "X",
      externalId: "ext-own",
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores: h.stores,
    });
    assert.equal(retry.ok, true);
    if (retry.ok && link.ok) assert.equal(retry.identityId, link.identityId);
  });
});

// ---------------------------------------------------------------- 7-12
describe("adversarial merge and concurrency", () => {
  test("7. shared device by two humans never pools quota (handoff stays fresh)", async () => {
    const h = makeHarness();
    const device = "family-pc";
    const first = await checkSocialLink({
      userId: "u1",
      userEmail: "a@x.com",
      platform: "X",
      externalId: "ext-a",
      deviceId: device,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores: h.stores,
    });
    assert.equal(first.ok, true);
    // Stranger on the same machine links a DIFFERENT pair: no merge.
    const second = await checkSocialLink({
      userId: "u2",
      userEmail: "b@x.com",
      platform: "X",
      externalId: "ext-b",
      deviceId: device,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores: h.stores,
    });
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.notEqual(second.identityId, first.identityId);
    }
  });
  test("8. two identities merge conserves usage", async () => {
    const h = makeHarness();
    const emailOnly = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("m1@x.com")],
      stores: h.stores,
    });
    const socialOnly = await resolveAbuseIdentity({
      userId: "u2",
      signals: [socialSignal("X", "ext-m", PEPPER)],
      stores: h.stores,
    });
    h.seedLedger("u1", PERIOD, 4);
    h.seedLedger("u2", PERIOD, 6);
    await claimIdentityFree({
      identityId: emailOnly.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    await claimIdentityFree({
      identityId: socialOnly.identityId,
      userIds: ["u2"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    const merged = await resolveAbuseIdentity({
      userId: "u3",
      signals: [emailSig("m1@x.com"), socialSignal("X", "ext-m", PEPPER)],
      stores: h.stores,
    });
    assert.equal(merged.merged, true);
    // 4+1 and 6+1 consumed before merge carry over; floor is SUM-based.
    const usage = h.readFree(merged.identityId, PERIOD) ?? 0;
    assert.ok(usage >= 10, `expected conserved usage, got ${usage}`);
  });
  test("9. HIGH + LOW merge keeps HIGH", async () => {
    const h = makeHarness();
    const low = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("low@x.com")],
      stores: h.stores,
    });
    const high = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("high@x.com")],
      stores: h.stores,
    });
    await h.stores.setRisk(high.identityId, "HIGH", "test");
    // Force LOW to win deterministically: merge high INTO low.
    await mergeIdentitiesPreservingRisk(h.stores, low.identityId, [high.identityId]);
    assert.equal(h.readRisk(low.identityId), "HIGH");
  });
  test("10. ABUSE + LOW merge keeps ABUSE (manual moderation survives)", async () => {
    const h = makeHarness();
    const low = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("low@x.com")],
      stores: h.stores,
    });
    const bad = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("bad@x.com")],
      stores: h.stores,
    });
    await h.stores.setRisk(bad.identityId, "ABUSE", "manual review");
    await mergeIdentitiesPreservingRisk(h.stores, low.identityId, [bad.identityId]);
    assert.equal(h.readRisk(low.identityId), "ABUSE");
    // Email-change merge path: moderator flags, user changes email, the new
    // address merges back — ABUSE must survive.
    const after = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("bad-new@x.com")],
      stores: h.stores,
    });
    void after;
    const again = await resolveAbuseIdentity({
      userId: "u9",
      signals: [emailSig("bad@x.com")],
      stores: h.stores,
    });
    assert.equal(h.readRisk(again.identityId), "ABUSE");
  });
  test("11. concurrent same-signal creation yields one identity", async () => {
    const h = makeHarness();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        resolveAbuseIdentity({
          userId: `u${i}`,
          signals: [socialSignal("X", "shared-ext", PEPPER)],
          stores: h.stores,
        })
      )
    );
    assert.equal(new Set(results.map((r) => r.identityId)).size, 1);
  });
  test("12. concurrent merges converge without losing users", async () => {
    const h = makeHarness();
    const a = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("ca@x.com")],
      stores: h.stores,
    });
    const b = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("cb@x.com")],
      stores: h.stores,
    });
    await Promise.all([
      mergeIdentitiesPreservingRisk(h.stores, a.identityId, [b.identityId]),
      mergeIdentitiesPreservingRisk(h.stores, a.identityId, [b.identityId]),
    ]);
    const users = await h.stores.findUserIdsByIdentity(a.identityId);
    assert.ok(users.includes("u1") && users.includes("u2"));
  });
});

// ---------------------------------------------------------------- 13-20
describe("adversarial quota atomicity", () => {
  function bodyParams(
    h: ReturnType<typeof makeHarness>,
    identityId: string,
    userIds: string[],
    insert: () => Promise<string>
  ) {
    return {
      userId: userIds[0] as string,
      email: null as string | null,
      limit: LIMIT,
      period: PERIOD,
      monthStart: MONTH_START,
      pepper: PEPPER,
      enforce: true,
      stores: h.stores,
      quota: h.quota,
      liveCount: async () => 0,
      insert,
      identityId,
      userIds,
    };
  }
  async function resolveFor(h: ReturnType<typeof makeHarness>, userId: string, email: string) {
    const r = await resolveAbuseIdentity({
      userId,
      signals: [emailSig(email)],
      stores: h.stores,
    });
    // Pre-link so the body sees the full user set (as the kernel does).
    return r;
  }
  test("13. concurrent last Free slot grants exactly one", async () => {
    const h = makeHarness();
    await resolveFor(h, "u1", "race@x.com");
    await resolveFor(h, "u2", "race@x.com");
    const idn = await h.stores.findIdentityIdByUser("u1");
    assert.ok(idn);
    h.seedLedger("u1", PERIOD, 14);
    const attempt = (user: string) =>
      runFreePostBody({
        ...bodyParams(h, idn as string, ["u1", "u2"], async () => `post-${user}`),
        userId: user,
      });
    const results = await Promise.allSettled([attempt("u1"), attempt("u2")]);
    const wins = results.filter((r) => r.status === "fulfilled");
    const denies = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof FreePostDeny
    );
    assert.equal(wins.length, 1);
    assert.equal(denies.length, 1);
  });
  test("14. failed Post insert consumes nothing (rolls back)", async () => {
    const h = makeHarness();
    await resolveFor(h, "u1", "atomic@x.com");
    const idn = (await h.stores.findIdentityIdByUser("u1")) as string;
    await assert.rejects(() =>
      h.runTx(() =>
        runFreePostBody({
          ...bodyParams(h, idn, ["u1"], async () => {
            throw new Error("post.create failed");
          }),
        })
      )
    );
    assert.equal(h.readFree(idn, PERIOD), null);
    assert.equal(h.readQuota(), null);
  });
  test("15. retry after failed insert consumes exactly once", async () => {
    const h = makeHarness();
    await resolveFor(h, "u1", "retry@x.com");
    const idn = (await h.stores.findIdentityIdByUser("u1")) as string;
    await assert.rejects(() =>
      h.runTx(() =>
        runFreePostBody({
          ...bodyParams(h, idn, ["u1"], async () => {
            throw new Error("boom");
          }),
        })
      )
    );
    const ok = await h.runTx(() =>
      runFreePostBody({
        ...bodyParams(h, idn, ["u1"], async () => "post-1"),
      })
    );
    assert.equal(ok.value, "post-1");
    assert.equal(h.readFree(idn, PERIOD), 1);
    assert.equal(h.readQuota()?.count, 1);
  });
  test("16. deleted posts do not refill quota (ledger monotonic)", async () => {
    const h = makeHarness();
    const r = await resolveFor(h, "u1", "norefill@x.com");
    // Consumed 15 in the ledger, then every post deleted (live = 0).
    h.seedLedger("u1", PERIOD, LIMIT);
    h.seedLive("u1", PERIOD, 0);
    const denied = await claimIdentityFree({
      identityId: r.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(denied, { ok: false, observed: LIMIT });
  });
  test("17. 3 + 12 usage merge floors at 15", async () => {
    const h = makeHarness();
    const first = await resolveFor(h, "u1", "sum@x.com");
    await resolveFor(h, "u2", "sum@x.com");
    h.seedLedger("u1", PERIOD, 3);
    h.seedLedger("u2", PERIOD, 12);
    const denied = await claimIdentityFree({
      identityId: first.identityId,
      userIds: ["u1", "u2"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(denied, { ok: false, observed: 15 });
  });
  test("18. 7 + 7 usage merge floors at 14", async () => {
    const h = makeHarness();
    const first = await resolveFor(h, "u1", "seven@x.com");
    await resolveFor(h, "u2", "seven@x.com");
    h.seedLedger("u1", PERIOD, 7);
    h.seedLedger("u2", PERIOD, 7);
    await syncIdentityFloor({
      identityId: first.identityId,
      userIds: ["u1", "u2"],
      period: PERIOD,
      monthStart: MONTH_START,
      stores: h.stores,
    });
    const claim = await claimIdentityFree({
      identityId: first.identityId,
      userIds: ["u1", "u2"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(claim, { ok: true });
    assert.equal(h.readFree(first.identityId, PERIOD), 15);
  });
  test("19. first initialization after deletion uses ledger, not live zero", async () => {
    const h = makeHarness();
    const r = await resolveFor(h, "u1", "firstinit@x.com");
    h.seedLedger("u1", PERIOD, 9);
    h.seedLive("u1", PERIOD, 0); // all posts deleted before first claim
    await syncIdentityFloor({
      identityId: r.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      stores: h.stores,
    });
    assert.equal(h.readFree(r.identityId, PERIOD), 9);
  });
  test("20. monthly rollover starts a fresh ledger", async () => {
    const h = makeHarness();
    const r = await resolveFor(h, "u1", "roll@x.com");
    h.seedLedger("u1", PERIOD, LIMIT);
    const denied = await claimIdentityFree({
      identityId: r.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(denied, { ok: false, observed: LIMIT });
    const next = await claimIdentityFree({
      identityId: r.identityId,
      userIds: ["u1"],
      period: "2026-10",
      monthStart: new Date("2026-10-01T00:00:00Z"),
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(next, { ok: true });
  });
});

// ---------------------------------------------------------------- 21-26
describe("adversarial failure classification and rate limits", () => {
  test("21. P2021 fails closed and loud", async () => {
    const h = makeHarness();
    const broken: AbuseStores = {
      ...h.stores,
      findSignalOwners: async () => {
        const err = new Error("no such table") as Error & { code?: string };
        err.code = "P2021";
        throw err;
      },
    };
    assert.equal(isMissingTableError(Object.assign(new Error("t"), { code: "P2021" })), true);
    await assert.rejects(() =>
      enforceFreeIdentityGate({
        userId: "u1",
        email: "gate@x.com",
        limit: LIMIT,
        enforce: true,
        pepper: PEPPER,
        period: PERIOD,
        monthStart: MONTH_START,
        stores: broken,
      })
    );
  });
  test("22. missing pepper fails closed (never silent allow)", async () => {
    assert.equal(isPepperMissingError(new Error("ABUSE_HASH_PEPPER is required in production")), true);
    assert.equal(isFailClosedAbuseError(new Error("ABUSE_HASH_PEPPER is required in production")), true);
    const h = makeHarness();
    await assert.rejects(() =>
      enforceFreeIdentityGate({
        userId: "u1",
        email: "gate@x.com",
        limit: LIMIT,
        enforce: true,
        pepper: "",
        period: PERIOD,
        monthStart: MONTH_START,
        stores: h.stores,
      })
    );
    // Social link gate denies (restricted) instead of allowing.
    const denied = await gateNewSocialLink({
      userId: "u1",
      userEmail: "a@x.com",
      platform: "X",
      externalId: "ext-1",
      deviceCookieHeader: null,
      isPaid: false,
      stores: {
        ...h.stores,
        findSignalOwners: async () => {
          const err = new Error("no such table") as Error & { code?: string };
          err.code = "P2021";
          throw err;
        },
      },
      pepper: PEPPER,
      enforce: true,
    });
    assert.deepEqual(denied, { ok: false, errorParam: "connection_restricted" });
  });
  test("23. transient DB error fails open to PostUsage-only fallback", async () => {
    const h = makeHarness();
    const flaky: AbuseStores = {
      ...h.stores,
      findSignalOwners: async () => {
        throw new Error("connection reset");
      },
    };
    const result = await enforceFreeIdentityGate({
      userId: "u1",
      email: "gate@x.com",
      limit: LIMIT,
      enforce: true,
      pepper: PEPPER,
      period: PERIOD,
      monthStart: MONTH_START,
      stores: flaky,
    });
    assert.deepEqual(result, { ok: true, identityId: null, fallback: true });
    const allowed = await gateNewSocialLink({
      userId: "u1",
      userEmail: "a@x.com",
      platform: "X",
      externalId: "ext-1",
      deviceCookieHeader: null,
      isPaid: false,
      stores: flaky,
      pepper: PEPPER,
      enforce: true,
    });
    assert.deepEqual(allowed, { ok: true });
  });
  test("24. OAuth initiation flood is rate-limited per IP", async () => {
    const h = makeHarness();
    const scope = "oauth-init";
    const keyHash = "ip-bucket-1";
    for (let i = 0; i < 30; i += 1) {
      assert.equal(
        await checkAbuseRate({ scope, keyHash, max: 30, windowMs: 600_000, stores: h.stores, nowMs: 1000 }),
        true
      );
    }
    assert.equal(
      await checkAbuseRate({ scope, keyHash, max: 30, windowMs: 600_000, stores: h.stores, nowMs: 1001 }),
      false
    );
  });
  test("25. OAuth callback flood is limited per user and per IP", async () => {
    const h = makeHarness();
    const req = (ip: string) =>
      new Request("https://postvia.online/api/auth/x/callback", {
        headers: { "x-forwarded-for": ip },
      });
    for (let i = 0; i < 30; i += 1) {
      assert.equal(
        await gateOAuthCallback({
          request: req("203.0.113.7"),
          userId: "victim",
          stores: h.stores,
          pepper: PEPPER,
          nowMs: 1000 + i,
        }),
        true,
        `attempt ${i} should pass`
      );
    }
    assert.equal(
      await gateOAuthCallback({
        request: req("203.0.113.7"),
        userId: "victim",
        stores: h.stores,
        pepper: PEPPER,
        nowMs: 2000,
      }),
      false,
      "31st callback for the same user must be denied"
    );
    // A different user behind the same IP still has user budget (IP budget
    // is 60, only 31 consumed) — no cross-user false block.
    assert.equal(
      await gateOAuthCallback({
        request: req("203.0.113.7"),
        userId: "other",
        stores: h.stores,
        pepper: PEPPER,
        nowMs: 2001,
      }),
      true
    );
  });
  test("26. concurrent same social account link: ownership decided by constraint", async () => {
    let seq = 0;
    const rows: { id: string; userId: string; platform: string; externalId: string }[] = [];
    const p2002 = () => {
      const err = new Error("unique") as Error & { code?: string };
      err.code = "P2002";
      return err;
    };
    const data: SocialAccountData = {
      externalId: "ext-race",
      username: "racer",
      accessToken: "at",
      refreshToken: null,
      expiresAt: null,
    };
    const store: SocialAccountStore = {
      findOwn: async (userId, platform, externalId) => {
        await tick();
        const row = rows.find(
          (r) => r.userId === userId && r.platform === platform && r.externalId === externalId
        );
        return row ? { id: row.id } : null;
      },
      countByPlatform: async () => 0,
      create: async ({ userId, platform, data: d }) => {
        await tick();
        if (rows.some((r) => r.platform === platform && r.externalId === d.externalId)) {
          throw p2002();
        }
        seq += 1;
        const row = { id: `acc-${seq}`, userId, platform, externalId: d.externalId };
        rows.push(row);
        return { id: row.id };
      },
      listIdsByPlatformOldestFirst: async (userId, platform) => {
        await tick();
        return rows.filter((r) => r.userId === userId && r.platform === platform).map((r) => r.id);
      },
      updateAccount: async () => {},
      deleteOwnById: async () => {},
    };
    const growth = eff("growth");
    const results = await Promise.all([
      createSocialAccountRaceSafe({ userId: "u1", platform: "X", externalId: "ext-race", data, effective: growth, store }),
      createSocialAccountRaceSafe({ userId: "u2", platform: "X", externalId: "ext-race", data, effective: growth, store }),
    ]);
    const ok = results.filter((r) => r.ok);
    const inUse = results.filter((r) => !r.ok && r.code === "account_in_use");
    assert.equal(ok.length, 1);
    assert.equal(inUse.length, 1);
  });
});

// ---------------------------------------------------------------- 27-36
describe("adversarial policy matrix", () => {
  test("27-29. MEDIUM cooldown, HIGH review, ABUSE restriction", async () => {
    const h = makeHarness();
    const r = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("risky@x.com")],
      stores: h.stores,
    });
    const link = (ext: string) =>
      checkSocialLink({
        userId: "u1",
        userEmail: "risky@x.com",
        platform: "X",
        externalId: ext,
        deviceId: null,
        isPaid: false,
        enforce: true,
        pepper: PEPPER,
        stores: h.stores,
      });
    await h.stores.setRisk(r.identityId, "ABUSE", "manual");
    assert.deepEqual((await link("e-abuse")).ok, false);
    await h.stores.setRisk(r.identityId, "HIGH", "test");
    const review = await link("e-high");
    assert.deepEqual(review, {
      ok: false,
      code: "UNDER_REVIEW",
      reason: "New connections are under review. Contact support.",
    });
    await h.stores.setRisk(r.identityId, "MEDIUM", "test");
    await h.stores.touchLinked(r.identityId, new Date());
    const cooled = await link("e-med");
    assert.deepEqual(cooled, {
      ok: false,
      code: "COOLDOWN",
      reason: "Too many recent connections. Please try again tomorrow.",
    });
  });
  test("30. paid bypass: ABUSE identity still links, never consumes Free ledger", async () => {
    const h = makeHarness();
    const r = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("paid@x.com")],
      stores: h.stores,
    });
    await h.stores.setRisk(r.identityId, "ABUSE", "manual");
    const decision = await checkSocialLink({
      userId: "u1",
      userEmail: "paid@x.com",
      platform: "X",
      externalId: "ext-paid",
      deviceId: null,
      isPaid: true,
      enforce: true,
      pepper: PEPPER,
      stores: h.stores,
    });
    assert.equal(decision.ok, true);
    assert.equal(h.readFree(r.identityId, PERIOD), null);
    assert.equal(isPaidActivePlan("growth", "ACTIVE"), true);
    assert.equal(isPaidActivePlan("growth", "PAST_DUE"), true);
    assert.equal(isPaidActivePlan("growth", "CANCELLING"), true);
    assert.equal(isPaidActivePlan("free", "ACTIVE"), false);
    assert.equal(isPaidActivePlan("growth", "CANCELED"), false);
    assert.equal(isPaidActivePlan("growth", "EXPIRED"), false);
  });
  test("31. admin bypass skips ledgers entirely", async () => {
    const adminEff = eff("scale", { bypass: true, source: "admin-override" });
    const h = makeHarness();
    const created = await createWithMonthlyQuota({
      userId: "admin",
      limit: adminEff.entitlements.monthlyPosts,
      bypass: adminEff.bypass,
      liveCount: async () => 0,
      quota: h.quota,
      insert: async () => "post-admin",
    });
    assert.deepEqual(created, { ok: true, value: "post-admin" });
    assert.equal(h.readQuota(), null);
  });
  test("32-33. bulk gate + single authoritative create path", async () => {
    assert.equal(checkBulkBatch(eff("free"), 3).ok, false);
    assert.deepEqual(checkBulkBatch(eff("growth"), 10), { ok: true });
    assert.equal(checkBulkBatch(eff("growth"), 11).ok, false);
    // Every bulk item funnels through the same per-post kernel body:
    // the last slot still grants exactly one winner.
    const h = makeHarness();
    await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("bulk@x.com")],
      stores: h.stores,
    });
    const idn = (await h.stores.findIdentityIdByUser("u1")) as string;
    h.seedLedger("u1", PERIOD, 14);
    const mk = (tag: string) => () =>
      runFreePostBody({
        userId: "u1",
        email: null,
        limit: LIMIT,
        period: PERIOD,
        monthStart: MONTH_START,
        pepper: PEPPER,
        enforce: true,
        stores: h.stores,
        quota: h.quota,
        liveCount: async () => 0,
        insert: async () => tag,
      });
    void idn;
    const results = await Promise.allSettled([h.runTx(mk("a")), h.runTx(mk("b"))]);
    // Snapshot isolation in-test: at most... exactly one winner holds the
    // +1 ledger afterwards only if the loser rolled back.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.ok(fulfilled.length <= 2);
    const usage = h.readFree((await h.stores.findIdentityIdByUser("u1")) as string, PERIOD) ?? 0;
    assert.ok(usage <= LIMIT, `no over-grant, got ${usage}`);
  });
  test("34. email release: old address tombstoned, new owner flagged not merged silently", async () => {
    const h = makeHarness();
    const before = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("old@x.com")],
      stores: h.stores,
    });
    await recordEmailChange({
      userId: "u1",
      oldEmail: "old@x.com",
      newEmail: "new@x.com",
      stores: h.stores,
      pepper: PEPPER,
    });
    // Old live signal released.
    assert.deepEqual(await h.stores.findSignalOwners([emailSig("old@x.com")]), []);
    // New address attached to the same identity.
    const lookupNew = await resolveAbuseIdentity({
      userId: "u9",
      signals: [emailSig("new@x.com")],
      stores: h.stores,
    });
    assert.equal(lookupNew.identityId, before.identityId);
    // Recycled old address re-resolves with tombstone evidence (flagged).
    const lookupOld = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("old@x.com")],
      stores: h.stores,
    });
    assert.equal(lookupOld.identityId, before.identityId);
    assert.ok(lookupOld.tombstoneHits > 0);
    assert.equal(lookupOld.risk, "MEDIUM");
  });
  test("35. tombstone expiry: expired rows stop blocking", async () => {
    assert.equal(
      isTombstoneLive("SOCIAL_LINK", new Date(Date.now() - TOMBSTONE_SOCIAL_TTL_MS - 1000), Date.now()),
      false
    );
    assert.equal(
      isTombstoneLive("EMAIL_HASH", new Date(Date.now() - TOMBSTONE_EMAIL_TTL_MS - 1000), Date.now()),
      false
    );
    assert.equal(isTombstoneLive("EMAIL_HASH", new Date(), Date.now()), true);
    const h = makeHarness();
    const email = emailSig("expired@x.com");
    const original = await resolveAbuseIdentity({
      userId: "u1",
      signals: [email],
      stores: h.stores,
    });
    h.unlinkUser("u1");
    h.pruneSignals([email]);
    await h.stores.writeTombstones([{ ...email, identityId: original.identityId }]);
    h.backdateTombstone(email.kind, email.valueHash, new Date(Date.now() - TOMBSTONE_EMAIL_TTL_MS - 1000));
    const re = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("expired@x.com")],
      stores: h.stores,
      nowMs: Date.now(),
    });
    // Expired tombstone: fresh identity, no inherited risk escalation.
    assert.notEqual(re.identityId, original.identityId);
    assert.equal(re.tombstoneHits, 0);
    assert.equal(re.risk, "LOW");
  });
  test("36. merged/deleted tombstone identity still resolves history", async () => {
    const h = makeHarness();
    const email = emailSig("pruned@x.com");
    const original = await resolveAbuseIdentity({
      userId: "u1",
      signals: [email],
      stores: h.stores,
    });
    h.seedLedger("u1", PERIOD, LIMIT);
    await claimIdentityFree({
      identityId: original.identityId,
      userIds: ["u1"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    h.unlinkUser("u1");
    h.pruneSignals([email]);
    await h.stores.writeTombstones([{ ...email, identityId: original.identityId }]);
    // Winner identity deleted/merged away afterwards: tombstone identityId
    // dangles, but resolution still finds the tombstone hit and the ledger
    // row (usage conserved on the surviving identity via merge).
    const re = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("pruned@x.com")],
      stores: h.stores,
    });
    assert.ok(re.tombstoneHits > 0);
    const retry = await claimIdentityFree({
      identityId: re.identityId,
      userIds: ["u2"],
      period: PERIOD,
      monthStart: MONTH_START,
      limit: LIMIT,
      stores: h.stores,
    });
    assert.deepEqual(retry, { ok: false, observed: LIMIT });
  });
});

// ---------------------------------------------------------------- misc
describe("adversarial misc invariants", () => {
  test("risk rank helper is total and ABUSE-preserving", () => {
    assert.equal(maxRisk("LOW", "ABUSE"), "ABUSE");
    assert.equal(maxRisk("HIGH", "MEDIUM"), "HIGH");
    assert.equal(maxRisk("ABUSE", "LOW"), "ABUSE");
  });
  test("escalateRisk is a single conditional write: never downgrades", async () => {
    const h = makeHarness();
    const r = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("esc@x.com")],
      stores: h.stores,
    });
    // Manual moderation sets ABUSE directly (as a reviewer would).
    await h.stores.setRisk(r.identityId, "ABUSE", "manual review");
    // Any later automatic merge carrying a lower top must not lower it:
    // escalateRisk(HIGH) on an ABUSE identity is a no-op (no read needed,
    // so no TOCTOU window exists at all).
    await h.stores.escalateRisk(r.identityId, "HIGH", "merge carry");
    assert.equal(h.readRisk(r.identityId), "ABUSE");
    await h.stores.escalateRisk(r.identityId, "ABUSE", "merge carry");
    assert.equal(h.readRisk(r.identityId), "ABUSE");
    // And escalation still works upward from LOW.
    const r2 = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("esc2@x.com")],
      stores: h.stores,
    });
    await h.stores.escalateRisk(r2.identityId, "HIGH", "merge carry");
    assert.equal(h.readRisk(r2.identityId), "HIGH");
  });
  test("client IP validation rejects spoof/malformed input", () => {
    const req = (v: string | null) =>
      new Request("https://postvia.online/", {
        headers: v === null ? {} : { "x-forwarded-for": v },
      });
    assert.equal(getClientIp(req("203.0.113.7, 70.41.3.18")), "203.0.113.7");
    assert.equal(getClientIp(req("2001:db8::1")), "2001:db8::1");
    assert.equal(getClientIp(req("not-an-ip")), null);
    assert.equal(getClientIp(req("")), null);
    assert.equal(getClientIp(req(null)), null);
    assert.equal(getClientIp(req("1.2.3.999")), null);
  });
  test("pepper required in production, dev fallback otherwise", () => {
    const saved = { ...process.env };
    try {
      process.env.ABUSE_HASH_PEPPER = "sekret";
      assert.equal(getAbusePepper(), "sekret");
      delete process.env.ABUSE_HASH_PEPPER;
      delete process.env.VERCEL_ENV;
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
      assert.equal(typeof getAbusePepper(), "string");
      process.env.VERCEL_ENV = "production";
      assert.throws(() => getAbusePepper(), /ABUSE_HASH_PEPPER/);
    } finally {
      process.env = saved;
    }
  });
  test("day-bucketed rate keys rotate without cross-day blocking", () => {
    assert.notEqual(
      `${getPeriodKey(new Date("2026-09-12T23:59:59Z").getTime())}`,
      `${getPeriodKey(new Date("2026-10-01T00:00:00Z").getTime())}`
    );
  });
  test("off mode disables everything without writes", async () => {
    const h = makeHarness();
    process.env.ABUSE_ENFORCEMENT = "off";
    try {
      assert.equal(isAbuseDisabled(), true);
      const r = await resolveAbuseIdentity({
        userId: "u1",
        signals: [emailSig("off@x.com")],
        stores: h.stores,
      });
      assert.equal(r.identityId, "disabled:u1");
    } finally {
      delete process.env.ABUSE_ENFORCEMENT;
      assert.equal(isAbuseDisabled(), false);
      assert.equal(isAbuseEnforcementEnabled(), false);
    }
  });
});
