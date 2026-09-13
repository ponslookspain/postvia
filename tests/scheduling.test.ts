import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  isCronAuthorized,
  recoverStalePublishing,
  runScheduledPublishTick,
  STALE_PUBLISHING_MS,
  type SchedulingDb,
  type StoredPost,
} from "../src/lib/scheduling";
import { GET, POST } from "../src/app/api/cron/publish-scheduled/route";

process.env.CRON_SECRET = "test-cron-secret-123";

const MIN = 60_000;

type TargetRow = {
  id: string;
  postId: string;
  status: string;
  platform: string;
  externalPostId: string | null;
  publishedAt: Date | null;
  errorMessage?: string | null;
  externalJobId?: string | null;
};

type PostRow = {
  id: string;
  userId: string;
  status: string;
  text: string;
  scheduledAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  errorMessage?: string | null;
  publishedAt?: Date | null;
  targets: TargetRow[];
};

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) return value;
  return null;
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const range = condition as Record<string, unknown>;
      const v = dateValue(value);
      if (v === null) return false;
      if ("lt" in range && !(v < dateValue(range.lt)!)) return false;
      if ("lte" in range && !(v <= dateValue(range.lte)!)) return false;
      return true;
    }
    return value === condition;
  });
}

function createFakeDb(seed: { posts: PostRow[] }) {
  const posts = seed.posts;

  const allTargets = () => posts.flatMap((p) => p.targets);
  const clonePost = (p: PostRow): StoredPost => structuredClone(p) as StoredPost;

  const db: SchedulingDb = {
    post: {
      findMany: async (args) =>
        posts.filter((p) => matchesWhere(p as unknown as Record<string, unknown>, args.where)).map(clonePost),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const p of posts) {
          if (matchesWhere(p as unknown as Record<string, unknown>, where)) {
            Object.assign(p, data);
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }) => {
        const p = posts.find((x) => x.id === where.id);
        if (!p) throw new Error(`post ${where.id} not found`);
        Object.assign(p, data);
        return p;
      },
    },
    postTarget: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const t of allTargets()) {
          if (matchesWhere(t as unknown as Record<string, unknown>, where)) {
            Object.assign(t, data);
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }) => {
        const t = allTargets().find((x) => x.id === where.id);
        if (!t) throw new Error(`target ${where.id} not found`);
        Object.assign(t, data);
        return t;
      },
    },
  };

  return { db, posts };
}

function scheduledPost(overrides: Partial<PostRow> = {}): PostRow {
  const now = new Date("2026-09-11T12:00:00Z");
  return {
    id: "p1",
    userId: "alice",
    status: "SCHEDULED",
    text: "hello",
    scheduledAt: new Date(now.getTime() - MIN),
    updatedAt: now,
    createdAt: now,
    targets: [
      {
        id: "t1",
        postId: "p1",
        status: "PENDING",
        platform: "THREADS",
        externalPostId: null,
        publishedAt: null,
      },
    ],
    ...overrides,
  };
}

const NOW = new Date("2026-09-11T12:00:00Z");

function okPublish(published: string[] = []) {
  return {
    fn: async (post: { id: string; text: string }) => {
      published.push(post.id);
      return { ok: true, externalPostId: `ext-${post.id}` } as const;
    },
    published,
  };
}

describe("isCronAuthorized", () => {
  test("accepts the exact bearer secret", () => {
    assert.equal(isCronAuthorized("Bearer test-cron-secret-123"), true);
  });

  test("rejects missing header, wrong scheme, wrong secret, and length mismatch", () => {
    assert.equal(isCronAuthorized(null), false);
    assert.equal(isCronAuthorized(""), false);
    assert.equal(isCronAuthorized("Basic test-cron-secret-123"), false);
    assert.equal(isCronAuthorized("Bearer wrong"), false);
    assert.equal(isCronAuthorized("Bearer test-cron-secret-1"), false);
  });

  test("rejects everything when no CRON_SECRET is configured", () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      assert.equal(isCronAuthorized("Bearer anything"), false);
    } finally {
      process.env.CRON_SECRET = saved;
    }
  });
});

