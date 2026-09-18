import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { authorizeMediaUpload } from "../src/lib/media-upload";
import {
  applyPeriodRules,
  canCreatePost,
  resolveEffectiveFromRows,
  toPlanIdSafe,
} from "../src/lib/entitlements";
import { getPlan } from "../src/lib/plans";
import {
  OTP_SEND_IP_MAX_PER_HOUR,
  OTP_SEND_MAX_PER_HOUR,
  OTP_VERIFY_IP_MAX_PER_WINDOW,
  OTP_VERIFY_MAX_PER_WINDOW,
} from "../src/lib/otp-config";
import {
  WRITE_LIMIT_ACCOUNT_DELETE,
  WRITE_LIMIT_CREATOR_INFO,
  WRITE_LIMIT_MEDIA_STATUS,
  WRITE_LIMIT_MEDIA_UPLOAD,
  WRITE_LIMIT_POSTS_WRITE,
} from "../src/lib/abuse";
import {
  createTiktokMediaUrl,
  getBridgeSecret,
  verifyTiktokMediaToken,
} from "../src/lib/tiktok-media-bridge";

const NOW = new Date("2026-09-12T12:00:00Z").getTime();
const MEDIA_ID = "cm3diaAAAABBBBCCCCDDDD";
const BASE = "https://postvia.online";

function freeUsage() {
  return {
    postsThisMonth: 0,
    monthStart: new Date("2026-09-01T00:00:00Z"),
    accountsByPlatform: {},
    totalAccounts: 0,
    scheduledPosts: 0,
    identityPostsUsed: null,
  };
}

describe("security hardening: media ownership boundary", () => {
  test("User B cannot authorize upload against User A's post", () => {
    const result = authorizeMediaUpload({
      user: { id: "user-B" },
      post: { userId: "user-A" },
      statedPostId: "post-A",
    });
    assert.deepEqual(result, {
      ok: false,
      status: 404,
      error: "Post not found",
    });
  });

  test("owner authorizes upload against own post", () => {
    const result = authorizeMediaUpload({
      user: { id: "user-A" },
      post: { userId: "user-A" },
      statedPostId: "post-A",
    });
    assert.deepEqual(result, {
      ok: true,
      userId: "user-A",
      postId: "post-A",
    });
  });

  test("missing post stays 404 regardless of caller", () => {
    assert.deepEqual(
      authorizeMediaUpload({
        user: { id: "user-B" },
        post: null,
        statedPostId: "post-A",
      }),
      { ok: false, status: 404, error: "Post not found" }
    );
  });
});

describe("security hardening: selectedPlan is never an entitlement", () => {
  test("FREE subscription row resolves to free even with paid intent elsewhere", () => {
    // resolveEffectiveFromRows takes NO selectedPlan input by construction:
    // only the Subscription row (+ admin override) decides.
    const effective = resolveEffectiveFromRows({
      subscription: {
        plan: "FREE",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        stripeCustomerId: null,
        stripeSubId: null,
      },
      testOverride: null,
      isAdmin: false,
      nowMs: NOW,
    });
    assert.equal(effective.plan, "free");
    assert.equal(effective.source, "subscription");
  });

  test("free effective plan is quota-gated, not intent-gated", () => {
    const gate = canCreatePost(
      {
        plan: "free",
        status: "ACTIVE",
        bypass: false,
        source: "subscription",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        entitlements: getPlan("free").entitlements,
      },
      { ...freeUsage(), postsThisMonth: 15 }
    );
    assert.equal(gate.ok, false);
  });

  test("unknown stored plan degrades to free, never paid", () => {
    assert.equal(toPlanIdSafe("GROWTH_HACKED" as never), "free");
  });
});

