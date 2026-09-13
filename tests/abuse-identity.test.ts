import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDeviceCookie,
  canonicalizeEmail,
  checkAbuseRate,
  checkSocialLink,
  claimIdentityFree,
  deviceSetCookieHeader,
  dayKey,
  enforceFreeIdentityGate,
  evaluateRisk,
  gateNewSocialLink,
  getAbusePepper,
  getClientIp,
  getIdentityFreeUsage,
  hashRateKey,
  hashSignal,
  isAbuseDisabled,
  isAbuseEnforcementEnabled,
  isMissingTableError,
  isPaidActivePlan,
  isWithinCooldown,
  newDeviceId,
  parseDeviceCookie,
  recordDisconnect,
  resolveAbuseIdentity,
  deviceSignal,
  emailSignal,
  googleSignal,
  isDisposableEmail,
  socialSignal,
  syncIdentityFloor,
  DEVICE_COOKIE_NAME,
  type AbuseStores,
  type SignalInput,
} from "../src/lib/abuse";

const PEPPER = "test-pepper-123";

const savedEnv: Record<string, string | undefined> = {
  ABUSE_HASH_PEPPER: process.env.ABUSE_HASH_PEPPER,
  ABUSE_ENFORCEMENT: process.env.ABUSE_ENFORCEMENT,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const tick = () => new Promise<void>((done) => setImmediate(done));

type IdentityRow = {
  id: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "ABUSE";
  riskReason: string | null;
  lastLinkedAt: Date | null;
  lastSeenAt: Date | null;
  firstSeenAt: Date;
};

/**
 * In-memory stores mirroring the Prisma contracts, including atomicity:
 * uniqueness checks and conditional increments run synchronously (no
 * await between check and mutation), exactly like row-locked queries.
 */
function makeAbuseStores() {
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };
  const identities = new Map<string, IdentityRow>();
  const links = new Map<string, string>(); // userId -> identityId
  const signals = new Map<string, string>(); // "kind:hash" -> identityId
  const tombs = new Map<string, { identityId: string | null; deletedAt: Date }>();
  const freeUsage = new Map<string, number>(); // "identityId:period" -> count
  const postUsage = new Map<string, number>(); // "userId:period" -> count
  const buckets = new Map<
    string,
    { id: string; count: number; resetAt: number }
  >();

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
        // Foreign-key violation: the identity was merged away mid-flight.
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
      for (const signal of inputs) {
        signals.delete(`${signal.kind}:${signal.valueHash}`);
      }
    },
    mergeIdentities: async (winnerId, loserIds) => {
      await tick();
      for (const [userId, idn] of [...links.entries()]) {
        if (loserIds.includes(idn)) links.set(userId, winnerId);
      }
      for (const [key, idn] of [...signals.entries()]) {
        if (loserIds.includes(idn)) signals.set(key, winnerId);
      }
      // Carry consumed Free value as a SUM: winner and losers counted
      // disjoint user sets, so adding preserves the true total.
      for (const [key, count] of [...freeUsage.entries()]) {
        const [idn, period] = key.split(":");
        if (idn && loserIds.includes(idn) && period) {
          const winnerKey = `${winnerId}:${period}`;
          const current = freeUsage.get(winnerKey) ?? 0;
          freeUsage.set(winnerKey, current + count);
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
      if (row) {
        row.lastSeenAt = now;
      }
    },
    findTombstones: async (inputs) => {
      await tick();
      return inputs
        .map((signal) => {
          const key = `${signal.kind}:${signal.valueHash}`;
          const tomb = tombs.get(key);
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
          tombs.set(key, {
            identityId: row.identityId ?? null,
            deletedAt: new Date(),
          });
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
      return userIds.reduce(
        (sum, userId) => sum + (postUsage.get(`${userId}:${period}`) ?? 0),
        0
      );
    },
    rateTake: async (scope, keyHash, max, windowMs, nowMs) => {
      await tick();
      const key = `${scope}:${keyHash}`;
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= nowMs) {
        buckets.set(key, {
          id: nextId("bkt"),
          count: 1,
          resetAt: nowMs + windowMs,
        });
        return true;
      }
      if (bucket.count >= max) return false;
      bucket.count += 1;
      return true;
    },
  };

  return {
    stores,
    seedPostUsage: (userId: string, period: string, count: number) => {
      postUsage.set(`${userId}:${period}`, count);
    },
    readFreeUsage: (identityId: string, period: string) =>
      freeUsage.get(`${identityId}:${period}`) ?? null,
    unlinkUser: (userId: string) => {
      links.delete(userId);
    },
    pruneSignals: (hashes: { kind: string; valueHash: string }[]) => {
      for (const hash of hashes) signals.delete(`${hash.kind}:${hash.valueHash}`);
    },
    readRisk: (identityId: string) => identities.get(identityId)?.riskLevel,
    readLinkedAt: (identityId: string) =>
      identities.get(identityId)?.lastLinkedAt ?? null,
  };
}

function emailSig(email: string): SignalInput {
  return emailSignal(email, PEPPER);
}

describe("canonical email", () => {
  test("gmail dots and plus-tags collapse", () => {
    assert.equal(
      canonicalizeEmail("User.Name+shop@gmail.com"),
      "username@gmail.com"
    );
    assert.equal(
      canonicalizeEmail("u.s.e.r@gmail.com"),
      "user@gmail.com"
    );
    assert.equal(
      canonicalizeEmail("user@googlemail.com"),
      "user@gmail.com"
    );
  });
  test("yahoo dash-tags collapse, others only lowercase", () => {
    assert.equal(canonicalizeEmail("user-tag@yahoo.com"), "user@yahoo.com");
    assert.equal(
      canonicalizeEmail("User+Tag@Example.COM"),
      "user+tag@example.com"
    );
    assert.equal(canonicalizeEmail("  USER@Example.com "), "user@example.com");
  });
  test("malformed input passes through safely", () => {
    assert.equal(canonicalizeEmail("not-an-email"), "not-an-email");
    assert.equal(canonicalizeEmail(""), "");
  });
});

describe("disposable blocklist", () => {
  test("known providers and subdomains are blocked", () => {
    assert.equal(isDisposableEmail("a@tempmail.com"), true);
    assert.equal(isDisposableEmail("a@x.temp-mail.org"), true);
    assert.equal(isDisposableEmail("a@mailinator.com"), true);
  });
  test("legit domains pass, empty fails safe", () => {
    assert.equal(isDisposableEmail("a@gmail.com"), false);
    assert.equal(isDisposableEmail("a@company.example"), false);
    assert.equal(isDisposableEmail("not-an-email"), false);
    assert.equal(isDisposableEmail(""), false);
  });
});

describe("signal hashing", () => {
  test("deterministic and pepper-separated", () => {
    const first = hashSignal("email:a@x.com", PEPPER);
    assert.equal(first.valueHash, hashSignal("email:a@x.com", PEPPER).valueHash);
    assert.notEqual(
      first.valueHash,
      hashSignal("email:a@x.com", "other-pepper").valueHash
    );
    assert.notEqual(
      first.valueHash,
      hashSignal("email:a@x.com", PEPPER, 2).valueHash
    );
    assert.equal(first.valueHash.length, 64);
  });
  test("signal builders namespace their values", () => {
    assert.notEqual(
      emailSig("a@x.com").valueHash,
      googleSignal("a@x.com", PEPPER).valueHash
    );
    assert.notEqual(
      socialSignal("x", "123", PEPPER).valueHash,
      socialSignal("threads", "123", PEPPER).valueHash
    );
  });
  test("pepper resolution fails loud in production only", () => {
    process.env.ABUSE_HASH_PEPPER = "sekret";
    assert.equal(getAbusePepper(), "sekret");
    delete process.env.ABUSE_HASH_PEPPER;
    delete process.env.VERCEL_ENV;
    assert.equal(typeof getAbusePepper(), "string");
    process.env.VERCEL_ENV = "production";
    assert.throws(() => getAbusePepper(), /ABUSE_HASH_PEPPER/);
  });
  test("enforcement flag defaults to observe", () => {
    delete process.env.ABUSE_ENFORCEMENT;
    assert.equal(isAbuseEnforcementEnabled(), false);
    process.env.ABUSE_ENFORCEMENT = "enforce";
    assert.equal(isAbuseEnforcementEnabled(), true);
  });
});

describe("paid short-circuit", () => {
  test("active paid plans skip enforcement, free does not", () => {
    assert.equal(isPaidActivePlan("growth", "ACTIVE"), true);
    assert.equal(isPaidActivePlan("scale", "CANCELLING"), true);
    assert.equal(isPaidActivePlan("growth", "PAST_DUE"), true);
    assert.equal(isPaidActivePlan("free", "ACTIVE"), false);
    assert.equal(isPaidActivePlan("growth", "CANCELED"), false);
    assert.equal(isPaidActivePlan("scale", "EXPIRED"), false);
  });
});

describe("risk evaluation", () => {
  test("low by default, medium on tombstones or several users", () => {
    assert.deepEqual(
      evaluateRisk({ tombstoneHits: 0, linkedUserCount: 1, current: "LOW" }),
      { level: "LOW", reason: "no abuse signals" }
    );
    const medium = evaluateRisk({
      tombstoneHits: 1,
      linkedUserCount: 1,
      current: "LOW",
    });
    assert.equal(medium.level, "MEDIUM");
    assert.equal(
      evaluateRisk({ tombstoneHits: 0, linkedUserCount: 2, current: "LOW" })
        .level,
      "MEDIUM"
    );
    assert.equal(
      evaluateRisk({ tombstoneHits: 0, linkedUserCount: 5, current: "LOW" })
        .level,
      "HIGH"
    );
  });
  test("never auto-deescalates, never assigns ABUSE", () => {
    assert.equal(
      evaluateRisk({ tombstoneHits: 0, linkedUserCount: 1, current: "HIGH" })
        .level,
      "HIGH"
    );
    assert.equal(
      evaluateRisk({ tombstoneHits: 9, linkedUserCount: 9, current: "LOW" })
        .level !== "ABUSE",
      true
    );
  });
});

describe("identity resolution", () => {
  test("first user creates an identity, same email reuses it", async () => {
    const { stores } = makeAbuseStores();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("a@x.com")],
      stores,
    });
    assert.equal(first.created, true);
    assert.equal(first.tombstoneHits, 0);
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("a@x.com")],
      stores,
    });
    assert.equal(second.created, false);
    assert.equal(second.identityId, first.identityId);
    assert.equal(second.risk, "MEDIUM");
  });
  test("gmail aliases collapse into one identity", async () => {
    const { stores } = makeAbuseStores();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSignal("user.name@gmail.com", PEPPER)],
      stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSignal("username+shop@gmail.com", PEPPER)],
      stores,
    });
    assert.equal(second.identityId, first.identityId);
  });
  test("third user sharing two signals merges both identities", async () => {
    const { stores } = makeAbuseStores();
    const emailOnly = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("a@x.com")],
      stores,
    });
    const socialOnly = await resolveAbuseIdentity({
      userId: "u2",
      signals: [socialSignal("X", "ext-1", PEPPER)],
      stores,
    });
    assert.notEqual(emailOnly.identityId, socialOnly.identityId);
    const merged = await resolveAbuseIdentity({
      userId: "u3",
      signals: [emailSig("a@x.com"), socialSignal("X", "ext-1", PEPPER)],
      stores,
    });
    assert.equal(merged.merged, true);
    const again = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("a@x.com")],
      stores,
    });
    assert.equal(again.identityId, merged.identityId);
  });
  test("concurrent resolves with a shared signal make one identity", async () => {
    const { stores } = makeAbuseStores();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        resolveAbuseIdentity({
          userId: `u${index}`,
          signals: [socialSignal("X", "shared-ext", PEPPER)],
          stores,
        })
      )
    );
    assert.equal(new Set(results.map((r) => r.identityId)).size, 1);
  });
  test("tombstoned identity is a candidate: re-register inherits, flagged", async () => {
    const { stores } = makeAbuseStores();
    const original = await resolveAbuseIdentity({
      userId: "u1",
      signals: [
        emailSig("gone@x.com"),
        socialSignal("X", "ext-gone", PEPPER),
      ],
      stores,
    });
    // Re-register with the same social but a new email.
    const re = await resolveAbuseIdentity({
      userId: "u2",
      signals: [
        emailSig("fresh@x.com"),
        socialSignal("X", "ext-gone", PEPPER),
      ],
      stores,
    });
    // Live signal survived (signals are never deleted with the user).
    assert.equal(re.identityId, original.identityId);
    assert.equal(re.tombstoneHits, 0);
  });
  test("tombstone-only trail re-links the recorded identity after pruning", async () => {
    const { stores, pruneSignals, unlinkUser } = makeAbuseStores();
    const email = emailSig("pruned@x.com");
    const original = await resolveAbuseIdentity({
      userId: "u1",
      signals: [email],
      stores,
    });
    for (let index = 0; index < 15; index += 1) {
      await claimIdentityFree({
        identityId: original.identityId,
        userIds: ["u1"],
        period: "2026-09",
        monthStart: new Date("2026-09-01T00:00:00Z"),
        limit: 15,
        stores,
      });
    }
    // Simulate deletion + GDPR pruning: link and live signals gone,
    // tombstone (with identity) and the consumed ledger remain.
    unlinkUser("u1");
    pruneSignals([email]);
    await stores.writeTombstones([{ ...email, identityId: original.identityId }]);
    const re = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("pruned@x.com")],
      stores,
    });
    assert.equal(re.identityId, original.identityId);
    assert.equal(re.created, false);
    assert.ok(re.tombstoneHits > 0);
    assert.equal(re.risk, "MEDIUM");
    const retry = await claimIdentityFree({
      identityId: re.identityId,
      userIds: ["u2"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      limit: 15,
      stores,
    });
    assert.deepEqual(retry, { ok: false, observed: 15 });
  });
});

