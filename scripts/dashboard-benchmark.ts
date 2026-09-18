/**
 * Dashboard analytics benchmark (read-only measurement + synthetic data).
 *
 * Measures per-query timings (Q1-Q10), total `getDashboard()` duration,
 * JS view-model time, and approximate EXPLAIN plans for Q8/Q9/Q10.
 *
 * SAFETY (never relax these):
 * - Requires `ALLOW_DASHBOARD_BENCHMARK=1`, otherwise exits without touching
 *   anything.
 * - Refuses production-like environments (`VERCEL_ENV=production` or a
 *   `postvia.online` hostname in the datasource URL).
 * - All synthetic rows use `dashboard-bench-*` marker emails/externalIds and
 *   are deleted in `finally` (postTarget -> media -> post -> socialAccount ->
 *   session/account/preferences -> user), mirroring the account-delete order.
 * - No DDL, no index changes, no Blob/Stripe/OAuth usage.
 *
 * Usage:
 *   ALLOW_DASHBOARD_BENCHMARK=1 node --import tsx \
 *     --env-file-if-exists=.env --env-file-if-exists=.env.local \
 *     scripts/dashboard-benchmark.ts
 *
 * Note on domain limits: Free allows 15 posts/mo + 1 account, Growth
 * 300 posts/mo + 5 accounts, Scale is unlimited. Scenarios above Growth
 * are synthetic Scale-like rows (direct Prisma inserts, bypassing
 * entitlement gates) and are labeled as such — they model stress, not a
 * reachable Free/Growth state.
 */

import { PrismaClient } from "@prisma/client";
import { getDashboard } from "../src/lib/dashboard";
import type { DashboardQueryTimings } from "../src/lib/dashboard-timing";

const prisma = new PrismaClient();

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 7;
const INSERT_BATCH = 1000;
const MARKER = `dashboard-bench-${Date.now()}`;

type Scenario = {
  name: string;
  posts: number;
  accounts: number;
  /** Spread of createdAt range in days (covers the 12-week window + older). */
  spanDays: number;
};

const SCENARIOS: Scenario[] = [
  { name: "small", posts: 100, accounts: 2, spanDays: 112 },
  { name: "medium", posts: 1000, accounts: 5, spanDays: 120 },
  { name: "large", posts: 5000, accounts: 8, spanDays: 140 },
  { name: "stress", posts: 10000, accounts: 8, spanDays: 140 },
];

const PLATFORMS = [
  "X",
  "THREADS",
  "TIKTOK",
  "INSTAGRAM",
  "YOUTUBE",
  "FACEBOOK",
  "LINKEDIN",
  "PINTEREST",
] as const;

const POST_STATUSES = [
  "PUBLISHED",
  "PUBLISHED",
  "SCHEDULED",
  "DRAFT",
  "FAILED",
  "PARTIALLY_PUBLISHED",
  "PUBLISHING",
] as const;

function assertBenchmarkAllowed(): void {
  if (process.env.ALLOW_DASHBOARD_BENCHMARK !== "1") {
    throw new Error(
      "Refusing to run: set ALLOW_DASHBOARD_BENCHMARK=1 to confirm an isolated environment.",
    );
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to run with VERCEL_ENV=production.");
  }
  const url = process.env.DATABASE_URL_POSTGRES_PRISMA_URL ?? "";
  if (url.includes("postvia.online")) {
    throw new Error("Refusing to run against a production-like hostname.");
  }
}

function stats(values: number[]): {
  n: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (q: number): number => sorted[Math.min(n - 1, Math.ceil(q * n) - 1)] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n,
    min: sorted[0] ?? 0,
    p50: pick(0.5),
    p95: pick(0.95),
    max: sorted[n - 1] ?? 0,
    mean: n === 0 ? 0 : sum / n,
  };
}

function round2(ms: number): number {
  return Math.round(ms * 100) / 100;
}

