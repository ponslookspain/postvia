import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  gateWriteRequest,
  WRITE_LIMIT_CHECKOUT,
  WRITE_LIMIT_POSTS_CREATE,
  WRITE_PATH_IP_MULTIPLIER,
  WRITE_PATH_WINDOW_MS,
  type AbuseStores,
} from "../src/lib/abuse";

const PEPPER = "test-pepper-123";

/**
 * Focused tests for the authenticated write-path flood gates (F2).
 * Conservative limits only trigger on floods; quota/entitlement
 * semantics are untouched (covered by their own suites).
 */
function makeStores(): { stores: AbuseStores; buckets: Map<string, number> } {
  const buckets = new Map<string, number>();
  const unsupported = async (): Promise<never> => {
    throw new Error("not implemented in rate-gate harness");
  };
  const stores: AbuseStores = {
    findSignalOwners: async () => [],
    createIdentity: unsupported,
    linkUser: unsupported,
    findIdentityIdByUser: async () => null,
    findUserIdsByIdentity: async () => [],
    attachSignals: unsupported,
    removeSignals: unsupported,
    mergeIdentities: unsupported,
    getIdentity: async () => null,
    setRisk: unsupported,
    escalateRisk: unsupported,
    touchLinked: unsupported,
    touchSeen: unsupported,
    findTombstones: async () => [],
    writeTombstones: unsupported,
    sweepTombstones: async () => 0,
    getFreeUsage: async () => null,
    initFreeUsage: unsupported,
    incrementFreeIfBelow: async () => false,
    raiseFreeFloor: unsupported,
    sumPostUsage: async () => 0,
    rateTake: async (_scope, keyHash, max) => {
      const count = (buckets.get(keyHash) ?? 0) + 1;
      buckets.set(keyHash, count);
      return count <= max;
    },
  };
  return { stores, buckets };
}

function writeRequest(ip: string | null): Request {
  return new Request("https://postvia.online/api/posts", {
    method: "POST",
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

const base = {
  request: writeRequest("203.0.113.9"),
  userId: "writer-1",
  scope: "posts-create",
  userMax: WRITE_LIMIT_POSTS_CREATE,
  windowMs: WRITE_PATH_WINDOW_MS,
  stores: makeStores().stores,
  pepper: PEPPER,
  nowMs: 1000,
};

describe("gateWriteRequest (F2 write-path flood gates)", () => {
  test("allows traffic under the per-user limit", async () => {
    const { stores } = makeStores();
    for (let i = 0; i < WRITE_LIMIT_POSTS_CREATE; i += 1) {
      assert.equal(
        await gateWriteRequest({ ...base, stores, nowMs: 1000 + i }),
        true,
        `attempt ${i} should pass`
      );
    }
  });

  test("denies past the per-user limit", async () => {
    const { stores } = makeStores();
    for (let i = 0; i < WRITE_LIMIT_POSTS_CREATE; i += 1) {
      await gateWriteRequest({ ...base, stores, nowMs: 1000 });
    }
    assert.equal(await gateWriteRequest({ ...base, stores, nowMs: 1001 }), false);
  });

  test("budgets are per user: a second user is unaffected", async () => {
    const { stores } = makeStores();
    for (let i = 0; i < WRITE_LIMIT_POSTS_CREATE; i += 1) {
      await gateWriteRequest({ ...base, stores, nowMs: 1000 });
    }
    assert.equal(
      await gateWriteRequest({ ...base, stores, userId: "writer-2", nowMs: 1001 }),
      true
    );
  });

  test("shared IP bucket is roomier than the user budget (NAT safety)", async () => {
    const { stores } = makeStores();
    // Exhaust one user's budget entirely…
    for (let i = 0; i < WRITE_LIMIT_POSTS_CREATE; i += 1) {
      await gateWriteRequest({ ...base, stores, nowMs: 1000 });
    }
    // …and a different user behind the same IP still passes: the IP
    // bucket is userMax * multiplier, far from exhausted.
    assert.equal(
      await gateWriteRequest({ ...base, stores, userId: "writer-9", nowMs: 1001 }),
      true
    );
    assert.equal(
      WRITE_LIMIT_POSTS_CREATE * WRITE_PATH_IP_MULTIPLIER,
      1000
    );
  });

  test("checkout limit is tight (10/hour) but allows normal use", async () => {
    const { stores } = makeStores();
    const input = {
      ...base,
      stores,
      scope: "billing-checkout",
      userMax: WRITE_LIMIT_CHECKOUT,
      nowMs: 1000,
    };
    for (let i = 0; i < WRITE_LIMIT_CHECKOUT; i += 1) {
      assert.equal(await gateWriteRequest(input), true);
    }
    assert.equal(await gateWriteRequest(input), false);
  });

  test("disabled mode allows without consuming buckets", async () => {
    const { stores, buckets } = makeStores();
    assert.equal(
      await gateWriteRequest({ ...base, stores, nowMs: 1000, disabled: true }),
      true
    );
    assert.equal(buckets.size, 0);
  });

  test("requests without an IP still gate per user", async () => {
    const { stores } = makeStores();
    const input = {
      ...base,
      stores,
      request: writeRequest(null),
      nowMs: 1000,
    };
    for (let i = 0; i < WRITE_LIMIT_POSTS_CREATE; i += 1) {
      assert.equal(await gateWriteRequest(input), true);
    }
    assert.equal(await gateWriteRequest(input), false);
  });
});