describe("identity free ledger", () => {
  test("first claim initializes from linked users, concurrent last slot wins once", async () => {
    const { stores, seedPostUsage, readFreeUsage } = makeAbuseStores();
    const resolution = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("a@x.com")],
      stores,
    });
    seedPostUsage("u1", "2026-09", 4);
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        claimIdentityFree({
          identityId: resolution.identityId,
          userIds: ["u1"],
          period: "2026-09",
          monthStart: new Date("2026-09-01T00:00:00Z"),
          limit: 15,
          stores,
        })
      )
    );
    // 4 consumed + 11 granted = 15; the 12th claim loses.
    assert.equal(results.filter((r) => r.ok).length, 11);
    assert.equal(results.filter((r) => !r.ok).length, 1);
    assert.equal(readFreeUsage(resolution.identityId, "2026-09"), 15);
  });
  test("second user of the same identity shares the exhausted allowance", async () => {
    const { stores, seedPostUsage } = makeAbuseStores();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("shared@x.com")],
      stores,
    });
    seedPostUsage("u1", "2026-09", 15);
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("shared@x.com")],
      stores,
    });
    assert.equal(second.identityId, first.identityId);
    const claim = await claimIdentityFree({
      identityId: second.identityId,
      userIds: ["u1", "u2"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      limit: 15,
      stores,
    });
    assert.deepEqual(claim, { ok: false, observed: 15 });
  });
  test("delete then re-register keeps consumed value (no fresh quota)", async () => {
    const { stores, seedPostUsage, readFreeUsage, unlinkUser } =
      makeAbuseStores();
    const social = socialSignal("X", "ext-cycle", PEPPER);
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("cycle@x.com"), social],
      stores,
    });
    seedPostUsage("u1", "2026-09", 15);
    // First claim initializes the identity ledger from linked usage.
    const warm = await claimIdentityFree({
      identityId: first.identityId,
      userIds: ["u1"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      limit: 15,
      stores,
    });
    assert.deepEqual(warm, { ok: false, observed: 15 });
    // Simulate full account deletion: link row gone (cascade), ledger stays.
    unlinkUser("u1");
    // Tombstone the freed bindings with the old identity.
    await stores.writeTombstones([
      { ...social, identityId: first.identityId },
      { ...emailSig("cycle@x.com"), identityId: first.identityId },
    ]);
    // Re-register: new email, same social account.
    const re = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("brand-new@x.com"), social],
      stores,
    });
    assert.equal(re.identityId, first.identityId);
    assert.equal(re.tombstoneHits, 1);
    assert.equal(re.risk, "MEDIUM");
    assert.equal(readFreeUsage(re.identityId, "2026-09"), 15);
    const retry = await claimIdentityFree({
      identityId: re.identityId,
      userIds: ["u2"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      limit: 15,
      stores,
    });
    assert.deepEqual(retry, { ok: false, observed: 15 });
  });
  test("two linked users racing the last unit grant exactly one", async () => {
    const { stores, seedPostUsage } = makeAbuseStores();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("race@x.com")],
      stores,
    });
    await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("race@x.com")],
      stores,
    });
    seedPostUsage("u1", "2026-09", 14);
    const results = await Promise.all([
      claimIdentityFree({
        identityId: first.identityId,
        userIds: ["u1", "u2"],
        period: "2026-09",
        monthStart: new Date("2026-09-01T00:00:00Z"),
        limit: 15,
        stores,
      }),
      claimIdentityFree({
        identityId: first.identityId,
        userIds: ["u1", "u2"],
        period: "2026-09",
        monthStart: new Date("2026-09-01T00:00:00Z"),
        limit: 15,
        stores,
      }),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
  });
  test("merge carries the loser's consumed value", async () => {
    const { stores, readFreeUsage } = makeAbuseStores();
    const emailOnly = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("m1@x.com")],
      stores,
    });
    const socialOnly = await resolveAbuseIdentity({
      userId: "u2",
      signals: [socialSignal("X", "ext-m", PEPPER)],
      stores,
    });
    // Loser consumes 10 before the merge.
    const loserClaim = await claimIdentityFree({
      identityId: socialOnly.identityId,
      userIds: ["u2"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      limit: 15,
      stores,
    });
    void loserClaim;
    for (let index = 0; index < 9; index += 1) {
      await claimIdentityFree({
        identityId: socialOnly.identityId,
        userIds: ["u2"],
        period: "2026-09",
        monthStart: new Date("2026-09-01T00:00:00Z"),
        limit: 15,
        stores,
      });
    }
    assert.equal(readFreeUsage(socialOnly.identityId, "2026-09"), 10);
    const merged = await resolveAbuseIdentity({
      userId: "u3",
      signals: [emailSig("m1@x.com"), socialSignal("X", "ext-m", PEPPER)],
      stores,
    });
    assert.equal(merged.merged, true);
    assert.equal(
      merged.identityId,
      emailOnly.identityId,
      "deterministic identity wins the merge"
    );
    assert.equal(
      readFreeUsage(merged.identityId, "2026-09"),
      10,
      "merged ledger keeps the consumed value"
    );
    const converged = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("m1@x.com")],
      stores,
    });
    assert.equal(converged.identityId, merged.identityId);
  });
});