async function createScenarioUser(scenario: Scenario): Promise<string> {
  const email = `${MARKER}-${scenario.name}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Dashboard bench ${scenario.name}`,
      emailVerified: true,
      onboardingCompleted: true,
    },
    select: { id: true },
  });

  const accounts = await prisma.socialAccount.createManyAndReturn({
    data: Array.from({ length: scenario.accounts }, (_, i) => ({
      userId: user.id,
      platform: PLATFORMS[i % PLATFORMS.length] as never,
      externalId: `${MARKER}-${scenario.name}-ext-${i}`,
      username: `${MARKER}-${scenario.name}-user-${i}`,
      accessToken: "bench-dummy-token",
    })),
    select: { id: true, platform: true },
  });

  const now = Date.now();
  const spanMs = scenario.spanDays * 86_400_000;
  const postRows: {
    userId: string;
    text: string;
    status: never;
    createdAt: Date;
    updatedAt: Date;
    scheduledAt: Date | null;
    publishedAt: Date | null;
  }[] = [];
  for (let i = 0; i < scenario.posts; i += 1) {
    const status = POST_STATUSES[i % POST_STATUSES.length] as never;
    const createdAt = new Date(now - Math.floor((i / scenario.posts) * spanMs));
    postRows.push({
      userId: user.id,
      text: `bench-post ${MARKER} ${scenario.name} #${i} alpha beta gamma`,
      status,
      createdAt,
      updatedAt: createdAt,
      scheduledAt:
        status === "SCHEDULED"
          ? new Date(now + ((i % 30) + 1) * 86_400_000)
          : null,
      publishedAt:
        status === "PUBLISHED" ? new Date(createdAt.getTime() + 3_600_000) : null,
    });
  }
  const postIds: string[] = [];
  for (let i = 0; i < postRows.length; i += INSERT_BATCH) {
    const created = await prisma.post.createManyAndReturn({
      data: postRows.slice(i, i + INSERT_BATCH),
      select: { id: true, status: true, createdAt: true },
    });
    for (const row of created) postIds.push(row.id);
  }

  const targetRows: {
    postId: string;
    platform: never;
    socialAccountId: string;
    status: never;
    publishedAt: Date | null;
  }[] = [];
  postIds.forEach((postId, i) => {
    const count = 1 + (i % 2);
    for (let k = 0; k < count; k += 1) {
      const account = accounts[(i + k) % accounts.length];
      if (!account) continue;
      const failed = i % 7 === 4 || i % 7 === 5;
      targetRows.push({
        postId,
        platform: account.platform as never,
        socialAccountId: account.id,
        status: (failed ? "FAILED" : "PUBLISHED") as never,
        publishedAt: failed ? null : new Date(now - (i % 80) * 86_400_000),
      });
    }
  });
  for (let i = 0; i < targetRows.length; i += INSERT_BATCH) {
    await prisma.postTarget.createMany({
      data: targetRows.slice(i, i + INSERT_BATCH),
    });
  }
  return user.id;
}

