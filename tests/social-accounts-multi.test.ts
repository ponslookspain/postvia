import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPlan } from "../src/lib/plans";
import type { EffectiveSubscription } from "../src/lib/entitlements";
import {
  checkSocialLink,
  type AbuseStores,
  type SignalInput,
} from "../src/lib/abuse";
import {
  createSocialAccountRaceSafe,
  createdRowKeepsSlot,
  findDisconnectTarget,
  type SocialAccountData,
  type SocialAccountStore,
} from "../src/lib/social-accounts";
import { matchTargetAccount } from "../src/lib/publish";

function effective(
  plan: "free" | "growth" | "scale"
): EffectiveSubscription {
  return {
    plan,
    status: "ACTIVE",
    bypass: false,
    source: "default",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: getPlan(plan).entitlements,
  };
}

function accountData(externalId: string, username: string): SocialAccountData {
  return {
    externalId,
    username,
    accessToken: `at-${externalId}`,
    refreshToken: null,
    expiresAt: null,
  };
}

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  externalId: string;
  data: SocialAccountData;
};

/**
 * In-memory SocialAccount store enforcing the same uniqueness as Prisma:
 * @@unique([userId, platform, externalId]) and
 * @@unique([platform, externalId]).
 */
function makeAccountStore() {
  let seq = 0;
  const rows: AccountRow[] = [];
  const p2002 = () => {
    const err = new Error("unique") as Error & { code?: string };
    err.code = "P2002";
    return err;
  };
  const store: SocialAccountStore = {
    findOwn: async (userId, platform, externalId) => {
      const row = rows.find(
        (r) =>
          r.userId === userId &&
          r.platform === platform &&
          r.externalId === externalId
      );
      return row ? { id: row.id } : null;
    },
    countByPlatform: async (userId, platform) =>
      rows.filter((r) => r.userId === userId && r.platform === platform).length,
    create: async ({ userId, platform, data }) => {
      if (
        rows.some(
          (r) =>
            r.userId === userId &&
            r.platform === platform &&
            r.externalId === data.externalId
        ) ||
        rows.some(
          (r) => r.platform === platform && r.externalId === data.externalId
        )
      ) {
        throw p2002();
      }
      seq += 1;
      const row: AccountRow = {
        id: `acc-${seq}`,
        userId,
        platform,
        externalId: data.externalId,
        data,
      };
      rows.push(row);
      return { id: row.id };
    },
    listIdsByPlatformOldestFirst: async (userId, platform) =>
      rows
        .filter((r) => r.userId === userId && r.platform === platform)
        .map((r) => r.id),
    updateAccount: async (id, data) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("missing");
      row.data = data;
    },
    deleteOwnById: async (id, userId) => {
      const index = rows.findIndex((r) => r.id === id && r.userId === userId);
      if (index !== -1) rows.splice(index, 1);
    },
  };
  return { store, rows };
}

describe("createdRowKeepsSlot (pure rank check)", () => {
  test("unlimited plans always keep the slot", () => {
    assert.equal(createdRowKeepsSlot([], "a", null), true);
    assert.equal(createdRowKeepsSlot(["x"], "a", null), true);
  });
  test("free limit 1: first row keeps, second loses", () => {
    assert.equal(createdRowKeepsSlot(["a"], "a", 1), true);
    assert.equal(createdRowKeepsSlot(["a", "b"], "b", 1), false);
  });
  test("growth limit 5: fifth keeps, sixth loses", () => {
    const ids = ["a", "b", "c", "d", "e"];
    assert.equal(createdRowKeepsSlot(ids, "e", 5), true);
    assert.equal(createdRowKeepsSlot([...ids, "f"], "f", 5), false);
  });
  test("missing row never keeps a slot", () => {
    assert.equal(createdRowKeepsSlot(["a"], "gone", 5), false);
  });
});