describe("social link gate", () => {
  type LinkOverrides = {
    userId?: string;
    userEmail?: string | null;
    platform?: string;
    externalId?: string;
    deviceId?: string | null;
    isPaid?: boolean;
    enforce?: boolean;
  };
  async function linkWith(stores: AbuseStores, overrides: LinkOverrides = {}) {
    return checkSocialLink({
      userId: "u1",
      userEmail: "u1@x.com",
      platform: "X",
      externalId: "ext-1",
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      ...overrides,
    });
  }
  test("fresh link on a clean identity is allowed", async () => {
    const { stores } = makeAbuseStores();
    const decision = await linkWith(stores);
    assert.deepEqual(decision.ok, true);
  });
  test("same external id on another live user is in use", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkWith(stores, { userId: "u1" });
    assert.equal(first.ok, true);
    const second = await linkWith(stores, {
      userId: "u2",
      userEmail: "u2@x.com",
    });
    assert.deepEqual(second, {
      ok: false,
      code: "ACCOUNT_IN_USE",
      reason: "This social account is already connected to another Postvia user.",
    });
  });
  test("orphaned signal merges and inherits consumed value", async () => {
    const { stores, readFreeUsage, unlinkUser } = makeAbuseStores();
    const social = socialSignal("X", "ext-orphan", PEPPER);
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("gone2@x.com"), social],
      stores,
    });
    // Consume 7 on the old identity, then delete the user (links gone).
    for (let index = 0; index < 7; index += 1) {
      await claimIdentityFree({
        identityId: first.identityId,
        userIds: ["u1"],
        period: "2026-09",
        monthStart: new Date("2026-09-01T00:00:00Z"),
        limit: 15,
        stores,
      });
    }
    unlinkUser("u1");
    await stores.writeTombstones([
      { ...social, identityId: first.identityId },
    ]);
    const decision = await linkWith(stores, {
      userId: "u2",
      userEmail: "fresh2@x.com",
      platform: "X",
      externalId: "ext-orphan",
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.identityId, first.identityId);
      assert.equal(readFreeUsage(first.identityId, "2026-09"), 7);
    }
  });
  test("paid users always pass and never get throttled", async () => {
    const { stores } = makeAbuseStores();
    const decision = await linkWith(stores, { isPaid: true });
    assert.equal(decision.ok, true);
  });
  test("ABUSE denies, HIGH needs review, MEDIUM cools down", async () => {
    const { stores } = makeAbuseStores();
    const resolution = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("risky@x.com")],
      stores,
    });
    await stores.setRisk(resolution.identityId, "ABUSE", "manual");
    const denied = await linkWith(stores, {
      platform: "THREADS",
      externalId: "ext-t",
    });
    assert.deepEqual(denied.ok, false);
    await stores.setRisk(resolution.identityId, "HIGH", "test");
    const review = await linkWith(stores, {
      platform: "THREADS",
      externalId: "ext-t2",
    });
    assert.deepEqual(review, {
      ok: false,
      code: "UNDER_REVIEW",
      reason: "New connections are under review. Contact support.",
    });
    await stores.setRisk(resolution.identityId, "MEDIUM", "test");
    await stores.touchLinked(resolution.identityId, new Date());
    const cooled = await linkWith(stores, {
      platform: "THREADS",
      externalId: "ext-t3",
    });
    assert.deepEqual(cooled, {
      ok: false,
      code: "COOLDOWN",
      reason: "Too many recent connections. Please try again tomorrow.",
    });
  });
  test("observe mode allows with a would-deny log", async () => {
    const { stores } = makeAbuseStores();
    const resolution = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("obs@x.com")],
      stores,
    });
    await stores.setRisk(resolution.identityId, "ABUSE", "manual");
    const decision = await linkWith(stores, {
      platform: "X",
      externalId: "ext-obs",
      enforce: false,
    });
    assert.equal(decision.ok, true);
  });
});