async function deleteScenarioUser(userId: string): Promise<void> {
  await prisma.postTarget.deleteMany({ where: { post: { userId } } });
  await prisma.media.deleteMany({ where: { userId } });
  await prisma.post.deleteMany({ where: { userId } });
  await prisma.socialAccount.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.userPreferences.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

type ExplainSummary = {
  executionMs: number | null;
  planningMs: number | null;
  topNode: string | null;
  scanTypes: string[];
  indexUsed: boolean;
  actualRows: number | null;
  sharedHitBlocks: number | null;
};

function summarizeExplain(planJson: unknown): ExplainSummary {
  const out: ExplainSummary = {
    executionMs: null,
    planningMs: null,
    topNode: null,
    scanTypes: [],
    indexUsed: false,
    actualRows: null,
    sharedHitBlocks: null,
  };
  try {
    const root = (planJson as Record<string, unknown>[])[0] ?? {};
    if (typeof root["Execution Time"] === "number") {
      out.executionMs = root["Execution Time"];
    }
    if (typeof root["Planning Time"] === "number") {
      out.planningMs = root["Planning Time"];
    }
    const plan = root.Plan as Record<string, unknown> | undefined;
    if (plan && typeof plan["Node Type"] === "string") {
      out.topNode = plan["Node Type"] as string;
      if (typeof plan["Actual Rows"] === "number") {
        out.actualRows = plan["Actual Rows"] as number;
      }
      if (typeof plan["Shared Hit Blocks"] === "number") {
        out.sharedHitBlocks = plan["Shared Hit Blocks"] as number;
      }
    }
    const seen = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (typeof record["Node Type"] === "string") {
        const nodeType = record["Node Type"] as string;
        if (nodeType.includes("Scan")) seen.add(nodeType);
        if (
          nodeType.includes("Index") ||
          typeof record["Index Name"] === "string"
        ) {
          out.indexUsed = true;
        }
      }
      const plans = record.Plans;
      if (Array.isArray(plans)) {
        for (const child of plans) walk(child);
      }
    };
    walk(plan);
    out.scanTypes = [...seen].sort();
  } catch {
    // Keep nulls; raw plan is still recorded by the caller.
  }
  return out;
}

/**
 * APPROXIMATE plans: hand-written SQL mirroring the shape of the Prisma
 * queries (same tables, filters, grouping, ordering). These are NOT the
 * exact bytes Prisma sends — see docs/dashboard-performance.md.
 */