describe("Threads multi-account limits", () => {
  test("0 accounts: nothing stored, first connect is allowed", async () => {
    const { store, rows } = makeAccountStore();
    assert.equal(rows.length, 0);
    const result = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t1",
      data: accountData("t1", "alice"),
      effective: effective("free"),
      store,
    });
    assert.equal(result.ok, true);
    assert.equal(rows.length, 1);
  });

  test("free: second Threads account hits the account limit", async () => {
    const { store } = makeAccountStore();
    const first = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t1",
      data: accountData("t1", "alice"),
      effective: effective("free"),
      store,
    });
    assert.equal(first.ok, true);
    const second = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t2",
      data: accountData("t2", "alice2"),
      effective: effective("free"),
      store,
    });
    assert.equal(second.ok, false);
    assert.equal(
      (second as { code?: string }).code,
      "account_limit_reached"
    );
  });

  test("growth: five Threads accounts allowed, sixth denied", async () => {
    const { store, rows } = makeAccountStore();
    for (let i = 1; i <= 5; i += 1) {
      const result = await createSocialAccountRaceSafe({
        userId: "u1",
        platform: "THREADS",
        externalId: `t${i}`,
        data: accountData(`t${i}`, `user${i}`),
        effective: effective("growth"),
        store,
      });
      assert.equal(result.ok, true);
    }
    assert.equal(rows.length, 5);
    const sixth = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t6",
      data: accountData("t6", "user6"),
      effective: effective("growth"),
      store,
    });
    assert.equal(sixth.ok, false);
  });

  test("scale: unlimited Threads accounts", async () => {
    const { store, rows } = makeAccountStore();
    for (let i = 1; i <= 8; i += 1) {
      const result = await createSocialAccountRaceSafe({
        userId: "u1",
        platform: "THREADS",
        externalId: `t${i}`,
        data: accountData(`t${i}`, `user${i}`),
        effective: effective("scale"),
        store,
      });
      assert.equal(result.ok, true);
    }
    assert.equal(rows.length, 8);
  });

  test("reconnect of an existing account updates in place without consuming quota", async () => {
    const { store, rows } = makeAccountStore();
    await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t1",
      data: accountData("t1", "alice"),
      effective: effective("free"),
      store,
    });
    const reconnect = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t1",
      data: { ...accountData("t1", "alice-renamed"), accessToken: "new-token" },
      effective: effective("free"),
      store,
    });
    assert.equal(reconnect.ok, true);
    assert.equal(
      (reconnect as { reconnected?: boolean }).reconnected,
      true
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data.accessToken, "new-token");
    assert.equal(rows[0].data.username, "alice-renamed");
  });

  test("limits are per platform: Threads full does not block X", async () => {
    const { store } = makeAccountStore();
    await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t1",
      data: accountData("t1", "alice"),
      effective: effective("free"),
      store,
    });
    const x = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "X",
      externalId: "x1",
      data: accountData("x1", "alice-x"),
      effective: effective("free"),
      store,
    });
    assert.equal(x.ok, true);
  });
});

