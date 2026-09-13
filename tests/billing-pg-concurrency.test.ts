/**
 * Real PostgreSQL billing-guard verification (state + races).
 *
 * REQUIRED env (never the production database):
 *   PG_INTEGRATION=1
 *   DATABASE_URL_POSTGRES_PRISMA_URL=<isolated test database, schema pushed
 *     from the current tree: `npx prisma db push` on the ISOLATED db only>
 *
 * Without PG_INTEGRATION=1 the suite skips. Rows are tagged per run and
 * cleaned by tag (no TRUNCATE — this file runs in parallel with the abuse
 * concurrency suite against the same isolated database).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { liveBillingStores } from "../src/lib/billing-live-stores";
import { processWebhookEvent } from "../src/lib/stripe";

const ENABLED = process.env.PG_INTEGRATION === "1";
const RUN = randomUUID().slice(0, 8);
const GROWTH_PRICE = "price_1UEyqHRKEM3xporCj250GMR3";
const SCALE_PRICE = "price_1UEyqeRKEM3xporCZv7dEUEc";
const T0 = 1_780_000_000;

const tag = (prefix: string) => `${prefix}-${RUN}`;

async function createUser(suffix: string): Promise<{ id: string; email: string }> {
  const email = `${tag("pg-billing")}-${suffix}@x.com`;
  const user = await prisma.user.create({
    data: { email, name: email.split("@")[0] ?? "t" },
    select: { id: true, email: true },
  });
  return user;
}

async function cleanup(users: { email: string }[], eventPrefix: string): Promise<void> {
  await prisma.stripeEvent.deleteMany({
    where: { eventId: { startsWith: eventPrefix } },
  });
  await prisma.user.deleteMany({
    where: { OR: users.map((u) => ({ email: u.email })) },
  });
}

describe("pg: duplicate webhook delivery collapses to one write", { skip: !ENABLED }, () => {
  test("concurrent same-Event-ID deliveries apply once", async () => {
    const user = await createUser("dup");
    const evt = tag("evt-dup");
    const users = [user];
    try {
      const payload = {
        kind: "subscription" as const,
        snapshot: {
          subscriptionId: tag("sub-dup"),
          customerId: tag("cus-dup"),
          priceId: SCALE_PRICE,
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-10-12T00:00:00Z"),
          userId: user.id,
          eventCreated: T0,
        },
      };
      const results = await Promise.all(
        [0, 1, 2].map(() =>
          processWebhookEvent({
            eventId: evt,
            type: "customer.subscription.created",
            payload,
            stores: liveBillingStores,
          })
        )
      );
      const applied = results.filter((r) => r.outcome === "applied");
      const duplicates = results.filter((r) => r.outcome === "duplicate");
      assert.equal(applied.length, 1);
      assert.equal(duplicates.length, 2);
      const row = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      assert.equal(row?.plan, "SCALE");
      assert.equal(row?.status, "ACTIVE");
      assert.equal(row?.lastStripeEventCreated, T0);
    } finally {
      await cleanup(users, evt);
    }
  });
});

describe("pg: stale out-of-order delivery cannot regress the row", { skip: !ENABLED }, () => {
  test("Scale then stale Growth keeps Scale", async () => {
    const user = await createUser("stale");
    const evtBase = tag("evt-stale");
    const users = [user];
    try {
      const subId = tag("sub-stale");
      const cusId = tag("cus-stale");
      const fresh = await processWebhookEvent({
        eventId: `${evtBase}-fresh`,
        type: "customer.subscription.updated",
        payload: {
          kind: "subscription",
          snapshot: {
            subscriptionId: subId,
            customerId: cusId,
            priceId: SCALE_PRICE,
            status: "active",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: new Date("2026-11-12T00:00:00Z"),
            userId: user.id,
            eventCreated: T0 + 100,
          },
        },
        stores: liveBillingStores,
      });
      assert.deepEqual(fresh, { outcome: "applied", userId: user.id });
      // No Stripe credentials in the PG harness: the regressing stale
      // delivery cannot be live-verified, so the writer throws for
      // redelivery (route → 500 + claim release) instead of guessing.
      // The row must stay SCALE either way.
      await assert.rejects(
        processWebhookEvent({
          eventId: `${evtBase}-stale`,
          type: "customer.subscription.updated",
          payload: {
            kind: "subscription",
            snapshot: {
              subscriptionId: subId,
              customerId: cusId,
              priceId: GROWTH_PRICE,
              status: "active",
              cancelAtPeriodEnd: false,
              currentPeriodEnd: new Date("2026-10-12T00:00:00Z"),
              userId: user.id,
              eventCreated: T0,
            },
          },
          stores: liveBillingStores,
        }),
        (error: unknown) =>
          error instanceof Error && error.name === "StaleWebhookRetryError"
      );
      const row = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      assert.equal(row?.plan, "SCALE");
    } finally {
      await cleanup(users, evtBase);
    }
  });
});

describe("pg: per-user checkout lock serializes concurrent flows", { skip: !ENABLED }, () => {
  test("two concurrent locked sections never interleave", async () => {
    const lockKey = tag("checkout-lock");
    const order: string[] = [];
    const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
    await Promise.all(
      ["a", "b"].map((name) =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            lockKey
          );
          order.push(`in-${name}`);
          await delay(100);
          order.push(`out-${name}`);
        })
      )
    );
    assert.equal(order.length, 4);
    for (const name of ["a", "b"]) {
      const entered = order.indexOf(`in-${name}`);
      const exited = order.indexOf(`out-${name}`);
      assert.equal(exited, entered + 1);
    }
  });
});