describe("gate composition", () => {
  test("maps decisions to redirect codes and fails open on store errors", async () => {
    const { stores } = makeAbuseStores();
    const ok = await gateNewSocialLink({
      userId: "u1",
      userEmail: "u1@x.com",
      platform: "X",
      externalId: "ext-1",
      deviceCookieHeader: null,
      isPaid: false,
      stores,
      pepper: PEPPER,
      enforce: true,
    });
    assert.deepEqual(ok, { ok: true });
    const broken: AbuseStores = {
      ...stores,
      findSignalOwners: async () => {
        throw new Error("db down");
      },
    };
    const allowed = await gateNewSocialLink({
      userId: "u1",
      userEmail: "u1@x.com",
      platform: "X",
      externalId: "ext-1",
      deviceCookieHeader: null,
      isPaid: false,
      stores: broken,
      pepper: PEPPER,
      enforce: true,
    });
    assert.deepEqual(allowed, { ok: true });
  });
  test("device cookie is parsed into signals", () => {
    assert.equal(parseDeviceCookie(null), null);
    assert.equal(parseDeviceCookie("other=1"), null);
    assert.equal(parseDeviceCookie("pv_did=abc123XYZ-_012345"), "abc123XYZ-_012345");
    assert.equal(parseDeviceCookie("abc123XYZ-_012345"), "abc123XYZ-_012345");
    assert.equal(parseDeviceCookie("pv_did=short"), null);
    assert.equal(parseDeviceCookie("pv_did=has space"), null);
    const id = newDeviceId();
    assert.match(id, /^[A-Za-z0-9_-]{16,64}$/);
    const header = deviceSetCookieHeader(id, true);
    assert.ok(header.includes(`${DEVICE_COOKIE_NAME}=${id}`));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("Secure"));
  });
  test("client ip prefers the first forwarded entry", () => {
    const forwarded = new Request("https://postvia.online/", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
    });
    assert.equal(getClientIp(forwarded), "203.0.113.7");
    const real = new Request("https://postvia.online/", {
      headers: { "x-real-ip": "198.51.100.9" },
    });
    assert.equal(getClientIp(real), "198.51.100.9");
    assert.equal(getClientIp(new Request("https://postvia.online/")), null);
  });
  test("day keys are UTC calendar days", () => {
    assert.equal(dayKey(new Date("2026-09-12T23:59:59Z").getTime()), "2026-09-12");
    assert.equal(dayKey(new Date("2026-09-13T00:00:01Z").getTime()), "2026-09-13");
  });
});