describe("race conditions on connect", () => {
  test("concurrent callbacks for one externalId converge to a single row", async () => {
    const { store, rows } = makeAccountStore();
    // Winner inserts between the loser's pre-check and create: the first
    // findOwn misses, create hits P2002, the re-check converges to UPDATE.
    let finds = 0;
    const racy: SocialAccountStore = {
      ...store,
      findOwn: async (userId, platform, externalId) => {
        finds += 1;
        if (finds === 1) return null;
        return store.findOwn(userId, platform, externalId);
      },
      create: async (input) => {
        await store.create({
          userId: "u1",
          platform: "THREADS",
          data: accountData("t1", "winner"),
        });
        return store.create(input);
      },
    };
    const result = await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "t1",
      data: accountData("t1", "loser-update"),
      effective: effective("growth"),
      store: racy,
    });
    assert.equal(result.ok, true);
    assert.equal(
      (result as { reconnected?: boolean }).reconnected,
      true
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data.username, "loser-update");
  });

  test("concurrent fresh connects on the last free slot grant exactly one winner", async () => {
    const { store, rows } = makeAccountStore();
    // Both racers observe a stale count of 0; both inserts land; the
    // oldest-first rank keeps exactly one of them.
    const staleCount: SocialAccountStore = {
      ...store,
      countByPlatform: async () => 0,
    };
    const [a, b] = await Promise.all([
      createSocialAccountRaceSafe({
        userId: "u1",
        platform: "THREADS",
        externalId: "t-command",
        data: accountData("t-command", "a"),
        effective: effective("free"),
        store: staleCount,
      }),
      createSocialAccountRaceSafe({
        userId: "u1",
        platform: "THREADS",
        externalId: "t-colon",
        data: accountData("t-colon", "b"),
        effective: effective("free"),
        store: staleCount,
      }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(
      (losers[0] as { code?: string }).code,
      "account_limit_reached"
    );
    assert.equal(rows.length, 1);
  });

  test("same externalId owned by another live user maps to account_in_use", async () => {
    const { store } = makeAccountStore();
    await createSocialAccountRaceSafe({
      userId: "u1",
      platform: "THREADS",
      externalId: "shared",
      data: accountData("shared", "owner"),
      effective: effective("growth"),
      store,
    });
    const intruder = await createSocialAccountRaceSafe({
      userId: "u2",
      platform: "THREADS",
      externalId: "shared",
      data: accountData("shared", "intruder"),
      effective: effective("growth"),
      store,
    });
    assert.equal(intruder.ok, false);
    assert.equal(
      (intruder as { code?: string }).code,
      "account_in_use"
    );
  });
});

describe("disconnect targets a concrete account", () => {
  function makeDisconnectStore(rows: AccountRow[]) {
    return {
      findOwned: async (userId: string, platform: string, accountId: string) => {
        const row = rows.find(
          (r) => r.userId === userId && r.platform === platform && r.id === accountId
        );
        return row
          ? {
              id: row.id,
              platform: row.platform,
              externalId: row.externalId,
              accessToken: row.data.accessToken,
            }
          : null;
      },
    };
  }

  test("missing accountId fails instead of picking the first account", async () => {
    const lookup = await findDisconnectTarget({
      userId: "u1",
      platform: "THREADS",
      accountId: null,
      store: makeDisconnectStore([]),
    });
    assert.equal(lookup.ok, false);
    assert.equal(
      (lookup as { code?: string }).code,
      "accountId_required"
    );
  });

  test("unknown id and foreign ownership both miss", async () => {
    const { rows } = makeAccountStore();
    await findDisconnectTarget({
      userId: "u1",
      platform: "THREADS",
      accountId: "acc-1",
      store: makeDisconnectStore(rows),
    });
    const store = makeDisconnectStore(rows);
    const unknown = await findDisconnectTarget({
      userId: "u1",
      platform: "THREADS",
      accountId: "nope",
      store,
    });
    assert.equal(unknown.ok, false);
    const foreign = await findDisconnectTarget({
      userId: "u2",
      platform: "THREADS",
      accountId: "acc-1",
      store,
    });
    assert.equal(foreign.ok, false);
  });

  for (const platform of ["THREADS", "X", "INSTAGRAM", "TIKTOK"]) {
    test(`disconnect #2 on ${platform} leaves #1 untouched`, async () => {
      const { store, rows } = makeAccountStore();
      for (const externalId of ["a", "b"]) {
        const created = await createSocialAccountRaceSafe({
          userId: "u1",
          platform,
          externalId: `${platform}-${externalId}`,
          data: accountData(`${platform}-${externalId}`, `user-${externalId}`),
          effective: effective("growth"),
          store,
        });
        assert.equal(created.ok, true);
      }
      assert.equal(rows.length, 2);
      const second = rows[1];
      const lookup = await findDisconnectTarget({
        userId: "u1",
        platform,
        accountId: second.id,
        store: makeDisconnectStore(rows),
      });
      assert.equal(lookup.ok, true);
      assert.equal(
        (lookup as { externalId?: string }).externalId,
        second.externalId
      );
      await store.deleteOwnById(second.id, "u1");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id !== second.id, true);
    });
  }
});

