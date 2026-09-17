/**
 * Real PostgreSQL verification of the per-post media cap (P1.2).
 *
 * The in-memory suite (`tests/media-cap.test.ts`) pins the CONTRACT given a
 * lock that serializes. This suite proves the lock is real: `claimMediaSlot`
 * against the live store takes `pg_advisory_xact_lock` inside a transaction,
 * and only a real database can show that a plain count-then-insert would not
 * have been enough (under READ COMMITTED both transactions read the same
 * count and both insert).
 *
 * REQUIRED env (never the production database):
 *   PG_INTEGRATION=1
 *   DATABASE_URL_POSTGRES_PRISMA_URL=<isolated test database, schema pushed
 *     from the current tree: `npx prisma db push` on the ISOLATED db only>
 *
 * Without PG_INTEGRATION=1 the suite skips. Rows are tagged per run and
 * cleaned by tag (no TRUNCATE — this file runs alongside the abuse and
 * billing concurrency suites against the same isolated database).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  claimMediaSlot,
  liveMediaRegistrationStore,
} from "../src/lib/media-upload";
import { MAX_MEDIA_PER_POST } from "../src/lib/media";

const ENABLED = process.env.PG_INTEGRATION === "1";
const RUN = randomUUID().slice(0, 8);

const tag = (prefix: string) => `${prefix}-${RUN}`;

async function createUserWithPost(suffix: string): Promise<{
  userId: string;
  email: string;
  postId: string;
}> {
  const email = `${tag("pg-media")}-${suffix}@x.com`;
  const user = await prisma.user.create({
    data: { email, name: email.split("@")[0] ?? "t" },
    select: { id: true },
  });
  const post = await prisma.post.create({
    data: { userId: user.id, text: tag("media cap post"), status: "DRAFT" },
    select: { id: true },
  });
  return { userId: user.id, email, postId: post.id };
}

async function cleanup(emails: string[]): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  // Media and Post cascade from User, but Post.userId has no cascade
  // (see docs/database.md), so posts are removed explicitly first.
  await prisma.media.deleteMany({ where: { userId: { in: ids } } });
  await prisma.post.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

function payload(
  userId: string,
  postId: string,
  n: number
): Parameters<typeof claimMediaSlot>[1] {
  const random = n.toString(16).padStart(32, "0");
  return {
    userId,
    postId,
    url: `https://blob.invalid/${postId}/${n}`,
    pathname: `media/${userId}/${postId}/${random}-f${n}.jpg`,
    filename: `f${n}.jpg`,
    mimeType: "image/jpeg",
    size: 1024,
    type: "IMAGE",
  };
}

describe("pg: per-post media cap under real concurrency", { skip: !ENABLED }, () => {
  test("20 concurrent registrations never exceed the cap", async () => {
    const { userId, email, postId } = await createUserWithPost("burst");
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          claimMediaSlot(liveMediaRegistrationStore, payload(userId, postId, i))
        )
      );

      const created = results.filter((r) => r === "created").length;
      assert.equal(
        created,
        MAX_MEDIA_PER_POST,
        "exactly the cap is granted across 20 racing registrations"
      );

      const stored = await prisma.media.count({ where: { postId } });
      assert.equal(
        stored,
        MAX_MEDIA_PER_POST,
        "the database agrees — this is the assertion the old count-then-insert failed"
      );
    } finally {
      await cleanup([email]);
    }
  });

  test("a post already at the cap grants nothing", async () => {
    const { userId, email, postId } = await createUserWithPost("full");
    try {
      for (let i = 0; i < MAX_MEDIA_PER_POST; i++) {
        const result = await claimMediaSlot(
          liveMediaRegistrationStore,
          payload(userId, postId, i)
        );
        assert.equal(result, "created");
      }

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          claimMediaSlot(
            liveMediaRegistrationStore,
            payload(userId, postId, 100 + i)
          )
        )
      );

      assert.ok(results.every((r) => r === "over-cap"));
      assert.equal(await prisma.media.count({ where: { postId } }), MAX_MEDIA_PER_POST);
    } finally {
      await cleanup([email]);
    }
  });

  test("concurrent claims on the last free slot grant exactly one winner", async () => {
    const { userId, email, postId } = await createUserWithPost("lastslot");
    try {
      for (let i = 0; i < MAX_MEDIA_PER_POST - 1; i++) {
        await claimMediaSlot(liveMediaRegistrationStore, payload(userId, postId, i));
      }

      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          claimMediaSlot(
            liveMediaRegistrationStore,
            payload(userId, postId, 200 + i)
          )
        )
      );

      assert.equal(results.filter((r) => r === "created").length, 1);
      assert.equal(await prisma.media.count({ where: { postId } }), MAX_MEDIA_PER_POST);
    } finally {
      await cleanup([email]);
    }
  });

  test("concurrent duplicate deliveries of ONE upload write one row", async () => {
    const { userId, email, postId } = await createUserWithPost("dup");
    try {
      const data = payload(userId, postId, 7);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          claimMediaSlot(liveMediaRegistrationStore, data)
        )
      );

      assert.equal(results.filter((r) => r === "created").length, 1);
      assert.equal(results.filter((r) => r === "duplicate").length, 7);
      assert.equal(await prisma.media.count({ where: { postId } }), 1);
    } finally {
      await cleanup([email]);
    }
  });

  test("the lock is per post: different posts proceed in parallel", async () => {
    const a = await createUserWithPost("par-a");
    const b = await createUserWithPost("par-b");
    try {
      const results = await Promise.all([
        ...Array.from({ length: 4 }, (_, i) =>
          claimMediaSlot(liveMediaRegistrationStore, payload(a.userId, a.postId, i))
        ),
        ...Array.from({ length: 4 }, (_, i) =>
          claimMediaSlot(liveMediaRegistrationStore, payload(b.userId, b.postId, i))
        ),
      ]);

      assert.ok(
        results.every((r) => r === "created"),
        "one post's cap must never block another post's uploads"
      );
      assert.equal(await prisma.media.count({ where: { postId: a.postId } }), 4);
      assert.equal(await prisma.media.count({ where: { postId: b.postId } }), 4);
    } finally {
      await cleanup([a.email, b.email]);
    }
  });

  test("rejected claims leave no orphaned rows behind", async () => {
    const { userId, email, postId } = await createUserWithPost("orphan");
    try {
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          claimMediaSlot(liveMediaRegistrationStore, payload(userId, postId, i))
        )
      );

      const rows = await prisma.media.findMany({
        where: { postId },
        select: { pathname: true, userId: true },
      });
      assert.equal(rows.length, MAX_MEDIA_PER_POST);
      assert.equal(
        new Set(rows.map((r) => r.pathname)).size,
        MAX_MEDIA_PER_POST,
        "no duplicate pathnames"
      );
      assert.ok(
        rows.every((r) => r.userId === userId),
        "every surviving row belongs to the owner"
      );
    } finally {
      await cleanup([email]);
    }
  });
});