describe("persistent rate limiting", () => {
  test("allows up to max, denies after, resets after the window", async () => {
    const { stores } = makeAbuseStores();
    const input = {
      scope: "signup",
      keyHash: "k1",
      max: 3,
      windowMs: 60_000,
      stores,
    };
    assert.equal(await checkAbuseRate({ ...input, nowMs: 1_000 }), true);
    assert.equal(await checkAbuseRate({ ...input, nowMs: 2_000 }), true);
    assert.equal(await checkAbuseRate({ ...input, nowMs: 3_000 }), true);
    assert.equal(await checkAbuseRate({ ...input, nowMs: 4_000 }), false);
    assert.equal(await checkAbuseRate({ ...input, nowMs: 61_001 }), true);
  });
  test("scopes and keys are isolated, races grant exactly max", async () => {
    const { stores } = makeAbuseStores();
    assert.equal(
      await checkAbuseRate({
        scope: "a",
        keyHash: "k",
        max: 1,
        windowMs: 60_000,
        stores,
        nowMs: 1000,
      }),
      true
    );
    assert.equal(
      await checkAbuseRate({
        scope: "b",
        keyHash: "k",
        max: 1,
        windowMs: 60_000,
        stores,
        nowMs: 1000,
      }),
      true
    );
    const racing = await Promise.all(
      Array.from({ length: 6 }, () =>
        checkAbuseRate({
          scope: "race",
          keyHash: "k",
          max: 3,
          windowMs: 60_000,
          stores,
          nowMs: 1000,
        })
      )
    );
    assert.equal(racing.filter(Boolean).length, 3);
  });
  test("rate key hashing is deterministic and pepper-separated", () => {
    assert.equal(
      hashRateKey(["a", "b"], PEPPER),
      hashRateKey(["a", "b"], PEPPER)
    );
    assert.notEqual(
      hashRateKey(["a", "b"], PEPPER),
      hashRateKey(["a", "b"], "other")
    );
    assert.notEqual(
      hashRateKey(["a", "b"], PEPPER),
      hashRateKey(["a", "c"], PEPPER)
    );
  });
});

describe("device signal is secondary (never merges strangers)", () => {
  test("shared device cookie does NOT merge two independent users", async () => {
    const { stores } = makeAbuseStores();
    const device = deviceSignal(newDeviceId(), PEPPER);
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("d1@x.com"), device],
      stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("d2@x.com"), device],
      stores,
    });
    // Family / office / library sharing one machine: distinct humans keep
    // distinct identities and distinct Free allowances.
    assert.notEqual(second.identityId, first.identityId);
    // The device is still recorded as supporting evidence on the first
    // identity (risk/rate-limit use), not as an ownership edge.
    const owners = await stores.findSignalOwners([device]);
    assert.ok(owners.some((o) => o.identityId === first.identityId));
  });
  test("floor sync raises to linked usage, never lowers", async () => {
    const { stores, seedPostUsage, readFreeUsage } = makeAbuseStores();
    const resolution = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("floor@x.com")],
      stores,
    });
    seedPostUsage("u1", "2026-09", 9);
    await syncIdentityFloor({
      identityId: resolution.identityId,
      userIds: ["u1"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      stores,
    });
    assert.equal(readFreeUsage(resolution.identityId, "2026-09"), 9);
    seedPostUsage("u1", "2026-09", 4);
    await syncIdentityFloor({
      identityId: resolution.identityId,
      userIds: ["u1"],
      period: "2026-09",
      monthStart: new Date("2026-09-01T00:00:00Z"),
      stores,
    });
    assert.equal(readFreeUsage(resolution.identityId, "2026-09"), 9);
  });
  test("device cookie is set once and kept afterwards", async () => {
    const { NextResponse } = await import("next/server");
    const request = new Request("https://postvia.online/api/auth/x/connect");
    const fresh = applyDeviceCookie(NextResponse.json({}), request, null);
    const setCookie = fresh.headers.get("set-cookie") ?? "";
    assert.ok(setCookie.includes(`${DEVICE_COOKIE_NAME}=`));
    assert.ok(setCookie.includes("HttpOnly"));
    const kept = applyDeviceCookie(
      NextResponse.json({}),
      request,
      parseDeviceCookie(setCookie.split(";")[0] ?? null)
    );
    assert.equal(kept.headers.get("set-cookie"), null);
  });
});

describe("cooldowns", () => {  test("isWithinCooldown honors the window", () => {
    const now = 1_000_000;
    assert.equal(isWithinCooldown(null, 1000, now), false);
    assert.equal(isWithinCooldown(now - 500, 1000, now), true);
    assert.equal(isWithinCooldown(now - 1000, 1000, now), false);
    assert.equal(isWithinCooldown(now - 5000, 1000, now), false);
  });
});

const MONTH_START = new Date("2026-09-01T00:00:00Z");

function claimParams(
  identityId: string,
  userIds: string[],
  stores: AbuseStores
) {
  return {
    identityId,
    userIds,
    period: "2026-09",
    monthStart: MONTH_START,
    limit: 15,
    stores,
  };
}

describe("sum-based identity floor (3 + 12 = 15)", () => {
  test("linked users floor at the sum, next claim is denied", async () => {
    const { stores, seedPostUsage } = makeAbuseStores();
    const first = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("sum-a@x.com")],
      stores,
    });
    const second = await resolveAbuseIdentity({
      userId: "u2",
      signals: [emailSig("sum-a@x.com")],
      stores,
    });
    assert.equal(second.identityId, first.identityId);
    seedPostUsage("u1", "2026-09", 3);
    seedPostUsage("u2", "2026-09", 12);
    const denied = await claimIdentityFree(
      claimParams(first.identityId, ["u1", "u2"], stores)
    );
    assert.deepEqual(denied, { ok: false, observed: 15 });
  });
  test("merge sums disjoint consumption instead of max", async () => {
    const { stores, readFreeUsage } = makeAbuseStores();
    const emailOnly = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("s1@x.com")],
      stores,
    });
    const socialOnly = await resolveAbuseIdentity({
      userId: "u2",
      signals: [socialSignal("X", "ext-s", PEPPER)],
      stores,
    });
    for (let index = 0; index < 5; index += 1) {
      await claimIdentityFree(
        claimParams(emailOnly.identityId, ["u1"], stores)
      );
    }
    for (let index = 0; index < 7; index += 1) {
      await claimIdentityFree(
        claimParams(socialOnly.identityId, ["u2"], stores)
      );
    }
    const merged = await resolveAbuseIdentity({
      userId: "u3",
      signals: [emailSig("s1@x.com"), socialSignal("X", "ext-s", PEPPER)],
      stores,
    });
    assert.equal(merged.merged, true);
    assert.equal(readFreeUsage(merged.identityId, "2026-09"), 12);
    const denied = await claimIdentityFree(
      claimParams(merged.identityId, ["u1", "u2", "u3"], stores)
    );
    // 5 + 7 consumed, 3 left of 15.
    assert.deepEqual(denied, { ok: true });
    assert.equal(readFreeUsage(merged.identityId, "2026-09"), 13);
  });
});