describe("publisher binds the concrete account", () => {
  const first = { id: "acc-1", userId: "u1", platform: "THREADS" };
  const second = { id: "acc-2", userId: "u1", platform: "THREADS" };

  test("target without socialAccountId fails closed (no first-account fallback)", () => {
    assert.equal(
      matchTargetAccount("u1", { socialAccountId: null, platform: "THREADS" }, first),
      null
    );
  });

  test("missing account row fails closed", () => {
    assert.equal(
      matchTargetAccount(
        "u1",
        { socialAccountId: "acc-2", platform: "THREADS" },
        null
      ),
      null
    );
  });

  test("second Threads account publishes through its own row", () => {
    assert.equal(
      matchTargetAccount(
        "u1",
        { socialAccountId: "acc-2", platform: "THREADS" },
        second
      ),
      second
    );
  });

  test("cross-user rows never match", () => {
    assert.equal(
      matchTargetAccount(
        "u2",
        { socialAccountId: "acc-2", platform: "THREADS" },
        second
      ),
      null
    );
  });

  test("platform mismatch never matches", () => {
    assert.equal(
      matchTargetAccount(
        "u1",
        { socialAccountId: "acc-2", platform: "X" },
        second
      ),
      null
    );
  });

  for (const platform of ["X", "INSTAGRAM", "TIKTOK"]) {
    test(`${platform} target binds its own account id`, () => {
      const account = { id: "acc-9", userId: "u1", platform };
      assert.equal(
        matchTargetAccount("u1", { socialAccountId: "acc-9", platform }, account),
        account
      );
    });
  }
});

/** Compact in-memory AbuseStores for link-gate tests. */
function makeLinkStores() {
  let seq = 0;
  const identities = new Map<
    string,
    {
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "ABUSE";
      riskReason: string | null;
      lastLinkedAt: Date | null;
      firstSeenAt: Date;
    }
  >();
  const links = new Map<string, string>();
  const signals = new Map<string, string>();
  const key = (s: SignalInput) => `${s.kind}:${s.valueHash}`;
  const stores: AbuseStores = {
    findSignalOwners: async (inputs) => {
      const out: { identityId: string; firstSeenAt: Date }[] = [];
      for (const signal of inputs) {
        const owner = signals.get(key(signal));
        const meta = owner ? identities.get(owner) : undefined;
        if (owner && meta) out.push({ identityId: owner, firstSeenAt: meta.firstSeenAt });
      }
      return out;
    },
    createIdentity: async () => {
      seq += 1;
      const id = `idn-${seq}`;
      const row = {
        riskLevel: "LOW" as const,
        riskReason: null,
        lastLinkedAt: null as Date | null,
        firstSeenAt: new Date(),
      };
      identities.set(id, row);
      return { id, firstSeenAt: row.firstSeenAt };
    },
    linkUser: async (identityId, userId) => {
      if (!identities.has(identityId)) {
        const err = new Error("fk") as Error & { code?: string };
        err.code = "P2003";
        throw err;
      }
      links.set(userId, identityId);
    },
    findIdentityIdByUser: async (userId) => links.get(userId) ?? null,
    findUserIdsByIdentity: async (identityId) =>
      [...links.entries()]
        .filter(([, id]) => id === identityId)
        .map(([userId]) => userId),
    attachSignals: async (identityId, inputs) => {
      for (const signal of inputs) signals.set(key(signal), identityId);
    },
    removeSignals: async (inputs) => {
      for (const signal of inputs) signals.delete(key(signal));
    },
    mergeIdentities: async (winnerId, loserIds) => {
      for (const loser of loserIds) {
        for (const [userId, id] of [...links.entries()]) {
          if (id === loser) links.set(userId, winnerId);
        }
        for (const [k, id] of [...signals.entries()]) {
          if (id === loser) signals.set(k, winnerId);
        }
        identities.delete(loser);
      }
    },
    getIdentity: async (identityId) => {
      const row = identities.get(identityId);
      return row ? { id: identityId, ...row } : null;
    },
    setRisk: async (identityId, level, reason) => {
      const row = identities.get(identityId);
      if (row) {
        row.riskLevel = level;
        row.riskReason = reason;
      }
    },
    touchLinked: async (identityId, now) => {
      const row = identities.get(identityId);
      if (row) row.lastLinkedAt = now;
    },
    touchSeen: async () => undefined,
    findTombstones: async () => [],
    writeTombstones: async () => undefined,
    sweepTombstones: async () => 0,
    getFreeUsage: async () => null,
    initFreeUsage: async (_identityId, _period, count) => count,
    incrementFreeIfBelow: async () => true,
    raiseFreeFloor: async () => undefined,
    sumPostUsage: async () => 0,
    rateTake: async () => true,
  };
  return stores;
}