async function explainApproximate(
  userId: string,
  twelveWeeksAgo: Date,
): Promise<Record<string, ExplainSummary>> {
  const q8 = (await prisma.$queryRawUnsafe<{ "QUERY PLAN": unknown }[]>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT "PostTarget"."platform", "PostTarget"."status", COUNT(*)::int AS "count"
     FROM "PostTarget" INNER JOIN "Post" ON "Post"."id" = "PostTarget"."postId"
     WHERE "Post"."userId" = $1
     GROUP BY "PostTarget"."platform", "PostTarget"."status"`,
    userId,
  )) as unknown as { "QUERY PLAN": unknown }[];
  const q9 = (await prisma.$queryRawUnsafe<{ "QUERY PLAN": unknown }[]>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT "createdAt", "status" FROM "Post"
     WHERE "userId" = $1 AND "createdAt" >= $2
     ORDER BY "createdAt" ASC`,
    userId,
    twelveWeeksAgo,
  )) as unknown as { "QUERY PLAN": unknown }[];
  const q10 = (await prisma.$queryRawUnsafe<{ "QUERY PLAN": unknown }[]>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT "PostTarget"."socialAccountId", COUNT(*)::int AS "count", MAX("PostTarget"."publishedAt") AS "max"
     FROM "PostTarget" INNER JOIN "Post" ON "Post"."id" = "PostTarget"."postId"
     WHERE "Post"."userId" = $1 AND "PostTarget"."socialAccountId" IS NOT NULL
     GROUP BY "PostTarget"."socialAccountId"`,
    userId,
  )) as unknown as { "QUERY PLAN": unknown }[];
  return {
    q8: summarizeExplain(q8[0]?.["QUERY PLAN"]),
    q9: summarizeExplain(q9[0]?.["QUERY PLAN"]),
    q10: summarizeExplain(q10[0]?.["QUERY PLAN"]),
  };
}

/** Measures the wrapper itself (no DB): 20k iterations, ns per call. */
async function measureWrapperOverheadNs(): Promise<number> {
  const iterations = 20_000;
  const directStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await Promise.resolve();
  }
  const directMs = performance.now() - directStart;
  const { timeQuery } = await import("../src/lib/dashboard-timing");
  const wrappedStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await timeQuery(() => Promise.resolve());
  }
  const wrappedMs = performance.now() - wrappedStart;
  return ((wrappedMs - directMs) / iterations) * 1_000_000;
}

async function main(): Promise<void> {
  assertBenchmarkAllowed();
  const createdUserIds: string[] = [];
  try {
    const dbInfo = await prisma.$queryRawUnsafe<{ db: string }[]>(
      "SELECT current_database() AS db",
    );
    const result: Record<string, unknown> = {
      marker: MARKER,
      database: dbInfo[0]?.db ?? null,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      scenarios: {},
    };

    for (const scenario of SCENARIOS) {
      const userId = await createScenarioUser(scenario);
      createdUserIds.push(userId);
      const counts = {
        posts: await prisma.post.count({ where: { userId } }),
        targets: await prisma.postTarget.count({
          where: { post: { userId } },
        }),
        accounts: await prisma.socialAccount.count({ where: { userId } }),
      };

      const perKey: Record<string, number[]> = {};
      const totals: number[] = [];
      const runOnce = async (filter: {
        q: string;
        status: string;
        isFiltered: boolean;
      }): Promise<void> => {
        let captured: DashboardQueryTimings = {};
        await getDashboard(
          { userId, filter },
          {
            onTimings: (timings) => {
              captured = timings;
            },
          },
        );
        for (const [key, ms] of Object.entries(captured)) {
          if (typeof ms !== "number") continue;
          if (key === "dashboard.total") {
            totals.push(ms);
            continue;
          }
          perKey[key] = perKey[key] ?? [];
          perKey[key]?.push(ms);
        }
      };

      const plainFilter = { q: "", status: "all", isFiltered: false };
      for (let i = 0; i < WARMUP_RUNS; i += 1) await runOnce(plainFilter);
      for (let i = 0; i < MEASURED_RUNS; i += 1) await runOnce(plainFilter);

      // Scenario E: text search changes Q2 into an ILIKE query.
      const q2search: number[] = [];
      for (let i = 0; i < MEASURED_RUNS; i += 1) {
        let captured: DashboardQueryTimings = {};
        await getDashboard(
          {
            userId,
            filter: { q: "bench-post", status: "all", isFiltered: true },
          },
          {
            onTimings: (timings) => {
              captured = timings;
            },
          },
        );
        const ms = captured["dashboard.q2.recentPosts"];
        if (typeof ms === "number") q2search.push(ms);
      }

      const queries: Record<string, unknown> = {};
      for (const [key, values] of Object.entries(perKey)) {
        const s = stats(values);
        queries[key] = {
          min: round2(s.min),
          p50: round2(s.p50),
          p95: round2(s.p95),
          max: round2(s.max),
          mean: round2(s.mean),
          n: s.n,
        };
      }
      const totalStats = stats(totals);
      (result.scenarios as Record<string, unknown>)[scenario.name] = {
        dataset: counts,
        total: {
          min: round2(totalStats.min),
          p50: round2(totalStats.p50),
          p95: round2(totalStats.p95),
          max: round2(totalStats.max),
          mean: round2(totalStats.mean),
          n: totalStats.n,
        },
        queries,
        q2WithTextSearch: (() => {
          const s = stats(q2search);
          return {
            min: round2(s.min),
            p50: round2(s.p50),
            p95: round2(s.p95),
            max: round2(s.max),
            n: s.n,
          };
        })(),
      };

      // EXPLAIN only on the two largest datasets to bound load.
      if (scenario.name === "large" || scenario.name === "stress") {
        const twelveWeeksAgo = new Date(Date.now() - 84 * 86_400_000);
        const explain = await explainApproximate(userId, twelveWeeksAgo);
        ((result.scenarios as Record<string, unknown>)[scenario.name] as Record<string, unknown>).explainApproximate = explain;
      }
    }

    result.wrapperOverheadNsPerCall = Math.round(
      await measureWrapperOverheadNs(),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    for (const userId of createdUserIds) {
      try {
        await deleteScenarioUser(userId);
      } catch (error) {
        console.error(
          `cleanup failed for benchmark user ${userId.slice(0, 8)}…:`,
          error,
        );
      }
    }
    await prisma.$disconnect();
  }
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