describe("disconnect and re-link flows", () => {
  async function linkX(
    stores: AbuseStores,
    userId: string,
    userEmail: string,
    externalId: string,
    extra: Record<string, unknown> = {}
  ) {
    return checkSocialLink({
      userId,
      userEmail,
      platform: "X",
      externalId,
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      ...extra,
    });
  }
  test("disconnect then re-link by a new user inherits consumed quota (no fresh allowance)", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkX(stores, "u1", "hand-a@x.com", "ext-hand");
    assert.equal(first.ok, true);
    if (first.ok) {
      for (let index = 0; index < 7; index += 1) {
        await claimIdentityFree(
          claimParams(first.identityId, ["u1"], stores)
        );
      }
    }
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-hand",
      pepper: PEPPER,
      stores,
    });
    // New user, new email, no shared device: same social identity, so the
    // consumed Free value is inherited instead of re-granted.
    const second = await linkX(stores, "u2", "hand-b@x.com", "ext-hand");
    assert.equal(second.ok, true);
    if (second.ok && first.ok) {
      assert.equal(second.identityId, first.identityId);
      // 7 inherited + 8 more = 15, then denied.
      for (let index = 0; index < 8; index += 1) {
        const grant = await claimIdentityFree(
          claimParams(second.identityId, ["u1", "u2"], stores)
        );
        assert.deepEqual(grant, { ok: true });
      }
      const exhausted = await claimIdentityFree(
        claimParams(second.identityId, ["u1", "u2"], stores)
      );
      assert.deepEqual(exhausted, { ok: false, observed: 15 });
    }
  });
  test("same human (shared device) re-linking inherits consumed value", async () => {
    const { stores } = makeAbuseStores();
    const device = `pv_did=${newDeviceId()}`;
    const first = await checkSocialLink({
      userId: "u1",
      userEmail: "same-a@x.com",
      platform: "X",
      externalId: "ext-same",
      deviceId: parseDeviceCookie(device),
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
    });
    assert.equal(first.ok, true);
    if (first.ok) {
      for (let index = 0; index < 7; index += 1) {
        await claimIdentityFree(
          claimParams(first.identityId, ["u1"], stores)
        );
      }
    }
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-same",
      pepper: PEPPER,
      stores,
    });
    const second = await checkSocialLink({
      userId: "u2",
      userEmail: "same-b@x.com",
      platform: "X",
      externalId: "ext-same",
      deviceId: parseDeviceCookie(device),
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
    });
    assert.equal(second.ok, true);
    if (second.ok && first.ok) {
      assert.equal(second.identityId, first.identityId);
      const denied = await claimIdentityFree(
        claimParams(second.identityId, ["u1", "u2"], stores)
      );
      // 7 inherited + 8 more = 15, then denied.
      for (let index = 0; index < 7; index += 1) {
        await claimIdentityFree(
          claimParams(second.identityId, ["u1", "u2"], stores)
        );
      }
      const exhausted = await claimIdentityFree(
        claimParams(second.identityId, ["u1", "u2"], stores)
      );
      assert.deepEqual(denied, { ok: true });
      assert.deepEqual(exhausted, { ok: false, observed: 15 });
    }
  });
  test("own reconnect after disconnect keeps working", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkX(stores, "u1", "own@x.com", "ext-own");
    assert.equal(first.ok, true);
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-own",
      pepper: PEPPER,
      stores,
    });
    const retry = await linkX(stores, "u1", "own@x.com", "ext-own");
    assert.equal(retry.ok, true);
    if (retry.ok && first.ok) {
      assert.equal(retry.identityId, first.identityId);
    }
  });
  test("exhausted quota stays exhausted for the next user of the same social identity", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkX(stores, "u1", "full-a@x.com", "ext-full");
    assert.equal(first.ok, true);
    if (first.ok) {
      for (let index = 0; index < 15; index += 1) {
        await claimIdentityFree(
          claimParams(first.identityId, ["u1"], stores)
        );
      }
    }
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-full",
      pepper: PEPPER,
      stores,
    });
    const second = await linkX(stores, "u2", "full-b@x.com", "ext-full");
    assert.equal(second.ok, true);
    if (second.ok && first.ok) {
      assert.equal(second.identityId, first.identityId);
      const denied = await claimIdentityFree(
        claimParams(second.identityId, ["u1", "u2"], stores)
      );
      assert.deepEqual(denied, { ok: false, observed: 15 });
    }
  });
  test("reverse order shares the same quota (second linker inherits)", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkX(stores, "u2", "rev-b@x.com", "ext-rev");
    assert.equal(first.ok, true);
    if (first.ok) {
      for (let index = 0; index < 5; index += 1) {
        await claimIdentityFree(
          claimParams(first.identityId, ["u2"], stores)
        );
      }
    }
    await recordDisconnect({
      userId: "u2",
      platform: "X",
      externalId: "ext-rev",
      pepper: PEPPER,
      stores,
    });
    const second = await linkX(stores, "u1", "rev-a@x.com", "ext-rev");
    assert.equal(second.ok, true);
    if (second.ok && first.ok) {
      assert.equal(second.identityId, first.identityId);
      for (let index = 0; index < 10; index += 1) {
        const grant = await claimIdentityFree(
          claimParams(second.identityId, ["u1", "u2"], stores)
        );
        assert.deepEqual(grant, { ok: true });
      }
      const exhausted = await claimIdentityFree(
        claimParams(second.identityId, ["u1", "u2"], stores)
      );
      assert.deepEqual(exhausted, { ok: false, observed: 15 });
    }
  });
  test("a different social externalId still starts its own allowance", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkX(stores, "u1", "dif-a@x.com", "ext-dif-a");
    assert.equal(first.ok, true);
    if (first.ok) {
      for (let index = 0; index < 7; index += 1) {
        await claimIdentityFree(
          claimParams(first.identityId, ["u1"], stores)
        );
      }
    }
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-dif-a",
      pepper: PEPPER,
      stores,
    });
    const second = await linkX(stores, "u2", "dif-b@x.com", "ext-dif-b");
    assert.equal(second.ok, true);
    if (second.ok && first.ok) {
      assert.notEqual(second.identityId, first.identityId);
      const fresh = await claimIdentityFree(
        claimParams(second.identityId, ["u2"], stores)
      );
      assert.deepEqual(fresh, { ok: true });
    }
  });
  for (const platform of ["THREADS", "X", "INSTAGRAM", "TIKTOK"]) {
    test(`disconnect + new-user re-link inherits quota on ${platform}`, async () => {
      const { stores } = makeAbuseStores();
      const ext = `ext-shared-${platform.toLowerCase()}`;
      const first = await linkX(stores, "u1", `plat-a-${platform}@x.com`, ext, {
        platform,
      });
      assert.equal(first.ok, true);
      if (first.ok) {
        for (let index = 0; index < 7; index += 1) {
          await claimIdentityFree(
            claimParams(first.identityId, ["u1"], stores)
          );
        }
      }
      await recordDisconnect({
        userId: "u1",
        platform,
        externalId: ext,
        pepper: PEPPER,
        stores,
      });
      const second = await linkX(stores, "u2", `plat-b-${platform}@x.com`, ext, {
        platform,
      });
      assert.equal(second.ok, true);
      if (second.ok && first.ok) {
        assert.equal(second.identityId, first.identityId);
        for (let index = 0; index < 8; index += 1) {
          const grant = await claimIdentityFree(
            claimParams(second.identityId, ["u1", "u2"], stores)
          );
          assert.deepEqual(grant, { ok: true });
        }
        const exhausted = await claimIdentityFree(
          claimParams(second.identityId, ["u1", "u2"], stores)
        );
        assert.deepEqual(exhausted, { ok: false, observed: 15 });
      }
    });
  }
  test("concurrent re-links after disconnect converge to one shared identity", async () => {
    const { stores } = makeAbuseStores();
    const first = await linkX(stores, "u1", "race-a@x.com", "ext-race");
    assert.equal(first.ok, true);
    if (first.ok) {
      for (let index = 0; index < 7; index += 1) {
        await claimIdentityFree(
          claimParams(first.identityId, ["u1"], stores)
        );
      }
    }
    await recordDisconnect({
      userId: "u1",
      platform: "X",
      externalId: "ext-race",
      pepper: PEPPER,
      stores,
    });
    const [b, c] = await Promise.all([
      linkX(stores, "u2", "race-b@x.com", "ext-race"),
      linkX(stores, "u3", "race-c@x.com", "ext-race"),
    ]);
    assert.equal(b.ok, true);
    assert.equal(c.ok, true);
    if (b.ok && c.ok && first.ok) {
      // Deterministic convergence: both racers land in the surviving
      // identity, so the ledger is shared, never doubled.
      assert.equal(b.identityId, c.identityId);
      assert.equal(b.identityId, first.identityId);
      for (let index = 0; index < 8; index += 1) {
        const grant = await claimIdentityFree(
          claimParams(b.identityId, ["u1", "u2", "u3"], stores)
        );
        assert.deepEqual(grant, { ok: true });
      }
      const exhausted = await claimIdentityFree(
        claimParams(b.identityId, ["u1", "u2", "u3"], stores)
      );
      assert.deepEqual(exhausted, { ok: false, observed: 15 });
    }
  });
});