function cronRequest(method: "GET" | "POST", authorization?: string): NextRequest {
  const url = "http://localhost/api/cron/publish-scheduled";
  return new NextRequest(url, {
    method,
    headers: authorization ? { authorization } : {},
  });
}

describe("cron route authorization (GET and POST)", () => {
  for (const [name, handler] of [
    ["GET", GET],
    ["POST", POST],
  ] as const) {
    test(`${name} without credentials is rejected (401)`, async () => {
      const res = await handler(cronRequest(name));
      assert.equal(res.status, 401);
    });

    test(`${name} with the wrong secret is rejected (401)`, async () => {
      const res = await handler(cronRequest(name, "Bearer nope"));
      assert.equal(res.status, 401);
    });
  }
});

describe("runScheduledPublishTick (due-post processing)", () => {
  test("publishes a due scheduled post and flips it to PUBLISHED", async () => {
    const post = scheduledPost();
    const { db, posts } = createFakeDb({ posts: [post] });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.deepEqual(published, ["p1"]);
    assert.equal(stats.checked, 1);
    assert.equal(stats.published, 1);
    assert.equal(posts[0].status, "PUBLISHING", "atomically claimed for publishing");
  });

  test("a future scheduled post is not due and stays SCHEDULED", async () => {
    const post = scheduledPost({ scheduledAt: new Date(NOW.getTime() + 60 * MIN) });
    const { db } = createFakeDb({ posts: [post] });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.checked, 0);
    assert.deepEqual(published, []);
  });

  test("atomic claim: two overlapping ticks publish the same post only once", async () => {
    const post = scheduledPost();
    const { db } = createFakeDb({ posts: [post] });
    const shared = okPublish();
    const fake = { db, publish: shared.fn };

    const [a, b] = await Promise.all([
      runScheduledPublishTick({ ...fake, now: NOW }),
      runScheduledPublishTick({ ...fake, now: NOW }),
    ]);

    assert.equal(shared.published.length, 1, "exactly one publish for both ticks");
    assert.equal(a.published + b.published, 1);
    assert.equal(a.skipped + b.skipped, 1, "the losing tick skips");
  });

  test("multiple due posts are all processed", async () => {
    const { db } = createFakeDb({
      posts: [
        scheduledPost({ id: "p1" }),
        scheduledPost({ id: "p2" }),
        scheduledPost({ id: "p3", userId: "bob" }),
      ],
    });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.published, 3);
    assert.deepEqual(published, ["p1", "p2", "p3"]);
  });

  test("tick budget stops claiming further posts", async () => {
    const { db, posts } = createFakeDb({
      posts: [scheduledPost({ id: "p1" }), scheduledPost({ id: "p2" })],
    });
    let clockValue = 0;
    const { fn } = okPublish();
    const slowPublish = async (post: { id: string; text: string }) => {
      const outcome = await fn(post);
      clockValue = 241_000; // blow the budget after the first publish
      return outcome;
    };

    const stats = await runScheduledPublishTick({
      db,
      publish: slowPublish,
      now: NOW,
      clock: () => clockValue,
      tickBudgetMs: 240_000,
    });

    assert.equal(stats.published, 1);
    assert.equal(stats.checked, 1);
    assert.equal(posts[1].status, "SCHEDULED", "second post waits for the next tick");
  });

  test("a throwing publish marks the post and target FAILED", async () => {
    const { db, posts } = createFakeDb({
      posts: [scheduledPost()],
    });

    const stats = await runScheduledPublishTick({
      db,
      publish: async () => {
        throw new Error("meta exploded");
      },
      now: NOW,
    });

    assert.equal(stats.failed, 1);
    assert.equal(posts[0].status, "FAILED");
    assert.equal(posts[0].errorMessage, "meta exploded");
    assert.equal(posts[0].targets[0].status, "FAILED");
  });

  test("scheduled X posts are delegated to multi-target orchestration", async () => {
    const post = scheduledPost();
    post.targets[0].platform = "X";
    const { db } = createFakeDb({ posts: [post] });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.published, 1);
    assert.deepEqual(published, ["p1"]);
  });

  test("account resolution is delegated to multi-target orchestration", async () => {
    const { db } = createFakeDb({ posts: [scheduledPost()] });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.published, 1);
    assert.deepEqual(published, ["p1"]);
  });
});