describe("security hardening: billing period rules still fail closed", () => {
  test("CANCELED revokes paid entitlements", () => {
    const r = applyPeriodRules(
      {
        plan: "GROWTH",
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      NOW
    );
    assert.equal(r.plan, "free");
    assert.equal(r.expired, true);
  });

  test("UNPAID revokes paid entitlements", () => {
    const r = applyPeriodRules(
      {
        plan: "SCALE",
        status: "UNPAID",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      NOW
    );
    assert.equal(r.plan, "free");
    assert.equal(r.expired, true);
  });

  test("cancel-at-period-end without period end never reads as paid", () => {
    const r = applyPeriodRules(
      {
        plan: "GROWTH",
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: null,
      },
      NOW
    );
    assert.equal(r.plan, "free");
  });
});

describe("security hardening: TikTok bridge fail-closed, no key reuse", () => {
  test("missing TIKTOK_BRIDGE_SECRET fails closed even with BETTER_AUTH_SECRET set", () => {
    const savedBridge = process.env.TIKTOK_BRIDGE_SECRET;
    const savedAuth = process.env.BETTER_AUTH_SECRET;
    try {
      delete process.env.TIKTOK_BRIDGE_SECRET;
      process.env.BETTER_AUTH_SECRET = "auth-secret-must-not-work";
      assert.equal(getBridgeSecret(), "");
      assert.throws(
        () =>
          createTiktokMediaUrl({ mediaId: MEDIA_ID, baseUrl: BASE, nowMs: NOW }),
        /not configured/
      );
      assert.deepEqual(
        verifyTiktokMediaToken({
          mediaId: MEDIA_ID,
          expires: "9999999999",
          sig: "x",
          nowMs: NOW,
        }),
        { ok: false, reason: "unconfigured" }
      );
    } finally {
      if (savedBridge === undefined) delete process.env.TIKTOK_BRIDGE_SECRET;
      else process.env.TIKTOK_BRIDGE_SECRET = savedBridge;
      if (savedAuth === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = savedAuth;
    }
  });
});

describe("security hardening: rate-limit budgets", () => {
  test("new write scopes have sane, non-breaking budgets", () => {
    assert.equal(WRITE_LIMIT_POSTS_WRITE, 100);
    assert.equal(WRITE_LIMIT_MEDIA_UPLOAD, 200);
    assert.equal(WRITE_LIMIT_MEDIA_STATUS, 600);
    assert.equal(WRITE_LIMIT_ACCOUNT_DELETE, 10);
    assert.equal(WRITE_LIMIT_CREATOR_INFO, 120);
  });

  test("OTP per-IP buckets are roomier than per-email (NAT-safe)", () => {
    assert.ok(OTP_SEND_IP_MAX_PER_HOUR > OTP_SEND_MAX_PER_HOUR);
    assert.ok(OTP_VERIFY_IP_MAX_PER_WINDOW > OTP_VERIFY_MAX_PER_WINDOW);
  });
});

/**
 * Credential-surface guard (P1.5a).
 *
 * `SocialAccount` rows carry live publishing credentials
 * (`accessToken` / `refreshToken`). A route that loads the whole row is one
 * careless `NextResponse.json(row)` away from handing them to the browser, so
 * every route-handler query against that table must name its columns.
 *
 * This is a static check on purpose: a runtime test can only cover the paths
 * it happens to exercise, while the risk is a route nobody thought about.
 */
describe("security hardening: social tokens never leave via a wide select", () => {
  const ROUTE_DIR = new URL("../src/app/api/", import.meta.url);

  function routeFiles(dir: URL): URL[] {
    const out: URL[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        dir
      );
      if (entry.isDirectory()) out.push(...routeFiles(child));
      else if (entry.name.endsWith(".ts")) out.push(child);
    }
    return out;
  }

  /** Query call sites against socialAccount, with the args object that follows. */
  function socialAccountReads(source: string): string[] {
    const reads: string[] = [];
    const pattern = /socialAccount\s*\.\s*(findMany|findFirst|findUnique)\s*\(/g;
    for (const match of source.matchAll(pattern)) {
      // Walk from the opening paren to its match so nested braces are handled.
      let depth = 0;
      let i = match.index + match[0].length - 1;
      const start = i;
      for (; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      reads.push(source.slice(start, i + 1));
    }
    return reads;
  }

  test("every route-handler read of SocialAccount names its columns", () => {
    const offenders: string[] = [];
    for (const file of routeFiles(ROUTE_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const read of socialAccountReads(source)) {
        if (!/\bselect\s*:/.test(read)) {
          offenders.push(fileURLToPath(file));
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these route handlers load full SocialAccount rows (tokens included):\n` +
        offenders.join("\n")
    );
  });

  /**
   * Handlers that legitimately read a token column, with the reason. Reading
   * a credential is allowed — doing it WITHOUT having decided to is not, so
   * the allowlist forces the decision to be explicit and reviewable.
   */
  const TOKEN_READERS: Record<string, string> = {
    "api/social/tiktok/creator-info/route.ts":
      "refreshes the TikTok token before querying creator info",
    "api/settings/account/route.ts":
      "revokes each provider token before the account is wiped",
  };

  test("only documented handlers read a token column", () => {
    const found: string[] = [];
    for (const file of routeFiles(ROUTE_DIR)) {
      const source = readFileSync(file, "utf8");
      const reads = socialAccountReads(source);
      const touchesToken = reads.some((read) =>
        /\b(accessToken|refreshToken)\s*:\s*true/.test(read)
      );
      if (!touchesToken) continue;
      const rel = fileURLToPath(file)
        .replace(/\\/g, "/")
        .replace(/^.*?\/src\/app\//, "api/".replace("api/", ""))
        .replace(/^/, "");
      found.push(rel.slice(rel.indexOf("api/")));
    }
    for (const handler of found) {
      assert.ok(
        TOKEN_READERS[handler],
        `${handler} reads a social token but is not in TOKEN_READERS — ` +
          `add it with a reason, or narrow the select`
      );
    }
  });

  test("the guard actually detects a wide read", () => {
    // Proves the matcher is not vacuously passing.
    const bad = `const a = await prisma.socialAccount.findMany({ where: { userId } });`;
    const good = `const a = await prisma.socialAccount.findMany({ where: { userId }, select: { id: true } });`;
    assert.equal(socialAccountReads(bad).length, 1);
    assert.ok(!/\bselect\s*:/.test(socialAccountReads(bad)[0]));
    assert.ok(/\bselect\s*:/.test(socialAccountReads(good)[0]));
  });
});

/**
 * Write-side credential guard (audit H1).
 *
 * Reads are guarded above; this is the other direction. Every write that
 * carries a social token must route through the encryption boundary, or it
 * silently persists plaintext — the exact failure this work exists to remove.
 * Static for the same reason as the read guard: the risk is a write site
 * nobody remembered, which no runtime test would exercise.
 */
describe("security hardening: social token writes go through encryption", () => {
  const SRC = new URL("../src/", import.meta.url);

  function sourceFiles(dir: URL): URL[] {
    const out: URL[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        dir
      );
      if (entry.isDirectory()) out.push(...sourceFiles(child));
      else if (entry.name.endsWith(".ts")) out.push(child);
    }
    return out;
  }

  /** Write call sites against socialAccount, with their args object. */
  function socialAccountWrites(source: string): string[] {
    const writes: string[] = [];
    const pattern =
      /socialAccount\s*\.\s*(create|createMany|update|updateMany|upsert)\s*\(/g;
    for (const match of source.matchAll(pattern)) {
      let depth = 0;
      let i = match.index + match[0].length - 1;
      const start = i;
      for (; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      writes.push(source.slice(start, i + 1));
    }
    return writes;
  }

  /** A write that carries no token field needs no encryption. */
  function carriesToken(write: string): boolean {
    return /\b(accessToken|refreshToken)\b/.test(write);
  }

  function goesThroughBoundary(write: string): boolean {
    return (
      /encryptAccountTokens\s*\(/.test(write) ||
      // The rotation path builds its sealed object just above the call.
      /data:\s*persisted\b/.test(write)
    );
  }

  test("every SocialAccount write carrying a token is encrypted", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const write of socialAccountWrites(source)) {
        if (!carriesToken(write)) continue;
        if (goesThroughBoundary(write)) continue;
        offenders.push(fileURLToPath(file));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "these writes persist a social token without encrypting it:\n" +
        offenders.join("\n")
    );
  });

  test("a write with no token field is correctly ignored", () => {
    // e.g. the creator-info route updating only `username`.
    const usernameOnly = `prisma.socialAccount.updateMany({ where: { id }, data: { username: "x" } })`;
    const writes = socialAccountWrites(usernameOnly);
    assert.equal(writes.length, 1);
    assert.equal(carriesToken(writes[0]), false);
  });

  test("the guard actually detects an unencrypted token write", () => {
    // Proves the matcher is not vacuously passing.
    const bad = `prisma.socialAccount.update({ where: { id }, data: { accessToken: token } })`;
    const good = `prisma.socialAccount.update({ where: { id }, data: encryptAccountTokens({ accessToken: token }) })`;
    const badWrite = socialAccountWrites(bad)[0];
    const goodWrite = socialAccountWrites(good)[0];
    assert.ok(carriesToken(badWrite) && !goesThroughBoundary(badWrite));
    assert.ok(carriesToken(goodWrite) && goesThroughBoundary(goodWrite));
  });
});