describe("email change", () => {
  test("new email merges into the same identity, both resolve there", async () => {
    const { stores } = makeAbuseStores();
    const before = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("old@x.com")],
      stores,
    });
    // Simulates user.update.after: attach the changed address.
    const after = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("new@x.com")],
      stores,
    });
    assert.equal(after.merged, true);
    assert.equal(after.identityId, before.identityId);
    const lookup = await resolveAbuseIdentity({
      userId: "u9",
      signals: [emailSig("old@x.com")],
      stores,
    });
    assert.equal(lookup.identityId, before.identityId);
  });
  test("disposable check covers changed addresses too", () => {
    assert.equal(isDisposableEmail("fresh@tempmail.com"), true);
    assert.equal(
      canonicalizeEmail("Fresh.Alias+1@Gmail.Com"),
      "freshalias@gmail.com"
    );
  });
});

describe("transient failure fallback", () => {
  test("isMissingTableError matches only P2021", () => {
    const p2021 = new Error("table") as Error & { code?: string };
    p2021.code = "P2021";
    assert.equal(isMissingTableError(p2021), true);
    const timeout = new Error("timeout") as Error & { code?: string };
    timeout.code = "P2031";
    assert.equal(isMissingTableError(timeout), false);
    assert.equal(isMissingTableError(new Error("boom")), false);
    assert.equal(isMissingTableError(null), false);
  });
  function gateParams(
    stores: AbuseStores,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      userId: "u1",
      email: "gate@x.com",
      limit: 15,
      enforce: true,
      pepper: PEPPER,
      period: "2026-09",
      monthStart: MONTH_START,
      stores,
      ...overrides,
    };
  }
  test("P2021 fails closed and loud", async () => {
    const { stores } = makeAbuseStores();
    const broken: AbuseStores = {
      ...stores,
      findSignalOwners: async () => {
        const err = new Error("no such table") as Error & { code?: string };
        err.code = "P2021";
        throw err;
      },
    };
    await assert.rejects(
      () => enforceFreeIdentityGate(gateParams(broken)),
      /no such table/
    );
  });
  test("transient errors degrade to PostUsage-only fallback", async () => {
    const { stores } = makeAbuseStores();
    const flaky: AbuseStores = {
      ...stores,
      findSignalOwners: async () => {
        throw new Error("connection reset");
      },
    };
    const result = await enforceFreeIdentityGate(gateParams(flaky));
    assert.deepEqual(result, {
      ok: true,
      identityId: null,
      fallback: true,
    });
  });
  test("ABUSE denies in enforce, allows in observe", async () => {
    const { stores } = makeAbuseStores();
    const resolution = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("abuse-gate@x.com")],
      stores,
    });
    await stores.setRisk(resolution.identityId, "ABUSE", "manual");
    // Risk is read from the stored identity on the next gate call.
    const denied = await enforceFreeIdentityGate({
      ...gateParams(stores),
      userId: "u1",
      email: "abuse-gate@x.com",
    });
    assert.deepEqual(denied, { ok: false, code: "RESTRICTED" });
    const observed = await enforceFreeIdentityGate({
      ...gateParams(stores),
      userId: "u1",
      email: "abuse-gate@x.com",
      enforce: false,
    });
    assert.equal(observed.ok, true);
  });
});