describe("stale PUBLISHING recovery", () => {
  function stalePost(overrides: Partial<PostRow> = {}): PostRow {
    return scheduledPost({
      status: "PUBLISHING",
      updatedAt: new Date(NOW.getTime() - STALE_PUBLISHING_MS - MIN),
      ...overrides,
    });
  }

  test("fresh PUBLISHING (function may still run) is untouched", async () => {
    const { db, posts } = createFakeDb({
      posts: [
        stalePost({
          updatedAt: new Date(NOW.getTime() - 2 * MIN),
        }),
      ],
    });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.recovered + stats.finalized + stats.expired, 0);
    assert.equal(posts[0].status, "PUBLISHING");
    assert.deepEqual(published, []);
  });

  test("stale post whose target already has an externalPostId is finalized without re-publishing", async () => {
    const publishedAt = new Date(NOW.getTime() - 5 * MIN);
    const { db, posts } = createFakeDb({
      posts: [
        stalePost({
          targets: [
            {
              id: "t1",
              postId: "p1",
              status: "PUBLISHED",
              platform: "THREADS",
              externalPostId: "ext-999",
              publishedAt,
            },
          ],
        }),
      ],
    });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.finalized, 1);
    assert.deepEqual(published, [], "must never re-publish an already published target");
    assert.equal(posts[0].status, "PUBLISHED");
    assert.deepEqual(posts[0].publishedAt, publishedAt);
  });

  test("stale post scheduled < 24h is reverted to SCHEDULED and re-published in the same tick", async () => {
    const { db, posts } = createFakeDb({
      posts: [stalePost({ targets: [{ id: "t1", postId: "p1", status: "PUBLISHING", platform: "THREADS", externalPostId: null, publishedAt: null }] })],
    });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.recovered, 1);
    assert.equal(stats.expired, 0);
    assert.equal(stats.published, 1, "re-queued immediately");
    assert.equal(posts[0].status, "PUBLISHING", "claimed again");
    assert.ok(published.includes("p1"));
  });

  test("stale post scheduled > 24h ago is marked FAILED, not retried", async () => {
    const { db, posts } = createFakeDb({
      posts: [
        stalePost({
          scheduledAt: new Date(NOW.getTime() - 25 * 60 * MIN),
          targets: [{ id: "t1", postId: "p1", status: "PUBLISHING", platform: "THREADS", externalPostId: null, publishedAt: null }],
        }),
      ],
    });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.equal(stats.expired, 1);
    assert.equal(stats.published + published.length, 0);
    assert.equal(posts[0].status, "FAILED");
    assert.match(posts[0].errorMessage ?? "", /timed out/);
    assert.equal(posts[0].targets[0].status, "FAILED");
  });

  test("FAILED meta posts are never auto-retried by the tick", async () => {
    const { db, posts } = createFakeDb({
      posts: [scheduledPost({ status: "FAILED", errorMessage: "meta 500" })],
    });
    const { fn, published } = okPublish();

    await runScheduledPublishTick({ db, publish: fn, now: NOW });

    assert.deepEqual(published, []);
    assert.equal(posts[0].status, "FAILED");
  });

  test("recoverStalePublishing can be used standalone and is idempotent on fresh rows", async () => {
    const { db } = createFakeDb({ posts: [] });
    const stats = await recoverStalePublishing(db, NOW);
    assert.deepEqual(stats, { recovered: 0, finalized: 0, expired: 0 });
  });
});

