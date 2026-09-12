import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  handlePlanChange,
  type PlanChangeStore,
} from "../src/app/api/billing/change/route";

const ADMIN_EMAIL = "admin@example.com";
const USER_EMAIL = "user@example.com";

const originalAdminEmails = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (originalAdminEmails === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  }
});

type StoreCall = { userId: string; plan: string };

function makeStore(): { store: PlanChangeStore; calls: StoreCall[] } {
  const calls: StoreCall[] = [];
  const store: PlanChangeStore = {
    upsertSubscription: async ({ userId, plan, periodEnd }) => {
      calls.push({ userId, plan });
      assert.ok(
        periodEnd.getTime() > Date.now(),
        "period end must be in the future"
      );
      return {
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      };
    },
  };
  return { store, calls };
}

function user(id: string, email: string) {
  return { id, name: "Test User", email, emailVerified: true };
}

describe("POST /api/billing/change authorization", () => {
  test("unauthenticated caller gets 401 and no write happens", async () => {
    const { store, calls } = makeStore();
    const res = await handlePlanChange({
      user: null,
      plan: "growth",
      store,
    });
    assert.equal(res.status, 401);
    assert.deepEqual(calls, []);
  });

  for (const plan of ["free", "growth", "scale"]) {
    test(`ordinary user cannot gain ${plan} via direct API (403, no write)`, async () => {
      process.env.ADMIN_EMAILS = ADMIN_EMAIL;
      const { store, calls } = makeStore();
      const res = await handlePlanChange({
        user: user("user-1", USER_EMAIL),
        plan,
        store,
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error?: unknown };
      assert.equal(typeof body.error, "string");
      assert.deepEqual(calls, []);
    });
  }

  test("ordinary user with an unknown plan still gets 403 (admin gate first)", async () => {
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    const { store, calls } = makeStore();
    const res = await handlePlanChange({
      user: user("user-1", USER_EMAIL),
      plan: "starter",
      store,
    });
    assert.equal(res.status, 403);
    assert.deepEqual(calls, []);
  });

  for (const [plan, dbPlan] of [
    ["free", "FREE"],
    ["growth", "GROWTH"],
    ["scale", "SCALE"],
  ] as const) {
    test(`admin can set ${plan} for testing`, async () => {
      process.env.ADMIN_EMAILS = ADMIN_EMAIL;
      const { store, calls } = makeStore();
      const res = await handlePlanChange({
        user: user("admin-1", ADMIN_EMAIL),
        plan,
        store,
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        ok?: unknown;
        plan?: unknown;
        status?: unknown;
        cancelAtPeriodEnd?: unknown;
      };
      assert.equal(body.ok, true);
      assert.equal(body.plan, plan);
      assert.equal(body.status, "ACTIVE");
      assert.equal(body.cancelAtPeriodEnd, false);
      assert.deepEqual(calls, [{ userId: "admin-1", plan: dbPlan }]);
    });
  }

  test("admin with an unknown plan gets 400 and no write happens", async () => {
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    const { store, calls } = makeStore();
    const res = await handlePlanChange({
      user: user("admin-1", ADMIN_EMAIL),
      plan: "starter",
      store,
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: unknown };
    assert.equal(typeof body.error, "string");
    assert.deepEqual(calls, []);
  });

  test("without ADMIN_EMAILS nobody can change plans", async () => {
    delete process.env.ADMIN_EMAILS;
    const { store, calls } = makeStore();
    const res = await handlePlanChange({
      user: user("admin-1", ADMIN_EMAIL),
      plan: "growth",
      store,
    });
    assert.equal(res.status, 403);
    assert.deepEqual(calls, []);
  });

  test("admin gate is case-insensitive at the route level", async () => {
    process.env.ADMIN_EMAILS = "Admin@Example.com";
    const { store, calls } = makeStore();
    const res = await handlePlanChange({
      user: user("admin-1", "ADMIN@EXAMPLE.COM"),
      plan: "scale",
      store,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
  });
});