describe("off/observe/enforce modes", () => {
  test("isAbuseDisabled follows the flag", () => {
    delete process.env.ABUSE_ENFORCEMENT;
    assert.equal(isAbuseDisabled(), false);
    process.env.ABUSE_ENFORCEMENT = "off";
    assert.equal(isAbuseDisabled(), true);
    process.env.ABUSE_ENFORCEMENT = "enforce";
    assert.equal(isAbuseDisabled(), false);
  });
  test("off mode writes nothing and allows everything", async () => {
    const { stores, readFreeUsage, readRisk } = makeAbuseStores();
    const resolved = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("off@x.com")],
      stores,
      disabled: true,
    });
    assert.equal(resolved.identityId, "disabled:u1");
    const claimed = await claimIdentityFree({
      identityId: "whatever",
      userIds: ["u1"],
      period: "2026-09",
      monthStart: MONTH_START,
      limit: 15,
      stores,
      disabled: true,
    });
    assert.deepEqual(claimed, { ok: true });
    const linked = await checkSocialLink({
      userId: "u1",
      userEmail: "off@x.com",
      platform: "X",
      externalId: "ext-off",
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      disabled: true,
    });
    assert.equal(linked.ok, true);
    assert.equal(
      await checkAbuseRate({
        scope: "s",
        keyHash: "k",
        max: 1,
        windowMs: 1000,
        stores,
        disabled: true,
      }),
      true
    );
    const gated = await enforceFreeIdentityGate({
      userId: "u1",
      email: "off@x.com",
      limit: 15,
      enforce: true,
      pepper: PEPPER,
      period: "2026-09",
      monthStart: MONTH_START,
      stores,
      disabled: true,
    });
    assert.deepEqual(gated, { ok: true, identityId: null });
    assert.equal(readFreeUsage("whatever", "2026-09"), null);
    assert.equal(
      await stores.findIdentityIdByUser("u1"),
      null
    );
    assert.equal(readRisk("whatever"), undefined);
  });
});

describe("seen vs linked touches (cooldown regression)", () => {
  test("ordinary resolves do not extend the MEDIUM cooldown", async () => {
    const { stores, readLinkedAt } = makeAbuseStores();
    const base = new Date("2026-09-01T12:00:00Z").getTime();
    const resolution = await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("cool@x.com")],
      stores,
      nowMs: base,
    });
    await stores.setRisk(resolution.identityId, "MEDIUM", "test");
    await stores.touchLinked(
      resolution.identityId,
      new Date(base)
    );
    // Steady-state activity (post creates resolve the identity): only
    // lastSeenAt moves, lastLinkedAt stays frozen.
    await resolveAbuseIdentity({
      userId: "u1",
      signals: [emailSig("cool@x.com")],
      stores,
      nowMs: base + 25 * 3_600_000,
    });
    assert.deepEqual(
      readLinkedAt(resolution.identityId)?.getTime(),
      base
    );
    // Past the 24h cooldown a new link is allowed again.
    const allowed = await checkSocialLink({
      userId: "u1",
      userEmail: "cool@x.com",
      platform: "THREADS",
      externalId: "ext-cool",
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      nowMs: base + 25 * 3_600_000,
    });
    assert.equal(allowed.ok, true);
  });
});

describe("identity free usage read (display path, strictly read-only)", () => {
  function readParams(stores: AbuseStores) {
    return {
      period: "2026-09",
      monthStart: MONTH_START,
      stores,
    };
  }
  async function link(
    stores: AbuseStores,
    userId: string,
    userEmail: string,
    externalId: string
  ) {
    return checkSocialLink({
      userId,
      userEmail,
      platform: "THREADS",
      externalId,
      deviceId: null,
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
    });
  }
  test("usage follows claims on one identity", async () => {
    const { stores } = makeAbuseStores();
    const first = await link(stores, "u1", "r-a@x.com", "ext-r");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    for (let index = 0; index < 2; index += 1) {
      await claimIdentityFree(claimParams(first.identityId, ["u1"], stores));
    }
    assert.deepEqual(await getIdentityFreeUsage({
      userId: "u1",
      ...readParams(stores),
    }), { identityId: first.identityId, used: 2 });
  });
  test("new user on the same social identity reads the shared usage", async () => {
    const { stores } = makeAbuseStores();
    const first = await link(stores, "u1", "s-a@x.com", "ext-shared");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    for (let index = 0; index < 2; index += 1) {
      await claimIdentityFree(claimParams(first.identityId, ["u1"], stores));
    }
    await recordDisconnect({
      userId: "u1",
      platform: "THREADS",
      externalId: "ext-shared",
      pepper: PEPPER,
      stores,
    });
    const second = await link(stores, "u2", "s-b@x.com", "ext-shared");
    assert.equal(second.ok, true);
    if (!second.ok || !first.ok) return;
    assert.equal(second.identityId, first.identityId);
    assert.deepEqual(await getIdentityFreeUsage({
      userId: "u2",
      ...readParams(stores),
    }), { identityId: first.identityId, used: 2 });
    // And the shared read tracks further claims by either user.
    await claimIdentityFree(
      claimParams(first.identityId, ["u1", "u2"], stores)
    );
    assert.deepEqual(await getIdentityFreeUsage({
      userId: "u2",
      ...readParams(stores),
    }), { identityId: first.identityId, used: 3 });
  });
  test("exhausted identity reads 15", async () => {
    const { stores } = makeAbuseStores();
    const first = await link(stores, "u1", "e-a@x.com", "ext-full");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    for (let index = 0; index < 15; index += 1) {
      await claimIdentityFree(claimParams(first.identityId, ["u1"], stores));
    }
    assert.deepEqual(await getIdentityFreeUsage({
      userId: "u1",
      ...readParams(stores),
    }), { identityId: first.identityId, used: 15 });
  });
  test("different identity stays independent; unknown user reads zero", async () => {
    const { stores } = makeAbuseStores();
    const first = await link(stores, "u1", "d-a@x.com", "ext-one");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    await claimIdentityFree(claimParams(first.identityId, ["u1"], stores));
    const other = await link(stores, "u9", "d-b@x.com", "ext-two");
    assert.equal(other.ok, true);
    assert.deepEqual(await getIdentityFreeUsage({
      userId: "u9",
      ...readParams(stores),
    }), {
      identityId: other.ok ? other.identityId : null,
      used: 0,
    });
    assert.deepEqual(await getIdentityFreeUsage({
      userId: "ghost",
      ...readParams(stores),
    }), { identityId: null, used: 0 });
  });
  test("read performs no writes", async () => {
    const { stores, readFreeUsage } = makeAbuseStores();
    const before = await getIdentityFreeUsage({
      userId: "nobody",
      ...readParams(stores),
    });
    assert.deepEqual(before, { identityId: null, used: 0 });
    assert.equal(await stores.findIdentityIdByUser("nobody"), null);
    assert.equal(readFreeUsage("whatever", "2026-09"), null);
  });
});
