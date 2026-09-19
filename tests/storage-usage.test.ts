import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  reportHeavyStorageUsers,
  STORAGE_ALERT_BYTES,
  STORAGE_ALERT_MAX_USERS,
  type HeavyStorageUser,
} from "../src/lib/storage-usage";

/**
 * Storage-usage tripwire: measurement and logging only. These tests pin
 * that it is read-only (no delete/block dependency exists to call) and
 * that it forwards the threshold/limit through to the query, which is the
 * whole contract — the live implementation is a single `groupBy` against
 * Prisma, not worth re-deriving here.
 */
function fakeUsers(users: HeavyStorageUser[]) {
  const calls: { thresholdBytes: number; limit: number }[] = [];
  return {
    calls,
    deps: {
      findUsersOverThreshold: async (thresholdBytes: number, limit: number) => {
        calls.push({ thresholdBytes, limit });
        return users
          .filter((user) => user.totalBytes >= thresholdBytes)
          .slice(0, limit);
      },
    },
  };
}

describe("reportHeavyStorageUsers", () => {
  test("returns users at or above the threshold", async () => {
    const store = fakeUsers([
      { userId: "u1", totalBytes: STORAGE_ALERT_BYTES + 1 },
      { userId: "u2", totalBytes: STORAGE_ALERT_BYTES - 1 },
    ]);

    const heavy = await reportHeavyStorageUsers(store.deps);

    assert.deepEqual(
      heavy.map((u) => u.userId),
      ["u1"]
    );
  });

  test("uses the documented default threshold and cap", async () => {
    const store = fakeUsers([]);

    await reportHeavyStorageUsers(store.deps);

    assert.deepEqual(store.calls, [
      { thresholdBytes: STORAGE_ALERT_BYTES, limit: STORAGE_ALERT_MAX_USERS },
    ]);
  });

  test("an explicit threshold/limit overrides the defaults", async () => {
    const store = fakeUsers([]);

    await reportHeavyStorageUsers(store.deps, {
      thresholdBytes: 1024,
      limit: 5,
    });

    assert.deepEqual(store.calls, [{ thresholdBytes: 1024, limit: 5 }]);
  });

  test("never mutates anything — there is no delete/block dependency to call", async () => {
    const store = fakeUsers([{ userId: "u1", totalBytes: STORAGE_ALERT_BYTES }]);

    await reportHeavyStorageUsers(store.deps);
    await reportHeavyStorageUsers(store.deps);

    assert.equal(store.calls.length, 2, "read-only: repeat calls just re-read");
  });
});
