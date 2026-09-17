import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import {
  isCronAuthorized,
  recoverStalePublishing,
  runScheduledPublishTick,
  STALE_PUBLISHING_MS,
  withCron,
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
      // Honors orderBy + take so the batching contract is actually exercised
      // (Array.prototype.sort is stable, so ties keep insertion order —
      // matching how the real index scan behaves for equal sort keys).
      findMany: async (args) => {
        const matched = posts.filter((p) =>
          matchesWhere(p as unknown as Record<string, unknown>, args.where)
        );
        const orderKey = args.orderBy
          ? (Object.keys(args.orderBy)[0] as keyof PostRow)
          : null;
        const sorted = orderKey
          ? [...matched].sort((a, b) => {
              const av = dateValue(a[orderKey])?.getTime() ?? 0;
              const bv = dateValue(b[orderKey])?.getTime() ?? 0;
              return av - bv;
            })
          : matched;
        const limited =
          typeof args.take === "number" ? sorted.slice(0, args.take) : sorted;
        return limited.map(clonePost);
      },
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

describe("withCron shared wrapper (E5)", () => {
  const authed = () => cronRequest("GET", "Bearer test-cron-secret-123");

  test("GET and POST share one authorized handler", async () => {
    const handlers = withCron(async () => NextResponse.json({ ok: true }));
    assert.equal((await handlers.GET(authed())).status, 200);
    assert.equal((await handlers.POST(authed())).status, 200);
  });

  test("unauthorized requests never reach the handler", async () => {
    let called = 0;
    const handlers = withCron(async () => {
      called++;
      return NextResponse.json({ ok: true });
    });
    const res = await handlers.GET(cronRequest("GET"));
    assert.equal(res.status, 401);
    assert.equal(called, 0);
  });

  test("handler throws become a generic 500 without internals", async () => {
    const handlers = withCron(async () => {
      throw new Error("postgres://secret-internal-detail");
    });
    const res = await handlers.POST(authed());
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error?: unknown };
    assert.equal(body.error, "Cron run failed");
  });
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
      // Serial mode: the budget is re-checked between every post. The
      // chunked behaviour that the default concurrency produces is covered
      // separately in "bounded tick concurrency".
      concurrency: 1,
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

describe("bounded tick batching (P0.2)", () => {
  /** n due posts, each scheduled one minute further in the past than the last. */
  function dueBacklog(n: number): PostRow[] {
    return Array.from({ length: n }, (_, i) =>
      scheduledPost({
        id: `p${i}`,
        // p0 is the most recently due, p{n-1} the oldest-due.
        scheduledAt: new Date(NOW.getTime() - (i + 1) * MIN),
        targets: [
          {
            id: `t${i}`,
            postId: `p${i}`,
            status: "PENDING",
            platform: "THREADS",
            externalPostId: null,
            publishedAt: null,
          },
        ],
      })
    );
  }

  test("a due-set larger than the batch claims only batchSize posts", async () => {
    const { db, posts } = createFakeDb({ posts: dueBacklog(10) });
    const { fn, published } = okPublish();

    const stats = await runScheduledPublishTick({
      db,
      publish: fn,
      now: NOW,
      batchSize: 4,
    });

    assert.equal(stats.checked, 4, "only one batch is read");
    assert.equal(published.length, 4);
    assert.equal(
      posts.filter((p) => p.status === "SCHEDULED").length,
      6,
      "the rest stay SCHEDULED for the next tick — bounded, not dropped"
    );
  });

  test("the batch is oldest-DUE-first, not oldest-created-first", async () => {
    // Every post is created at the same instant, so only scheduledAt can
    // produce this ordering: p9 is the longest overdue.
    const { db } = createFakeDb({ posts: dueBacklog(10) });
    const { fn, published } = okPublish();

    await runScheduledPublishTick({
      db,
      publish: fn,
      now: NOW,
      batchSize: 3,
    });

    assert.deepEqual(published, ["p9", "p8", "p7"]);
  });

  test("successive ticks drain the backlog without re-publishing a claimed post", async () => {
    const { db, posts } = createFakeDb({ posts: dueBacklog(10) });
    const published: string[] = [];
    const { fn } = okPublish(published);

    for (let tick = 0; tick < 3; tick++) {
      await runScheduledPublishTick({ db, publish: fn, now: NOW, batchSize: 4 });
    }

    assert.equal(published.length, 10, "backlog drains across ticks");
    assert.equal(
      new Set(published).size,
      10,
      "the conditional claim still guarantees one publish per post"
    );
    assert.equal(posts.filter((p) => p.status === "SCHEDULED").length, 0);
  });

  test("overlapping ticks over one batch still publish each post once", async () => {
    const { db } = createFakeDb({ posts: dueBacklog(6) });
    const published: string[] = [];
    const { fn } = okPublish(published);

    // Two invocations racing over the same bounded batch (a */5 cadence can
    // overlap a tick that runs close to maxDuration).
    await Promise.all([
      runScheduledPublishTick({ db, publish: fn, now: NOW, batchSize: 6 }),
      runScheduledPublishTick({ db, publish: fn, now: NOW, batchSize: 6 }),
    ]);

    assert.equal(published.length, 6);
    assert.equal(new Set(published).size, 6, "no duplicate publish");
  });

  test("the recovery pass is bounded and oldest-stuck-first", async () => {
    const stuck = Array.from({ length: 8 }, (_, i) =>
      scheduledPost({
        id: `s${i}`,
        status: "PUBLISHING",
        // s7 has been stuck the longest.
        updatedAt: new Date(NOW.getTime() - STALE_PUBLISHING_MS - (i + 1) * MIN),
        scheduledAt: new Date(NOW.getTime() - MIN),
        targets: [
          {
            id: `st${i}`,
            postId: `s${i}`,
            status: "PUBLISHING",
            platform: "THREADS",
            externalPostId: null,
            publishedAt: null,
          },
        ],
      })
    );
    const { db, posts } = createFakeDb({ posts: stuck });

    const stats = await recoverStalePublishing(db, NOW, { batchSize: 3 });

    assert.equal(stats.recovered, 3, "only one batch is recovered per pass");
    const recovered = posts
      .filter((p) => p.status === "SCHEDULED")
      .map((p) => p.id);
    assert.deepEqual(recovered, ["s5", "s6", "s7"].sort());
  });
});

describe("bounded tick concurrency", () => {
  function dueBatch(n: number): PostRow[] {
    return Array.from({ length: n }, (_, i) =>
      scheduledPost({
        id: `c${i}`,
        scheduledAt: new Date(NOW.getTime() - (n - i) * MIN),
        targets: [
          {
            id: `ct${i}`,
            postId: `c${i}`,
            status: "PENDING",
            platform: "THREADS",
            externalPostId: null,
            publishedAt: null,
          },
        ],
      })
    );
  }

  /** Publish that records max observed overlap, so concurrency is measurable. */
  function trackingPublish(delayTicks = 1) {
    let inFlight = 0;
    let peak = 0;
    const order: string[] = [];
    return {
      get peak() {
        return peak;
      },
      order,
      fn: async (post: { id: string; text: string }) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        order.push(post.id);
        for (let i = 0; i < delayTicks; i++) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        inFlight--;
        return { ok: true, externalPostId: `ext-${post.id}` } as const;
      },
    };
  }

  test("posts publish simultaneously up to the concurrency limit", async () => {
    const { db } = createFakeDb({ posts: dueBatch(8) });
    const publisher = trackingPublish(2);

    const stats = await runScheduledPublishTick({
      db,
      publish: publisher.fn,
      now: NOW,
      concurrency: 4,
    });

    assert.equal(stats.published, 8);
    assert.equal(publisher.peak, 4, "four posts were genuinely in flight at once");
  });

  test("concurrency never exceeds the configured limit", async () => {
    const { db } = createFakeDb({ posts: dueBatch(10) });
    const publisher = trackingPublish(3);

    await runScheduledPublishTick({
      db,
      publish: publisher.fn,
      now: NOW,
      concurrency: 2,
    });

    assert.equal(publisher.peak, 2, "the bound is a bound, not a suggestion");
  });

  test("concurrency: 1 reproduces the previous serial behaviour", async () => {
    const { db } = createFakeDb({ posts: dueBatch(5) });
    const publisher = trackingPublish(2);

    await runScheduledPublishTick({
      db,
      publish: publisher.fn,
      now: NOW,
      concurrency: 1,
    });

    assert.equal(publisher.peak, 1);
  });

  test("each post is still claimed exactly once under concurrency", async () => {
    const { db, posts } = createFakeDb({ posts: dueBatch(12) });
    const publisher = trackingPublish(1);

    const stats = await runScheduledPublishTick({
      db,
      publish: publisher.fn,
      now: NOW,
      concurrency: 6,
    });

    assert.equal(publisher.order.length, 12);
    assert.equal(
      new Set(publisher.order).size,
      12,
      "the conditional claim still guarantees one publish per post"
    );
    assert.equal(stats.published, 12);
    // The fake publisher does not finalize status (the real
    // publishPostTargets does), so what the tick itself owns is the claim:
    // every post left SCHEDULED and none was claimed twice.
    assert.equal(
      posts.filter((p) => p.status === "SCHEDULED").length,
      0,
      "every post was claimed"
    );
    assert.equal(stats.skipped, 0, "no post was claimed by a second worker");
  });

  test("two overlapping concurrent ticks publish each post once", async () => {
    const { db } = createFakeDb({ posts: dueBatch(8) });
    const publisher = trackingPublish(2);

    await Promise.all([
      runScheduledPublishTick({ db, publish: publisher.fn, now: NOW, concurrency: 4 }),
      runScheduledPublishTick({ db, publish: publisher.fn, now: NOW, concurrency: 4 }),
    ]);

    assert.equal(
      new Set(publisher.order).size,
      publisher.order.length,
      "no post was published twice across overlapping invocations"
    );
    assert.equal(new Set(publisher.order).size, 8);
  });

  test("one post failing does not abort its in-flight siblings", async () => {
    const { db, posts } = createFakeDb({ posts: dueBatch(4) });
    const published: string[] = [];

    const stats = await runScheduledPublishTick({
      db,
      publish: async (post) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (post.id === "c1") throw new Error("provider exploded");
        published.push(post.id);
        return { ok: true, externalPostId: `ext-${post.id}` } as const;
      },
      now: NOW,
      concurrency: 4,
    });

    assert.equal(stats.published, 3, "siblings completed");
    assert.equal(stats.failed, 1);
    assert.deepEqual(published.sort(), ["c0", "c2", "c3"]);
    const failed = posts.find((p) => p.id === "c1");
    assert.equal(failed?.status, "FAILED", "the failing post is still repaired");
    assert.equal(failed?.targets[0].status, "FAILED");
  });

  test("the budget is checked per chunk and stops the next one", async () => {
    const { db, posts } = createFakeDb({ posts: dueBatch(12) });
    let clockValue = 0;

    const stats = await runScheduledPublishTick({
      db,
      publish: async (post) => {
        // Blow the budget while the first chunk is in flight.
        clockValue = 99_000;
        return { ok: true, externalPostId: `ext-${post.id}` } as const;
      },
      now: NOW,
      clock: () => clockValue,
      tickBudgetMs: 42_000,
      concurrency: 4,
    });

    assert.equal(
      stats.checked,
      4,
      "the in-flight chunk completes; the next chunk is not started"
    );
    assert.equal(stats.published, 4);
    assert.equal(
      posts.filter((p) => p.status === "SCHEDULED").length,
      8,
      "the remainder waits for the next invocation, still in due order"
    );
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