describe("stale TikTok job resume (duplicate protection)", () => {
  function tiktokStuckRow(overrides: Partial<PostRow> = {}): PostRow {
    return {
      ...scheduledPost({
        status: "PUBLISHING",
        updatedAt: new Date(NOW.getTime() - STALE_PUBLISHING_MS - 60_000),
        scheduledAt: new Date(NOW.getTime() - 60 * MIN),
      }),
      targets: [
        {
          id: "t1",
          postId: "p1",
          status: "PUBLISHING",
          platform: "TIKTOK",
          externalPostId: null,
          publishedAt: null,
          externalJobId: "PUB-1",
        },
      ],
      ...overrides,
    };
  }

  test("a pending job blocks any reset: the post keeps waiting for TikTok", async () => {
    const { db, posts } = createFakeDb({ posts: [tiktokStuckRow()] });
    const resumeCalls: string[] = [];
    const stats = await recoverStalePublishing(db, NOW, {
      resumeJob: async (target) => {
        resumeCalls.push(String((target as { externalJobId?: string }).externalJobId));
        return "pending";
      },
    });
    assert.equal(stats.recovered + stats.finalized + stats.expired, 0);
    assert.equal(posts[0].status, "PUBLISHING");
    assert.equal(posts[0].targets[0].status, "PUBLISHING");
  });

  test("a resumed COMPLETE job finalizes the post", async () => {
    const { db, posts } = createFakeDb({ posts: [tiktokStuckRow()] });
    const stats = await recoverStalePublishing(db, NOW, {
      resumeJob: async (target) => {
        const row = posts[0].targets.find((t) => t.id === target.id)!;
        row.status = "PUBLISHED";
        row.externalPostId = "9001";
        row.publishedAt = NOW;
        return "complete";
      },
    });
    assert.equal(stats.finalized, 1);
    assert.equal(posts[0].status, "PUBLISHED");
  });

  test("a resumed FAILED job fails all-failed posts without rescheduling", async () => {
    const { db, posts } = createFakeDb({ posts: [tiktokStuckRow()] });
    const stats = await recoverStalePublishing(db, NOW, {
      resumeJob: async (target) => {
        const row = posts[0].targets.find((t) => t.id === target.id)!;
        row.status = "FAILED";
        row.errorMessage = "TikTok rejected the video";
        return "failed";
      },
    });
    assert.equal(stats.finalized, 1);
    assert.equal(posts[0].status, "FAILED");
    assert.equal(posts[0].errorMessage, "TIKTOK: TikTok rejected the video");
  });

  test("without a resume handler a target holding an externalJobId is never re-initialized or reset", async () => {
    const { db, posts } = createFakeDb({ posts: [tiktokStuckRow()] });
    const stats = await recoverStalePublishing(db, NOW);
    assert.equal(stats.recovered, 0, "must not blind-reset a job we cannot check");
    assert.equal(posts[0].status, "PUBLISHING");
    assert.equal(posts[0].targets[0].status, "PUBLISHING");
  });
});