const PEPPER = "test-pepper";

describe("anti-abuse keeps multi-account and Free protection apart", () => {
  test("same user + distinct externalIds: three Threads accounts allowed", async () => {
    const stores = makeLinkStores();
    for (const externalId of ["t-a", "t-b", "t-c"]) {
      const decision = await checkSocialLink({
        userId: "u1",
        userEmail: "alice@example.com",
        deviceId: "device-1",
        platform: "THREADS",
        externalId,
        isPaid: false,
        enforce: true,
        pepper: PEPPER,
        stores,
        nowMs: Date.now(),
      });
      assert.equal(decision.ok, true);
    }
  });

  test("same externalId + second live user: denied as in use", async () => {
    const stores = makeLinkStores();
    const first = await checkSocialLink({
      userId: "u1",
      userEmail: "alice@example.com",
      platform: "THREADS",
      externalId: "shared",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
    });
    assert.equal(first.ok, true);
    const second = await checkSocialLink({
      userId: "u2",
      userEmail: "bob@example.com",
      platform: "THREADS",
      externalId: "shared",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
    });
    assert.equal(second.ok, false);
    assert.equal(
      (second as { code?: string }).code,
      "ACCOUNT_IN_USE"
    );
  });

  test("Free identity pooling preserved: same email shares one identity", async () => {
    const stores = makeLinkStores();
    const now = Date.now();
    const first = await checkSocialLink({
      userId: "u1",
      userEmail: "alice@example.com",
      platform: "THREADS",
      externalId: "t-1",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      nowMs: now,
    });
    assert.equal(first.ok, true);
    // A second Postvia user with the same email resolves to the same
    // identity (shared Free ledger). The link lands after the cooldown
    // window so the MEDIUM escalation from growing to two users does not
    // throttle this steady-state re-link.
    const dayMs = 24 * 3_600_000;
    const second = await checkSocialLink({
      userId: "u2",
      userEmail: "alice@example.com",
      platform: "X",
      externalId: "x-1",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      nowMs: now + dayMs + 1_000,
    });
    assert.equal(second.ok, true);
    assert.equal(
      (first as { identityId?: string }).identityId,
      (second as { identityId?: string }).identityId
    );
  });

  test("flagged identity: rapid link right after the identity grows hits cooldown", async () => {
    const stores = makeLinkStores();
    const now = Date.now();
    const dayMs = 24 * 3_600_000;
    const first = await checkSocialLink({
      userId: "u1",
      userEmail: "alice@example.com",
      platform: "THREADS",
      externalId: "t-1",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      nowMs: now,
    });
    assert.equal(first.ok, true);
    // A second Postvia user on the same email joins the identity after the
    // window: allowed, but two linked users escalate it to MEDIUM.
    const joiner = await checkSocialLink({
      userId: "u2",
      userEmail: "alice@example.com",
      platform: "THREADS",
      externalId: "t-2",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      nowMs: now + dayMs + 1_000,
    });
    assert.equal(joiner.ok, true);
    // An immediate fresh link on the now-MEDIUM identity waits out the
    // progressive cooldown instead of minting value silently.
    const third = await checkSocialLink({
      userId: "u1",
      userEmail: "alice@example.com",
      platform: "THREADS",
      externalId: "t-3",
      isPaid: false,
      enforce: true,
      pepper: PEPPER,
      stores,
      nowMs: now + dayMs + 2_000,
    });
    assert.equal(third.ok, false);
    assert.equal((third as { code?: string }).code, "COOLDOWN");
  });
});