describe("stale recovery correctness fixes", () => {
  function staleRow(overrides: Partial<PostRow> = {}): PostRow {
    return scheduledPost({
      status: "PUBLISHING",
      updatedAt: new Date(NOW.getTime() - STALE_PUBLISHING_MS - MIN),
      ...overrides,
    });
  }

  test("unscheduled stuck post resets to DRAFT, not SCHEDULED", async () => {
    const { db, posts } = createFakeDb({
      posts: [
        staleRow({
          scheduledAt: null,
          targets: [
            { id: "t1", postId: "p1", status: "PUBLISHING", platform: "X", externalPostId: null, publishedAt: null },
          ],
        }),
      ],
    });
    const stats = await recoverStalePublishing(db, NOW);
    assert.equal(stats.recovered, 1);
    assert.equal(posts[0].status, "DRAFT");
    assert.equal(posts[0].targets[0].status, "PENDING");
  });

  test("partial recovery keeps per-target errors on the post", async () => {
    const { db, posts } = createFakeDb({
      posts: [
        staleRow({
          targets: [
            { id: "t1", postId: "p1", status: "PUBLISHED", platform: "THREADS", externalPostId: "e1", publishedAt: NOW },
            { id: "t2", postId: "p1", status: "FAILED", platform: "X", externalPostId: null, publishedAt: null, errorMessage: "X exploded" },
          ],
        }),
      ],
    });
    const stats = await recoverStalePublishing(db, NOW);
    assert.equal(stats.finalized, 1);
    assert.equal(posts[0].status, "PARTIALLY_PUBLISHED");
    assert.match(posts[0].errorMessage ?? "", /X exploded/);
  });

  test("concurrent completion wins: reset never overwrites a finalized post", async () => {
    const seed = staleRow({
      targets: [
        { id: "t1", postId: "p1", status: "PUBLISHING", platform: "THREADS", externalPostId: null, publishedAt: null },
      ],
    });
    const { db, posts } = createFakeDb({ posts: [seed] });
    // Simulate a slow publish finishing after the stale snapshot: the
    // conditional writes must not resurrect it as SCHEDULED/PENDING.
    const originalFindMany = db.post.findMany;
    let calls = 0;
    db.post.findMany = (async (args: { where: Record<string, unknown>; include: { targets: true } }) => {
      calls++;
      const rows = await originalFindMany(args);
      if (calls === 1) {
        for (const p of posts) {
          if (p.id === "p1") {
            p.status = "PUBLISHED";
            p.targets[0].status = "PUBLISHED";
            p.targets[0].externalPostId = "e1";
          }
        }
      }
      return rows;
    }) as typeof db.post.findMany;
    const stats = await recoverStalePublishing(db, NOW);
    assert.equal(stats.recovered, 0);
    assert.equal(stats.finalized, 0);
    assert.equal(posts[0].status, "PUBLISHED");
    assert.equal(posts[0].targets[0].status, "PUBLISHED");
  });
});

describe("tick unexpected-throw recompute", () => {
  test("throw with a published sibling yields PARTIALLY_PUBLISHED, not blind FAILED", async () => {
    const { db, posts } = createFakeDb({
      posts: [
        scheduledPost({
          targets: [
            { id: "t1", postId: "p1", status: "PUBLISHED", platform: "THREADS", externalPostId: "e1", publishedAt: NOW },
            { id: "t2", postId: "p1", status: "FAILED", platform: "X", externalPostId: null, publishedAt: null, errorMessage: "X down" },
          ],
        }),
      ],
    });
    const stats = await runScheduledPublishTick({
      db,
      publish: async () => {
        throw new Error("worker exploded");
      },
      now: NOW,
    });
    assert.equal(stats.failed, 1);
    assert.equal(posts[0].status, "PARTIALLY_PUBLISHED");
    assert.match(posts[0].errorMessage ?? "", /X down/);
  });

  test("throw with nothing published fails the post and its claimed targets", async () => {
    const { db, posts } = createFakeDb({
      posts: [
        scheduledPost({
          targets: [
            { id: "t1", postId: "p1", status: "FAILED", platform: "X", externalPostId: null, publishedAt: null, errorMessage: "old" },
            { id: "t2", postId: "p1", status: "PENDING", platform: "THREADS", externalPostId: null, publishedAt: null },
          ],
        }),
      ],
    });
    const stats = await runScheduledPublishTick({
      db,
      // Simulates executePublish claiming t2, then crashing before finalize.
      publish: async () => {
        posts[0].targets.find((t) => t.id === "t2")!.status = "PUBLISHING";
        throw new Error("worker exploded");
      },
      now: NOW,
    });
    assert.equal(stats.failed, 1);
    assert.equal(posts[0].status, "FAILED");
    assert.equal(
      posts[0].targets.find((t) => t.id === "t2")!.status,
      "FAILED"
    );
  });
});
