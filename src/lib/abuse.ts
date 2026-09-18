import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDiagnostic, reportError } from "@/lib/diagnostics";
import { Prisma, type AbuseRisk, type AbuseSignalKind } from "@prisma/client";

/**
 * Anti-abuse identity layer (server-only: hashes with a secret pepper).
 *
 * Core principle: Free value belongs to an AbuseIdentity, not to a single
 * User. New accounts, re-registrations and re-linked social accounts
 * resolve to the SAME identity, so no fresh Free allowance is minted.
 * Paid subscriptions are never pooled: each Stripe Subscription stays
 * bound to its own user with its own limits — abuse enforcement
 * short-circuits for active paid plans.
 *
 * Privacy: only salted hashes are stored (never raw emails, subs or
 * external ids). IPs are hashed with a daily salt for rate limiting only
 * and are never stored as identity signals. Logs carry ids and counts,
 * never PII, secrets or payment data.
 */

export const DEVICE_COOKIE_NAME = "pv_did";

/** Tombstone retention: how long a deleted binding blocks silent reuse. */
export const TOMBSTONE_SOCIAL_TTL_MS = 180 * 86_400_000;
export const TOMBSTONE_EMAIL_TTL_MS = 90 * 86_400_000;

/** Progressive friction: fresh re-links on a MEDIUM identity wait this long. */
export const MEDIUM_LINK_COOLDOWN_MS = 24 * 3_600_000;

/** Soft thresholds for automatic risk escalation (ABUSE is manual only). */
export const HIGH_USER_COUNT = 5;
export const MEDIUM_USER_COUNT = 2;

const DEV_PEPPER = "postvia-dev-pepper-do-not-use-in-production";

/** Curated disposable/temporary-mail domains blocked at registration. */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set(
  [
    "tempmail.com",
    "temp-mail.org",
    "temp-mail.io",
    "guerrillamail.com",
    "guerrillamail.org",
    "guerrillamail.net",
    "mailinator.com",
    "mailinator.net",
    "10minutemail.com",
    "10minutemail.net",
    "trashmail.com",
    "trashmail.net",
    "yopmail.com",
    "yopmail.net",
    "dispostable.com",
    "getnada.com",
    "mohmal.com",
    "sharklasers.com",
    "throwawaymail.com",
    "fakeinbox.com",
    "emailondeck.com",
    "tempmailo.com",
    "tempail.com",
    "maildrop.cc",
    "mailnesia.com",
    "mintemail.com",
    "mytemp.email",
    "tempmailaddress.com",
    "anonymbox.com",
    "binkmail.com",
    "bobmail.info",
    "chammy.info",
    "devnullmail.com",
    "dupaz.com",
    "eelmail.com",
    "etranquil.com",
  ].map((domain) => domain.trim().toLowerCase())
);

/**
 * Canonical email for identity matching. Lowercases everything; for Gmail
 * (and Googlemail) also strips dots and plus-tags; for Yahoo cuts -tags.
 * This collapses the cheapest alias tricks into one identity signal.
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const withoutDots = local.replace(/\./g, "");
    const withoutTag = withoutDots.split("+")[0] ?? withoutDots;
    return `${withoutTag}@gmail.com`;
  }
  if (
    domain === "yahoo.com" ||
    domain === "yahoo.co.uk" ||
    domain === "ymail.com"
  ) {
    const withoutTag = local.split("-")[0] ?? local;
    return `${withoutTag}@${domain}`;
  }
  return trimmed;
}

export function emailDomain(email: string): string {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  return at === -1 ? "" : email.trim().toLowerCase().slice(at + 1);
}

/** True when the domain (or any parent) is a known disposable provider. */
export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  const labels = domain.split(".");
  for (let index = 0; index < labels.length - 1; index += 1) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(index).join("."))) {
      return true;
    }
  }
  return false;
}

export function getAbusePepper(
  env: Record<string, string | undefined> = process.env
): string {
  const pepper = env.ABUSE_HASH_PEPPER?.trim();
  if (pepper) return pepper;
  const production =
    env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  if (production) {
    throw new Error("ABUSE_HASH_PEPPER is required in production");
  }
  return DEV_PEPPER;
}

/** True when the error is a missing-pepper misconfiguration (fail closed). */
export function isPepperMissingError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("ABUSE_HASH_PEPPER is required")
  );
}

/**
 * Fail-closed vs fail-open classification for abuse paths.
 *
 * FAIL CLOSED (loud, never silent allow):
 * - missing ABUSE_HASH_PEPPER in production (misconfiguration);
 * - missing abuse Prisma tables (P2021 — migration not applied).
 *
 * FAIL OPEN (log + safe fallback, never block legitimate users):
 * - transient connectivity/runtime errors: P1001/P1002/P1008/P1017/P2024/P2034,
 *   timeouts, connection resets, and any other unexpected store failure.
 */
export function isFailClosedAbuseError(error: unknown): boolean {
  return isMissingTableError(error) || isPepperMissingError(error);
}

/**
 * Transient connectivity errors eligible for fail-open fallback.
 * Conservative by design: only Prisma connection/pool/transaction-retry
 * codes plus explicit network failure messages qualify. Anything else
 * (validation, FK violations, business/insert failures) is NOT transient —
 * falling back on those would consume quota outside any transaction and
 * reintroduce the phantom-consumption the atomic kernel exists to prevent.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // cannot reach database server
  "P1002", // database server timed out
  "P1008", // operations timed out
  "P1017", // server closed the connection
  "P2024", // connection pool timeout
  "P2034", // transaction failed, please retry
]);

export function isTransientAbuseError(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_PRISMA_CODES.has(code)) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /connection (reset|refused|closed|timed out)|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|pool/i.test(
    message
  );
}

/**
 * Hard identity signals: stable account-bound identifiers that may own,
 * merge and re-resolve an AbuseIdentity. DEVICE_COOKIE is deliberately
 * excluded — it is a secondary/risk signal only (shared machines must
 * never merge strangers into one identity or pool their Free quota).
 */
export function isHardIdentitySignal(kind: AbuseSignalKind): boolean {
  return (
    kind === "EMAIL_HASH" || kind === "GOOGLE_SUB" || kind === "SOCIAL_LINK"
  );
}

/** Risk rank: higher number = more severe. Automatic paths only escalate. */
export const ABUSE_RISK_RANK: Record<AbuseRisk, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  ABUSE: 3,
};

/** Returns the more severe of two risk levels (ties keep `a`). */
export function maxRisk(a: AbuseRisk, b: AbuseRisk): AbuseRisk {
  return ABUSE_RISK_RANK[b] > ABUSE_RISK_RANK[a] ? b : a;
}

export function hashSignal(
  value: string,
  pepper: string,
  pepperVersion = 1
): { valueHash: string; pepperVersion: number } {
  const valueHash = createHash("sha256")
    .update(`${pepperVersion}:${pepper}:${value}`, "utf8")
    .digest("hex");
  return { valueHash, pepperVersion };
}

export type SignalInput = { kind: AbuseSignalKind; valueHash: string };

export function emailSignal(email: string, pepper: string): SignalInput {
  return {
    kind: "EMAIL_HASH",
    valueHash: hashSignal(`email:${canonicalizeEmail(email)}`, pepper).valueHash,
  };
}

export function googleSignal(sub: string, pepper: string): SignalInput {
  return {
    kind: "GOOGLE_SUB",
    valueHash: hashSignal(`google:${sub.trim()}`, pepper).valueHash,
  };
}

export function socialSignal(
  platform: string,
  externalId: string,
  pepper: string
): SignalInput {
  return {
    kind: "SOCIAL_LINK",
    valueHash: hashSignal(
      `social:${platform.trim().toUpperCase()}:${externalId.trim()}`,
      pepper
    ).valueHash,
  };
}

export function deviceSignal(deviceId: string, pepper: string): SignalInput {
  return {
    kind: "DEVICE_COOKIE",
    valueHash: hashSignal(`device:${deviceId.trim()}`, pepper).valueHash,
  };
}

/** Rollout flag: "enforce" blocks, anything else observes (log + allow). */
export function isAbuseEnforcementEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.ABUSE_ENFORCEMENT === "enforce";
}

/**
 * Full kill-switch: in "off" mode no identity, signal, tombstone, ledger
 * or bucket row is created or mutated — every gate reports allow.
 */
export function isAbuseDisabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.ABUSE_ENFORCEMENT === "off";
}

/**
 * Paid plans are never pooled and never throttled by Free anti-abuse
 * rules. Mirrors the billing UI's paid definition: any non-free plan that
 * has not terminally ended.
 */
export function isPaidActivePlan(
  plan: string,
  status: string
): boolean {
  return plan !== "free" && status !== "CANCELED" && status !== "EXPIRED";
}

export type RiskEvaluation = { level: AbuseRisk; reason: string };

/**
 * Pure risk evaluation. ABUSE is never assigned automatically — only by a
 * human reviewer. Escalation only; de-escalation is manual.
 */
export function evaluateRisk(input: {
  tombstoneHits: number;
  linkedUserCount: number;
  current: AbuseRisk;
}): RiskEvaluation {
  const rank: Record<AbuseRisk, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    ABUSE: 3,
  };
  let level: AbuseRisk = "LOW";
  let reason = "no abuse signals";
  if (input.linkedUserCount >= HIGH_USER_COUNT) {
    level = "HIGH";
    reason = `many linked users (${input.linkedUserCount})`;
  } else if (
    input.tombstoneHits > 0 ||
    input.linkedUserCount >= MEDIUM_USER_COUNT
  ) {
    level = "MEDIUM";
    reason =
      input.tombstoneHits > 0
        ? "re-registration after deletion"
        : `several linked users (${input.linkedUserCount})`;
  }
  if (rank[input.current] > rank[level]) {
    return { level: input.current, reason: "kept existing level" };
  }
  return { level, reason };
}

/** Tombstone is live while within its kind TTL; expired rows await sweep. */
export function isTombstoneLive(
  kind: AbuseSignalKind,
  deletedAt: Date,
  nowMs: number
): boolean {
  const ttl =
    kind === "SOCIAL_LINK" ? TOMBSTONE_SOCIAL_TTL_MS : TOMBSTONE_EMAIL_TTL_MS;
  return nowMs - deletedAt.getTime() < ttl;
}

export function isWithinCooldown(
  sinceMs: number | null,
  cooldownMs: number,
  nowMs: number
): boolean {
  if (sinceMs === null) return false;
  return nowMs - sinceMs < cooldownMs;
}

/**
 * First-party device id helpers. parseDeviceCookie accepts a raw Cookie
 * header, a bare pv_did value (as returned by cookie jars), or null.
 */
export function parseDeviceCookie(
  header: string | null | undefined
): string | null {
  if (!header) return null;
  const fromHeader = /(?:^|;\s*)pv_did=([^;]+)/.exec(header)?.[1]?.trim();
  const value = (fromHeader ?? header).trim();
  return /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

export function newDeviceId(): string {
  return randomUUID().replace(/-/g, "");
}

export function deviceSetCookieHeader(value: string, secure: boolean): string {
  const parts = [
    `${DEVICE_COOKIE_NAME}=${value}`,
    "Path=/",
    "Max-Age=31536000",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Client IP for rate limiting / risk scoring only — never for hard blocks
 * or identity. Trust assumption: the app runs behind the Vercel edge /
 * a trusted reverse proxy that sets x-forwarded-for with the real client
 * first. The header is validated (IPv4/IPv6 shape) and never trusted
 * blindly: malformed or empty values yield null (no bucket). A spoofed
 * XFF can at most shift the caller into a different bucket — it can never
 * mint quota or merge identities.
 */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && isPlausibleIp(first)) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && isPlausibleIp(real)) return real;
  return null;
}

function isPlausibleIp(value: string): boolean {
  if (value.length > 45) return false;
  // IPv4 (dotted quad) or IPv6 (hex + colons, optional zone).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  return /^[0-9a-fA-F:.%]+$/.test(value) && value.includes(":");
}

export function dayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Storage surface for identity resolution; faked in tests. */
export type AbuseStores = {
  /**
   * True when these stores join an ambient transaction (kernel tx-bound
   * stores). Best-effort swallows are forbidden there: any failed statement
   * aborts the whole Postgres transaction (25P02 on everything after), so
   * errors must propagate to the caller's retry/map logic instead.
   */
  isTransactional?: boolean;
  findSignalOwners: (
    signals: SignalInput[]
  ) => Promise<{ identityId: string; firstSeenAt: Date }[]>;
  createIdentity: () => Promise<{ id: string; firstSeenAt: Date }>;
  linkUser: (identityId: string, userId: string) => Promise<void>;
  findIdentityIdByUser: (userId: string) => Promise<string | null>;
  findUserIdsByIdentity: (identityId: string) => Promise<string[]>;
  attachSignals: (identityId: string, signals: SignalInput[]) => Promise<void>;
  removeSignals: (signals: SignalInput[]) => Promise<void>;
  mergeIdentities: (winnerId: string, loserIds: string[]) => Promise<void>;
  getIdentity: (identityId: string) => Promise<{
    id: string;
    riskLevel: AbuseRisk;
    riskReason: string | null;
    lastLinkedAt: Date | null;
    firstSeenAt: Date;
  } | null>;
  setRisk: (
    identityId: string,
    level: AbuseRisk,
    reason: string
  ) => Promise<void>;
  /**
   * Escalate-only risk write: raises to `level` when the stored level is
   * lower, never lowers. Single conditional statement (no read-modify-write),
   * so concurrent merges commute to max and the call can never downgrade a
   * manual ABUSE set between a read and a write.
   */
  escalateRisk: (
    identityId: string,
    level: AbuseRisk,
    reason: string
  ) => Promise<void>;
  touchLinked: (identityId: string, now: Date) => Promise<void>;
  /** Updates lastSeenAt only — steady-state reads must not extend cooldowns. */
  touchSeen: (identityId: string, now: Date) => Promise<void>;
  findTombstones: (
    signals: SignalInput[]
  ) => Promise<
    {
      kind: AbuseSignalKind;
      valueHash: string;
      identityId: string | null;
      deletedAt: Date;
    }[]
  >;
  writeTombstones: (
    rows: { kind: AbuseSignalKind; valueHash: string; identityId?: string | null }[]
  ) => Promise<void>;
  sweepTombstones: (olderThan: Date) => Promise<number>;
  getFreeUsage: (identityId: string, period: string) => Promise<number | null>;
  initFreeUsage: (
    identityId: string,
    period: string,
    count: number
  ) => Promise<number>;
  incrementFreeIfBelow: (
    identityId: string,
    period: string,
    limit: number
  ) => Promise<boolean>;
  raiseFreeFloor: (
    identityId: string,
    period: string,
    floor: number
  ) => Promise<void>;
  /** SUM of the PostUsage ledger counts (legacy lower-bounded by live posts). */
  sumPostUsage: (
    userIds: string[],
    period: string,
    monthStart: Date
  ) => Promise<number>;
  rateTake: (
    scope: string,
    keyHash: string,
    max: number,
    windowMs: number,
    nowMs: number
  ) => Promise<boolean>;
};

export type IdentityResolution = {
  identityId: string;
  created: boolean;
  merged: boolean;
  tombstoneHits: number;
  risk: AbuseRisk;
};

/**
 * Resolves (or creates/merges) the abuse identity for a user from its
 * signals. Race-safe: concurrent resolves with a shared HARD signal
 * collapse into one identity via the (kind, valueHash) unique key.
 * DEVICE_COOKIE signals are secondary: they are attached to the final
 * identity for risk/rate-limit evidence but never drive owner lookup,
 * winner choice or merging — two strangers sharing a machine must never
 * merge. Tombstoned identities (deleted users) are candidates too, so
 * re-registration inherits consumed Free value instead of minting fresh.
 */
export async function resolveAbuseIdentity(input: {
  userId: string;
  signals: SignalInput[];
  stores: AbuseStores;
  nowMs?: number;
  /** Off mode: no rows are created or mutated, identity is synthetic. */
  disabled?: boolean;
}): Promise<IdentityResolution> {
  if (input.disabled ?? isAbuseDisabled()) {
    return {
      identityId: `disabled:${input.userId}`,
      created: false,
      merged: false,
      tombstoneHits: 0,
      risk: "LOW",
    };
  }
  const now = new Date(input.nowMs ?? Date.now());
  // Only hard signals participate in owner discovery and merging.
  const hardSignals = input.signals.filter((s) => isHardIdentitySignal(s.kind));
  const softSignals = input.signals.filter(
    (s) => !isHardIdentitySignal(s.kind)
  );
  const owners = await input.stores.findSignalOwners(hardSignals);
  const rawTombs = await input.stores.findTombstones(hardSignals);
  // Expired tombstones are not hard evidence: they await the sweeper and
  // must not block or escalate forever.
  const tombs = rawTombs.filter((t) =>
    isTombstoneLive(t.kind, t.deletedAt, now.getTime())
  );
  const tombIds = [
    ...new Set(
      tombs
        .map((tomb) => tomb.identityId)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  const tombMetas = await Promise.all(
    tombIds.map((id) => input.stores.getIdentity(id))
  );
  const candidates = [
    ...owners,
    ...tombMetas
      .filter(
        (meta): meta is NonNullable<typeof meta> => meta !== null
      )
      .map((meta) => ({ identityId: meta.id, firstSeenAt: meta.firstSeenAt })),
  ];
  const distinct = [
    ...new Map(candidates.map((o) => [o.identityId, o])).values(),
  ];

  let identityId: string | undefined;
  let created = false;
  let merged = false;
  /**
   * Our own fresh identity, if we created one. When we end up adopting a
   * foreign winner, the fresh row would otherwise linger as an empty husk
   * (no signals — the unique race was lost; no links — we link after
   * adopting). It is folded into the winner before returning so
   * registration storms don't accumulate invisible rows.
   */
  let freshId: string | undefined;
  const preLink = await input.stores.findIdentityIdByUser(input.userId);

  const refreshDistinct = async (): Promise<boolean> => {
    const owners = await input.stores.findSignalOwners(hardSignals);
    distinct.length = 0;
    for (const owner of owners) distinct.push(owner);
    return distinct.length > 0;
  };

  /**
   * Up to four passes. Pass 1 handles the common case; extra passes
   * converge identities created concurrently with ours and recover when
   * our identity is merged away mid-flight (attaches/links then hit
   * P2003/P2002 against the deleted row). Every pass re-reads owners and
   * links, so racers fold into one identity instead of throwing.
   */
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const lastAttempt = attempt === MAX_ATTEMPTS - 1;
    if (distinct.length === 0) {
      if (attempt === 0) {
        const fresh = await input.stores.createIdentity();
        identityId = fresh.id;
        freshId = fresh.id;
        created = true;
      } else {
        await refreshDistinct();
        if (distinct.length === 0) {
          // Sole candidate vanished mid-flight: start over once.
          const fresh = await input.stores.createIdentity();
          identityId = fresh.id;
          freshId = fresh.id;
          created = true;
        }
      }
    }
    if (distinct.length > 0) {
      // Deterministic winner: lowest id is a total order every
      // concurrent resolver agrees on for the same set (timestamps tie
      // under load, insertion order differs per observer).
      distinct.sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
      const winner = distinct[0];
      if (!winner) throw new Error("Signal owners vanished");
      identityId = winner.identityId;
      if (distinct.length > 1) {
        try {
          await mergeIdentitiesPreservingRisk(
            input.stores,
            identityId,
            distinct.slice(1).map((o) => o.identityId)
          );
        } catch (error) {
          if (!isRaceConflictError(error) || lastAttempt) throw error;
          await refreshDistinct();
          continue;
        }
        merged = true;
      }
    }
    if (!identityId) throw new Error("Identity resolution produced no identity");
    try {
      await input.stores.attachSignals(identityId, hardSignals);
    } catch (error) {
      // Our identity was merged away between merge and attach (P2003):
      // refresh and converge onto the surviving winner.
      if (!isRaceConflictError(error) || lastAttempt) throw error;
      await refreshDistinct();
      continue;
    }

    // Converge: another resolver may own our signals now (their attach
    // won the unique key after our read). A foreign live owner always wins
    // over our fresh creation, so every concurrent resolver folds into the
    // same identity in one round; remaining multi-owner sets use lowest id.
    // Device signals are excluded: they never force convergence.
    const recheck = await input.stores.findSignalOwners(hardSignals);
    const foreign = recheck.filter((o) => o.identityId !== identityId);
    const recheckIds = [
      ...new Set(
        foreign.length > 0
          ? [identityId, ...foreign.map((o) => o.identityId)]
          : [identityId]
      ),
    ];
    if (recheckIds.length > 1) {
      const metas = await Promise.all(
        recheckIds.map((id) => input.stores.getIdentity(id))
      );
      const live = metas.filter(
        (meta): meta is NonNullable<typeof meta> => meta !== null
      );
      const foreignLive = live.filter((meta) => meta.id !== identityId);
      const pool =
        foreignLive.length > 0
          ? foreignLive
          : live.sort((a, b) => (a.id < b.id ? -1 : 1));
      // Fallback: every candidate vanished mid-read. identityId is always
      // set at this point (created fresh or selected above); the merge
      // below is then a no-op and the loop re-verifies.
      const finalWinner = pool[0] ?? { id: identityId as string };
      try {
        await mergeIdentitiesPreservingRisk(
          input.stores,
          finalWinner.id,
          pool
            .slice(1)
            .map((meta) => meta.id)
            .filter((id) => id !== finalWinner.id)
        );
      } catch (error) {
        if (!isRaceConflictError(error) || lastAttempt) throw error;
        await refreshDistinct();
        continue;
      }
      merged = true;
      identityId = finalWinner.id;
      continue;
    }

    try {
      const existingLink =
        await input.stores.findIdentityIdByUser(input.userId);
      if (existingLink && existingLink !== identityId) {
        const [first, second] =
          existingLink < identityId
            ? [existingLink, identityId]
            : [identityId, existingLink];
        await mergeIdentitiesPreservingRisk(input.stores, first, [second]);
        merged = true;
        identityId = first;
      } else if (!existingLink) {
        await input.stores.linkUser(identityId, input.userId);
      }
      break;
    } catch (error) {
      // Linked into an identity merged away mid-flight (or a lost link
      // race): adopt the surviving link when one exists, else refresh and
      // converge again. Only the final attempt gives up loudly.
      if (!isRaceConflictError(error)) throw error;
      const current = await tolerate(input.stores, () =>
        input.stores.findIdentityIdByUser(input.userId)
      , null);
      if (current) {
        identityId = current;
        break;
      }
      if (lastAttempt) {
        throw new Error("Identity link vanished after conflict");
      }
      await refreshDistinct();
    }
  }

  if (!identityId) throw new Error("Identity resolution produced no identity");
  // Adopt the surviving link: a concurrent merge may have moved our link
  // to the winner after our last read — the link row is authoritative.
  const settled = await tolerate(input.stores, () =>
    input.stores.findIdentityIdByUser(input.userId)
  , null);
  if (settled) identityId = settled;

  /**
   * Post-link convergence. The main loop can break out early with a
   * signal-less private identity: our attach raced a rival's attach for
   * the same value (unique key — exactly one wins) and our recheck ran
   * before the winner's attach committed. Without this pass, N concurrent
   * first-registrations fragment into N identities (proven by PG test: 30
   * concurrent same-email resolves left 18). Each round strictly reduces
   * fragments: a resolver that owns none of its signals folds itself into
   * the survivor; co-owners merge into the deterministic lowest id. Signal
   * values are globally unique, so merging co-owners is always correct.
   * Every round also re-validates liveness: our identity may itself have
   * been merged away after our last sighting, in which case we adopt the
   * surviving link/owner instead of returning a dead id.
   */
  if (hardSignals.length > 0) {
    for (let round = 0; round < 6; round += 1) {
      const [owners, link] = await Promise.all([
        input.stores.findSignalOwners(hardSignals),
        tolerate(input.stores, () => input.stores.findIdentityIdByUser(input.userId), null),
      ]);
      if (link && link !== identityId) identityId = link;
      const selfId = identityId;
      if (!selfId) continue;
      const alive = await tolerate(input.stores, () => input.stores.getIdentity(selfId), null);
      if (!alive) continue;
      const foreignIds = [
        ...new Set(owners.map((o) => o.identityId)),
      ].filter((id) => id !== identityId);
      if (foreignIds.length === 0) break;
      const own = owners.some((o) => o.identityId === identityId);
      try {
        if (!own) {
          const winner = [...foreignIds].sort()[0] as string;
          await mergeIdentitiesPreservingRisk(input.stores, winner, [identityId]);
          merged = true;
          identityId = winner;
        } else {
          const pool = [identityId, ...foreignIds];
          const winner = [...pool].sort()[0] as string;
          await mergeIdentitiesPreservingRisk(
            input.stores,
            winner,
            pool.filter((id) => id !== winner)
          );
          merged = true;
          identityId = winner;
        }
      } catch (error) {
        if (!isRaceConflictError(error)) throw error;
        // A rival merged mid-verify: next round re-reads (bounded).
      }
    }
    // Final liveness guard: never return a merged-away identity. A rival
    // merge between our last round and this read is handled by adopting
    // the surviving link (merge moves links atomically with the delete);
    // only a genuinely inconsistent state throws loudly (retryable).
    const aliveFinal = await tolerate(input.stores, () => {
      const selfId = identityId;
      if (!selfId) throw new Error("Identity resolution produced no identity");
      return input.stores.getIdentity(selfId);
    }, null);
    if (!aliveFinal) {
      const link = await tolerate(input.stores, () => input.stores.findIdentityIdByUser(input.userId), null);
      const owners = await input.stores.findSignalOwners(hardSignals);
      const target =
        link ?? [...new Set(owners.map((o) => o.identityId))].sort()[0];
      if (!target) throw new Error("Identity resolution converged on a deleted identity");
      identityId = target;
      try {
        await input.stores.linkUser(identityId, input.userId);
      } catch (error) {
        if (!isRaceConflictError(error)) throw error;
        const retryLink = await tolerate(input.stores, () => input.stores.findIdentityIdByUser(input.userId), null);
        if (retryLink) identityId = retryLink;
      }
    }
  }
  // Fold our abandoned fresh identity into the adopted winner. It owns no
  // discoverable state (the unique race for its signals was lost and we
  // link only after adopting), so this is a pure husk deletion — but even
  // a non-empty surprise is preserved by the merge, never dropped.
  if (freshId && freshId !== identityId && identityId) {
    const target: string = identityId;
    const husk: string = freshId;
    await tolerate(input.stores, () =>
      mergeIdentitiesPreservingRisk(input.stores, target, [husk])
    , undefined);
    freshId = undefined;
  }
  // Secondary signals ride along: attached for risk/rate-limit evidence,
  // never for ownership. A shared device joins the identity's evidence set
  // without merging strangers.
  if (softSignals.length > 0) {
    await tolerate(input.stores, () =>
      input.stores.attachSignals(identityId, softSignals)
    , undefined);
  }
  const meta = await input.stores.getIdentity(identityId);
  const linkedUsers = await input.stores.findUserIdsByIdentity(identityId);
  // A tombstone counts when it points elsewhere (another human's history)
  // or when this user is new to the final identity (true re-registration).
  // Steady-state calls for an already-linked user ignore own history.
  const wasAlreadyLinked = preLink === identityId;
  const countedTombs = tombs.filter(
    (tomb) => tomb.identityId !== identityId || !wasAlreadyLinked
  );
  const evaluation = evaluateRisk({
    tombstoneHits: countedTombs.length,
    linkedUserCount: linkedUsers.length,
    current: meta?.riskLevel ?? "LOW",
  });
  if (
    meta &&
    meta.riskLevel !== "ABUSE" &&
    evaluation.level !== meta.riskLevel &&
    evaluation.level !== "LOW"
  ) {
    await input.stores.setRisk(identityId, evaluation.level, evaluation.reason);
  }
  if (meta) {
    // Steady-state reads update lastSeenAt only — lastLinkedAt drives the
    // MEDIUM cooldown and must not be extended by ordinary activity.
    await tolerate(input.stores, () => input.stores.touchSeen(identityId, now), undefined);
  }
  const finalMeta = await input.stores.getIdentity(identityId);
  return {
    identityId,
    created,
    merged,
    tombstoneHits: countedTombs.length,
    risk: finalMeta?.riskLevel ?? "LOW",
  };
}

/**
 * Merge wrapper that preserves the maximum risk across winner + losers.
 * The store-level merge moves rows; this wrapper guarantees the surviving
 * identity keeps `max(all risks)` with the corresponding reason, so a LOW
 * winner can never swallow a HIGH/ABUSE loser. Manual ABUSE always survives
 * automatic flows (email change, re-registration, concurrent resolves).
 */
export async function mergeIdentitiesPreservingRisk(
  stores: AbuseStores,
  winnerId: string,
  loserIds: string[]
): Promise<void> {
  const pruned = loserIds.filter((id) => id !== winnerId);
  if (pruned.length === 0) return;
  const metas = await Promise.all(
    [winnerId, ...pruned].map((id) => tolerate(stores, () => stores.getIdentity(id), null))
  );
  let top: AbuseRisk = "LOW";
  let topReason: string | null = null;
  for (const meta of metas) {
    if (!meta) continue;
    if (ABUSE_RISK_RANK[meta.riskLevel] > ABUSE_RISK_RANK[top]) {
      top = meta.riskLevel;
      topReason = meta.riskReason;
    }
  }
  await stores.mergeIdentities(winnerId, pruned);
  if (ABUSE_RISK_RANK[top] > 0) {
    // Single conditional statement — no read-then-write window in which a
    // concurrent manual ABUSE escalation could be overwritten (TOCTOU).
    await tolerate(
      stores,
      () => stores.escalateRisk(winnerId, top, topReason ?? "preserved from merged identity"),
      undefined
    );
  }
  void recordAbuseEvent({ identityId: winnerId, kind: "MERGED" });
}

/**
 * Best-effort abuse audit trail. Never throws, never blocks the hot path:
 * a failed event write is logged and dropped. Stores no PII — identity id
 * and kind only. The authoritative security state never depends on events.
 */
export async function recordAbuseEvent(input: {
  identityId?: string | null;
  kind:
    | "CREATED"
    | "MERGED"
    | "SIGNAL"
    | "TOMBSTONE_HIT"
    | "RISK"
    | "LINK_DENY"
    | "POST_DENY";
}): Promise<void> {
  try {
    await prisma.abuseEvent.create({
      data: { identityId: input.identityId ?? null, kind: input.kind },
    });
  } catch (error) {
    // Telemetry only: event loss must never break enforcement.
    // P2021 (table missing pre-migration) is silent here by design —
    // the enforcing gates themselves fail closed on P2021.
    if (!isMissingTableError(error)) {
      reportError("abuse", "abuse event write failed", error, {
        kind: input.kind,
      });
    }
  }
}

/**
 * Raises the identity ledger floor to the SUM of the linked users'
 * PostUsage. SUM (never MAX): users that consumed before linking would
 * otherwise be undercounted (3 + 12 posts must floor at 15, not 12).
 * Monotonic: concurrent raises cannot lower. Used by the backfill script;
 * the live claim path recomputes the floor on every claim.
 */
export async function syncIdentityFloor(input: {
  identityId: string;
  userIds: string[];
  period: string;
  monthStart: Date;
  stores: AbuseStores;
}): Promise<void> {
  const floor = await input.stores.sumPostUsage(
    input.userIds,
    input.period,
    input.monthStart
  );
  if (floor <= 0) return;
  const current = await input.stores.getFreeUsage(
    input.identityId,
    input.period
  );
  if (current === null) {
    await input.stores.initFreeUsage(input.identityId, input.period, floor);
    return;
  }
  if (current < floor) {
    await input.stores.raiseFreeFloor(input.identityId, input.period, floor);
  }
}

/**
 * Read-only identity-level Free usage for display purposes (progress bars,
 * remaining counts). Strictly no writes: unlike `resolveAbuseIdentity` it
 * never creates an identity, links a user, attaches signals, merges or
 * touches risk — and unlike `syncIdentityFloor` it never initializes or
 * raises the ledger. Missing link or missing row reads as 0 usage.
 *
 * Mirrors the enforcement floor math (`max(stored, SUM(PostUsage))`) so the
 * displayed number can never understate what `claimIdentityFree` would
 * observe for the same identity and period.
 */
export async function getIdentityFreeUsage(input: {
  userId: string;
  period: string;
  monthStart: Date;
  stores?: AbuseStores;
}): Promise<{ identityId: string | null; used: number }> {
  const stores = input.stores ?? liveAbuseStores;
  const identityId = await stores.findIdentityIdByUser(input.userId);
  if (!identityId) return { identityId: null, used: 0 };
  const [linked, stored] = await Promise.all([
    stores.findUserIdsByIdentity(identityId),
    stores.getFreeUsage(identityId, input.period),
  ]);
  const floor = await stores.sumPostUsage(
    linked,
    input.period,
    input.monthStart
  );
  return { identityId, used: Math.max(stored ?? 0, floor) };
}

export type FreeClaim = { ok: true } | { ok: false; observed: number };

/**
 * Claims one Free unit on the identity ledger (limit 15/month shared by
 * every linked user). The floor is recomputed as the SUM of the linked
 * users' PostUsage on every claim, so users linked after consuming cannot
 * undercount (3 + 12 floors at 15). Paid plans never call this. Denial
 * carries the observed count for a consistent 403 message.
 */
export async function claimIdentityFree(input: {
  identityId: string;
  userIds: string[];
  period: string;
  monthStart: Date;
  limit: number;
  stores: AbuseStores;
  /** Off mode: no ledger writes, always granted. */
  disabled?: boolean;
}): Promise<FreeClaim> {
  if (input.disabled ?? isAbuseDisabled()) {
    return { ok: true };
  }
  const floor = await input.stores.sumPostUsage(
    input.userIds,
    input.period,
    input.monthStart
  );
  const current = await input.stores.getFreeUsage(
    input.identityId,
    input.period
  );
  if (current === null) {
    await input.stores.initFreeUsage(input.identityId, input.period, floor);
  } else if (current < floor) {
    await input.stores.raiseFreeFloor(input.identityId, input.period, floor);
  }
  const granted = await input.stores.incrementFreeIfBelow(
    input.identityId,
    input.period,
    input.limit
  );
  if (!granted) {
    const after =
      (await input.stores.getFreeUsage(input.identityId, input.period)) ??
      input.limit;
    return { ok: false, observed: after };
  }
  return { ok: true };
}

export type LinkDecision =
  | { ok: true; identityId: string }
  | { ok: false; code: "ACCOUNT_IN_USE" | "RESTRICTED" | "UNDER_REVIEW" | "COOLDOWN"; reason: string };

/**
 * Gate for linking a NEW social account (reconnects of the caller's own
 * account never reach here). Enforces: single live owner per external id,
 * tombstone-aware inheritance, progressive friction by risk level.
 * In observe mode every denial becomes allow + a would-deny log line.
 */
export async function checkSocialLink(input: {
  userId: string;
  userEmail: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
  platform: string;
  externalId: string;
  isPaid: boolean;
  enforce: boolean;
  pepper: string;
  stores: AbuseStores;
  nowMs?: number;
  /** Off mode: no rows are created or mutated, always allowed. */
  disabled?: boolean;
}): Promise<LinkDecision> {
  if (input.disabled ?? isAbuseDisabled()) {
    return { ok: true, identityId: `disabled:${input.userId}` };
  }
  const nowMs = input.nowMs ?? Date.now();
  const pepper = input.pepper;
  const selfSignals: SignalInput[] = [];
  if (input.userEmail) selfSignals.push(emailSignal(input.userEmail, pepper));
  if (input.googleSub) selfSignals.push(googleSignal(input.googleSub, pepper));
  if (input.deviceId) selfSignals.push(deviceSignal(input.deviceId, pepper));
  const social = socialSignal(input.platform, input.externalId, pepper);

  const resolution = await resolveAbuseIdentity({
    userId: input.userId,
    signals: selfSignals,
    stores: input.stores,
    nowMs,
  });
  let identityId = resolution.identityId;

  const owner = await input.stores.findSignalOwners([social]);
  const foreignOwner = owner.find((o) => o.identityId !== identityId);
  let ownTomb = false;
  if (foreignOwner) {
    const linked = await input.stores.findUserIdsByIdentity(
      foreignOwner.identityId
    );
    const liveOther = linked.filter((id) => id !== input.userId);
    if (liveOther.length > 0) {
      // Same external id is actively linked to another human's account.
      return {
        ok: false,
        code: "ACCOUNT_IN_USE",
        reason: "This social account is already connected to another Postvia user.",
      };
    }
    // Orphaned signal (previous owner deleted): merge its identity in so
    // already-consumed Free value is inherited, not re-granted.
    // Risk is preserved at max: an ABUSE/HIGH orphan never dilutes.
    const [first, second] =
      identityId < foreignOwner.identityId
        ? [identityId, foreignOwner.identityId]
        : [foreignOwner.identityId, identityId];
    await mergeIdentitiesPreservingRisk(input.stores, first, [second]);
    identityId = first;
  } else {
    // No live owner: the pair may still carry consumed value on a
    // tombstoned identity (disconnect removes the signal row, the ledger
    // stays). That identity is absorbed so the value is inherited: the
    // pair links only through OAuth on the same external social account,
    // so a re-link from any user or device continues the same consumed
    // quota instead of minting a fresh allowance. Expired tombstones are
    // ignored (they await the sweeper, never block forever).
  // Tombstones for this pair, including our own history (re-linking a
  // pair this identity owned before is exempt from the MEDIUM cooldown —
  // linking consumes no value by itself, posting does). Expired tombstones
  // are ignored (they await the sweeper, never block forever).
  const rawTombs = await input.stores.findTombstones([social]);
  const tombs = rawTombs.filter((t) =>
    isTombstoneLive(t.kind, t.deletedAt, nowMs)
  );
  ownTomb = tombs.some((tomb) => tomb.identityId === identityId);
  const tombIds = [
    ...new Set(
      tombs
        .map((tomb) => tomb.identityId)
        .filter(
          (id): id is string => typeof id === "string" && id !== identityId
        )
    ),
  ];
  const orphans: string[] = [];
  // Supporting device evidence is logged but never gates inheritance: the
  // device cookie must not merge strangers by itself, and its absence must
  // not re-grant consumed value either (a new browser/incognito would
  // otherwise reset the Free allowance for the same social identity).
  let deviceOwnerIds: Set<string> | null = null;
  for (const tombId of tombIds) {
    const users = await input.stores.findUserIdsByIdentity(tombId);
    if (users.length === 0) {
      orphans.push(tombId);
      continue;
    }
    let sameHuman = false;
    if (input.deviceId) {
      if (!deviceOwnerIds) {
        const owners = await input.stores
          .findSignalOwners([deviceSignal(input.deviceId, pepper)])
          .catch(() => []);
        deviceOwnerIds = new Set(owners.map((o) => o.identityId));
      }
      sameHuman = deviceOwnerIds.has(tombId);
    }
    // Tombstone with live users: absorb the surviving identity so
    // already-consumed Free value is inherited, not re-granted. Risk is
    // preserved at max by the merge below.
    orphans.push(tombId);
    if (sameHuman) {
      logDiagnostic("abuse", "same-device re-link inherits usage", {
        userId: input.userId,
        identityId,
      });
    } else {
      logDiagnostic("abuse", "tombstoned re-link inherits usage", {
        userId: input.userId,
        identityId,
      });
    }
  }
  if (orphans.length > 0) {
    // Deterministic winner (lowest id) so concurrent inheritors converge.
    const sorted = [identityId, ...orphans].sort();
    const winner = sorted[0] as string;
    await mergeIdentitiesPreservingRisk(input.stores, winner, sorted.slice(1));
    identityId = winner;
    logDiagnostic("abuse", "inherited tombstoned usage", {
      userId: input.userId,
      identityId,
    });
  }
  }

  if (input.isPaid) {
    await tolerate(input.stores, () => input.stores.attachSignals(identityId, [social]), undefined);
    return { ok: true, identityId };
  }

  const meta = await input.stores.getIdentity(identityId);
  const risk = meta?.riskLevel ?? "LOW";
  const deny = (
    code: "RESTRICTED" | "UNDER_REVIEW" | "COOLDOWN",
    reason: string
  ): LinkDecision => {
    if (!input.enforce) {
      logDiagnostic("abuse", "would-deny social link", {
        userId: input.userId,
        identityId,
        code,
      });
      return { ok: true, identityId };
    }
    void recordAbuseEvent({ identityId, kind: "LINK_DENY" });
    return { ok: false, code, reason };
  };
  if (risk === "ABUSE") {
    return deny("RESTRICTED", "This account is restricted. Contact support.");
  }
  if (risk === "HIGH") {
    return deny("UNDER_REVIEW", "New connections are under review. Contact support.");
  }
  if (
    risk === "MEDIUM" &&
    !ownTomb &&
    isWithinCooldown(
      meta?.lastLinkedAt ? meta.lastLinkedAt.getTime() : null,
      MEDIUM_LINK_COOLDOWN_MS,
      nowMs
    )
  ) {
    return deny(
      "COOLDOWN",
      "Too many recent connections. Please try again tomorrow."
    );
  }

  try {
    await input.stores.attachSignals(identityId, [social]);
  } catch (error) {
    // P2002: a rival linked the pair first — ownership decides below.
    // P2003: OUR identity was merged away mid-flight — the merge moved our
    // link row to the winner, so re-resolve and attach there instead of
    // silently dropping the signal (dropped signals weaken inheritance).
    if (isRaceConflictError(error)) {
      const fresh = await tolerate(input.stores, () =>
        input.stores.findIdentityIdByUser(input.userId)
      , null);
      if (fresh && fresh !== identityId) {
        identityId = fresh;
        await input.stores.attachSignals(identityId, [social]);
      }
    } else {
      throw error;
    }
    const recheck = await input.stores.findSignalOwners([social]);
    if (recheck.some((o) => o.identityId !== identityId)) {
      return {
        ok: false,
        code: "ACCOUNT_IN_USE",
        reason: "This social account is already connected to another Postvia user.",
      };
    }
  }
  await tolerate(input.stores, () => input.stores.touchLinked(identityId, new Date(nowMs)), undefined);
  return { ok: true, identityId };
}

export type SocialLinkGate =
  | { ok: true }
  | { ok: false; errorParam: "account_in_use" | "connection_restricted" | "connection_cooldown" };

/**
 * Thin composition for OAuth callbacks: resolves the caller's paid status,
 * runs checkSocialLink, and maps decisions onto whitelisted redirect codes.
 *
 * Failure policy (explicit split, never catch-all allow):
 * - fail-closed (loud deny): missing pepper / missing abuse tables (P2021).
 *   The callback is denied with connection_restricted so misconfiguration
 *   can never silently disable protection.
 * - fail-open (log + allow): transient store failures. A broken abuse store
 *   must never strand a legitimate OAuth flow — post creation stays the
 *   authoritative enforcement point.
 * Google-sub signals arrive via auth account hooks and the backfill, not
 * here, so this helper needs no extra database access beyond the stores.
 */
export async function gateNewSocialLink(input: {
  userId: string;
  userEmail: string | null;
  platform: string;
  externalId: string;
  deviceCookieHeader: string | null;
  isPaid: boolean;
  stores?: AbuseStores;
  pepper?: string;
  enforce?: boolean;
  nowMs?: number;
  disabled?: boolean;
}): Promise<SocialLinkGate> {
  try {
    const stores = input.stores ?? liveAbuseStores;
    const pepper = input.pepper ?? getAbusePepper();
    const enforce = input.enforce ?? isAbuseEnforcementEnabled();
    const decision = await checkSocialLink({
      userId: input.userId,
      userEmail: input.userEmail,
      deviceId: parseDeviceCookie(input.deviceCookieHeader),
      platform: input.platform,
      externalId: input.externalId,
      isPaid: input.isPaid,
      enforce,
      pepper,
      stores,
      nowMs: input.nowMs,
      disabled: input.disabled,
    });
    if (decision.ok) return { ok: true };
    return {
      ok: false,
      errorParam:
        decision.code === "ACCOUNT_IN_USE"
          ? "account_in_use"
          : decision.code === "COOLDOWN"
            ? "connection_cooldown"
            : "connection_restricted",
    };
  } catch (error) {
    if (isFailClosedAbuseError(error)) {
      reportError("abuse", "social link gate misconfigured, denying", error, {
        userId: input.userId,
      });
      return { ok: false, errorParam: "connection_restricted" };
    }
    reportError("abuse", "social link gate failed", error, {
      userId: input.userId,
    });
    return { ok: true };
  }
}

/** Persistent multi-instance rate limit. Key material is hashed by callers. */
export async function checkAbuseRate(input: {
  scope: string;
  keyHash: string;
  max: number;
  windowMs: number;
  stores: AbuseStores;
  nowMs?: number;
  /** Off mode: no bucket rows are created or mutated, always allowed. */
  disabled?: boolean;
}): Promise<boolean> {
  if (input.disabled ?? isAbuseDisabled()) {
    return true;
  }
  return input.stores.rateTake(
    input.scope,
    input.keyHash,
    input.max,
    input.windowMs,
    input.nowMs ?? Date.now()
  );
}

/**
 * Pure remaining-seconds computation from a bucket reset timestamp.
 * Never negative; callers clamp to >= 1 when reporting a denial.
 * No PII involved — inputs are epoch millis only.
 */
export function retryAfterSecondsUntil(
  resetAtMs: number,
  nowMs: number = Date.now()
): number {
  if (!Number.isFinite(resetAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((resetAtMs - nowMs) / 1000));
}

/**
 * Read-only view of a persistent rate bucket's reset time.
 * Uses the live Prisma client directly (no consumption, no mutation).
 * Fail-open: any failure returns null so callers fall back to a safe
 * static cooldown. Never logs scope/key material (hashed PII).
 */
export async function getRateBucketResetAt(input: {
  scope: string;
  keyHash: string;
}): Promise<Date | null> {
  try {
    const row = await prisma.abuseRateBucket.findUnique({
      where: { scope_keyHash: { scope: input.scope, keyHash: input.keyHash } },
      select: { resetAt: true },
    });
    return row?.resetAt ?? null;
  } catch {
    return null;
  }
}

/**
 * Detailed rate check: same consumption semantics as checkAbuseRate,
 * plus the real remaining wait when denied.
 *
 * Existing boolean callers are untouched — this is additive. When
 * `allowed` is true, `retryAfterSeconds` is 0. When false, it is the
 * ceiling of (resetAt - now) clamped to >= 1, falling back to the
 * full window when the row cannot be read.
 */
export async function checkAbuseRateDetailed(input: {
  scope: string;
  keyHash: string;
  max: number;
  windowMs: number;
  stores: AbuseStores;
  nowMs?: number;
  disabled?: boolean;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const nowMs = input.nowMs ?? Date.now();
  const allowed = await checkAbuseRate({ ...input, nowMs });
  if (allowed) return { allowed: true, retryAfterSeconds: 0 };
  const resetAt = await getRateBucketResetAt({
    scope: input.scope,
    keyHash: input.keyHash,
  });
  if (!resetAt) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(input.windowMs / 1000)),
    };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, retryAfterSecondsUntil(resetAt.getTime(), nowMs)),
  };
}

export function hashRateKey(parts: string[], pepper: string): string {
  return createHash("sha256")
    .update(`1:${pepper}:rate:${parts.join("|")}`, "utf8")
    .digest("hex");
}

type AbuseDbClient = Pick<
  typeof prisma,
  "abuseIdentity" | "abuseIdentityLink" | "abuseSignal" | "abuseFreeUsage"
>;

function prismaCode(error: unknown): string | null {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/**
 * Unique/FK/not-found conflicts are the fingerprints of a concurrent
 * merge or link race (our identity was merged away mid-flight, a rival
 * attached first, a row vanished). They trigger refresh-and-retry, never
 * silent allow. Anything else propagates.
 */
const RACE_PRISMA_CODES = new Set(["P2002", "P2003", "P2025"]);

export function isRaceConflictError(error: unknown): boolean {
  return prismaCode(error) !== null && RACE_PRISMA_CODES.has(prismaCode(error) as string);
}

/**
 * Postgres serialization/deadlock conflicts: the transaction aborted
 * server-side (40001 serialization_failure, 40P01 deadlock_detected;
 * Prisma P2034 "transaction failed, please retry"). A transaction that
 * dies this way committed NOTHING, so re-running an idempotent body in a
 * fresh transaction cannot double-grant — the conditional claims and the
 * unique guards re-evaluate from the committed state.
 *
 * Detection is strict: Prisma code P2034, or the raw PG sqlstate/message
 * fingerprints. Anything else (validation, FK, business denials) is NOT a
 * serialization conflict and must never take the retry path.
 */
const SERIALIZATION_FINGERPRINTS = [
  /40001/,
  /40P01/,
  /could not serialize/i,
  /deadlock detected/i,
];

export function isSerializationConflictError(error: unknown): boolean {
  if (prismaCode(error) === "P2034") return true;
  const message = error instanceof Error ? error.message : String(error);
  return SERIALIZATION_FINGERPRINTS.some((re) => re.test(message));
}

/**
 * Best-effort wrapper for cosmetic writes/reads (touch timestamps, soft
 * signals, husk cleanup, telemetry-adjacent lookups). Outside a transaction
 * failures are ignored; INSIDE a transaction (kernel tx-bound stores) the
 * error propagates — swallowing it would poison the Postgres transaction
 * (every later statement fails 25P02) and misclassify the failure.
 */
async function tolerate<T>(
  stores: AbuseStores,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (stores.isTransactional) return fn();
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Poison-free link (Postgres rule: ANY failed statement aborts the whole
 * transaction, so `create` + `catch P2002 and continue` corrupts every
 * later statement with 25P02). `createMany + skipDuplicates` maps to
 * ON CONFLICT DO NOTHING — unique races never throw, FK violations still
 * do (the caller retries/aborts, which is correct).
 */
export async function linkUserWithClient(
  db: Pick<AbuseDbClient, "abuseIdentityLink">,
  identityId: string,
  userId: string
): Promise<void> {
  await db.abuseIdentityLink.createMany({
    data: [{ identityId, userId }],
    skipDuplicates: true,
  });
}

/**
 * Poison-free usage init: insert-if-absent then read. Never
 * catch-continues inside a transaction (see above).
 */
export async function initFreeUsageWithClient(
  db: Pick<AbuseDbClient, "abuseFreeUsage">,
  identityId: string,
  period: string,
  count: number
): Promise<number> {
  await db.abuseFreeUsage.createMany({
    data: [{ identityId, period, count }],
    skipDuplicates: true,
  });
  const row = await db.abuseFreeUsage.findUnique({
    where: { identityId_period: { identityId, period } },
    select: { count: true },
  });
  if (!row) throw new Error("FreeUsage row vanished after conflict");
  return row.count;
}

/**
 * Poison-free persistent rate take, safe inside and outside transactions.
 * Protocol: fast conditional bump first; otherwise insert-if-absent with a
 * count=0 sentinel (an unconsumed reservation — concurrent inserters agree
 * via skipDuplicates), then exactly one claimant flips 0→1 while the rest
 * fall through to the normal conditional increment. Every request consumes
 * at most one unit; exactly `max` requests win per window.
 */
export async function rateTakeWithClient(
  db: Pick<typeof prisma, "abuseRateBucket">,
  scope: string,
  keyHash: string,
  max: number,
  windowMs: number,
  nowMs: number
): Promise<boolean> {
  if (max <= 0) return false;
  const bumped = await db.abuseRateBucket.updateMany({
    where: {
      scope,
      keyHash,
      resetAt: { gt: new Date(nowMs) },
      count: { lt: max },
    },
    data: { count: { increment: 1 } },
  });
  if (bumped.count > 0) return true;
  await db.abuseRateBucket.createMany({
    data: [{ scope, keyHash, count: 0, resetAt: new Date(nowMs + windowMs) }],
    skipDuplicates: true,
  });
  const bucket = await db.abuseRateBucket.findUnique({
    where: { scope_keyHash: { scope, keyHash } },
    select: { id: true, count: true, resetAt: true },
  });
  if (!bucket) return true;
  if (bucket.resetAt.getTime() <= nowMs) {
    // Conditional reset: exactly one concurrent resetter wins the new
    // window; losers fall through below and consume via the normal bump.
    const reset = await db.abuseRateBucket.updateMany({
      where: { id: bucket.id, resetAt: { lte: new Date(nowMs) } },
      data: { count: 1, resetAt: new Date(nowMs + windowMs) },
    });
    if (reset.count > 0) return true;
  }
  if (bucket.count === 0) {
    const claimed = await db.abuseRateBucket.updateMany({
      where: { id: bucket.id, count: 0 },
      data: { count: 1 },
    });
    if (claimed.count > 0) return true;
  }
  // Lost a race (or the row pre-existed): decide from a FRESH read so a
  // window that expired mid-flight resets instead of wrongly denying.
  const fresh = await db.abuseRateBucket.findUnique({
    where: { scope_keyHash: { scope, keyHash } },
    select: { id: true, count: true, resetAt: true },
  });
  if (!fresh) return true;
  if (fresh.resetAt.getTime() <= nowMs) {
    // Exactly one concurrent resetter wins the new window (conditional on
    // the window still being expired); losers fall through to the bump
    // below and consume normally instead of all returning true.
    const reset = await db.abuseRateBucket.updateMany({
      where: { id: fresh.id, resetAt: { lte: new Date(nowMs) } },
      data: { count: 1, resetAt: new Date(nowMs + windowMs) },
    });
    if (reset.count > 0) return true;
    const afterReset = await db.abuseRateBucket.findUnique({
      where: { scope_keyHash: { scope, keyHash } },
      select: { id: true, count: true, resetAt: true },
    });
    if (!afterReset) return true;
    if (afterReset.resetAt.getTime() > nowMs && afterReset.count < max) {
      const top = await db.abuseRateBucket.updateMany({
        where: { id: afterReset.id, resetAt: { gt: new Date(nowMs) }, count: { lt: max } },
        data: { count: { increment: 1 } },
      });
      return top.count > 0;
    }
    return false;
  }
  const top = await db.abuseRateBucket.updateMany({
    where: { id: fresh.id, resetAt: { gt: new Date(nowMs) }, count: { lt: max } },
    data: { count: { increment: 1 } },
  });
  return top.count > 0;
}

/**
 * Merge body shared by the live store (wrapped in $transaction) and the
 * atomic post kernel (already inside the caller's transaction — never
 * nests). Idempotent: repeat merges find no loser rows and no-op. Usage
 * carry is a conditional raise so racers cannot double it; risk settles at
 * max via a conditional escalate-only update.
 *
 * Postgres rule: NO statement inside this body may fail-and-continue (any
 * failed statement aborts the whole transaction with 25P02). All moves use
 * violation-free primitives (updateMany re-pointing, insert-if-absent +
 * conditional raise); residual microsecond races abort and are retried once
 * by the live wrapper — the body is idempotent so retry is safe.
 */
export async function mergeIdentitiesWithClient(
  db: Prisma.TransactionClient,
  winnerId: string,
  loserIds: string[]
): Promise<void> {
  const pruned = loserIds.filter((id) => id !== winnerId);
  if (pruned.length === 0) return;
  const risks = await db.abuseIdentity.findMany({
    where: { id: { in: [winnerId, ...pruned] } },
    select: { id: true, riskLevel: true, riskReason: true },
  });
  const winnerSignals = await db.abuseSignal.findMany({
    where: { identityId: winnerId },
    select: { kind: true, valueHash: true },
  });
  // Move links by re-pointing: a user owns at most one link row, so this
  // can never violate uniqueness (already-moved rows match zero rows).
  await db.abuseIdentityLink.updateMany({
    where: { identityId: { in: pruned } },
    data: { identityId: winnerId },
  });
  // Move signals by re-pointing: first drop loser rows whose value the
  // winner already owns (global uniqueness), then re-point the rest.
  if (winnerSignals.length > 0) {
    await db.abuseSignal.deleteMany({
      where: {
        identityId: { in: pruned },
        OR: winnerSignals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
      },
    });
  }
  await db.abuseSignal.updateMany({
    where: { identityId: { in: pruned } },
    data: { identityId: winnerId },
  });
  await db.abuseIdentityLink.deleteMany({
    where: { identityId: { in: pruned } },
  });
  // Atomic carry of consumed Free value: exclusively consume the losers'
  // ledger rows (DELETE..RETURNING — exactly one concurrent merge can
  // observe each row) and credit the winner with one atomic add
  // (INSERT..ON CONFLICT-add commutes with concurrent quota claims).
  // App-level read-modify-write here double-carries under concurrency
  // (proven by PG test: 3+5+7 became 27). SUM semantics preserved: winner
  // and losers counted disjoint user sets (3 + 12 carries 15, not 12).
  const consumed = await db.$queryRaw<Array<{ period: string; count: number }>>(
    Prisma.sql`DELETE FROM "AbuseFreeUsage" WHERE "identityId" IN (${Prisma.join(pruned)}) RETURNING period, count`
  );
  if (consumed.length > 0) {
    const byPeriod = new Map<string, number>();
    for (const row of consumed) {
      byPeriod.set(row.period, (byPeriod.get(row.period) ?? 0) + row.count);
    }
    await db.$executeRaw(
      Prisma.sql`INSERT INTO "AbuseFreeUsage" (id, "identityId", period, count, "createdAt", "updatedAt") VALUES ${Prisma.join(
        [...byPeriod.entries()].map(
          ([period, count]) =>
            Prisma.sql`(${randomUUID()}, ${winnerId}, ${period}, ${count}, NOW(), NOW())`
        )
      )} ON CONFLICT ("identityId", period) DO UPDATE SET count = "AbuseFreeUsage".count + EXCLUDED.count, "updatedAt" = NOW()`
    );
  }
  let top: AbuseRisk = "LOW";
  let topReason: string | null = null;
  for (const row of risks) {
    if (ABUSE_RISK_RANK[row.riskLevel] > ABUSE_RISK_RANK[top]) {
      top = row.riskLevel;
      topReason = row.riskReason;
    }
  }
  await db.abuseIdentity.deleteMany({
    where: { id: { in: pruned } },
  });
  if (ABUSE_RISK_RANK[top] > 0) {
    await db.abuseIdentity.updateMany({
      where: {
        id: winnerId,
        ...(top === "ABUSE"
          ? { riskLevel: { not: "ABUSE" } }
          : top === "HIGH"
            ? { riskLevel: { in: ["LOW", "MEDIUM"] } }
            : { riskLevel: "LOW" }),
      },
      data: {
        riskLevel: top,
        riskReason: topReason ?? "preserved from merged identity",
      },
    });
  }
}

/**
 * Ledger-based identity floor shared by live stores and the atomic kernel:
 * SUM(PostUsage.count) with the live post count as a legacy lower bound.
 */
export async function sumPostUsageWithClient(
  db: Pick<typeof prisma, "post" | "postUsage">,
  userIds: string[],
  period: string,
  monthStart: Date
): Promise<number> {
  if (userIds.length === 0) return 0;
  const [ledgerRows, liveCount] = await Promise.all([
    db.postUsage.findMany({
      where: { userId: { in: userIds }, period },
      select: { count: true },
    }),
    db.post.count({
      where: { userId: { in: userIds }, createdAt: { gte: monthStart } },
    }),
  ]);
  const ledgerSum = ledgerRows.reduce((sum, row) => sum + row.count, 0);
  return Math.max(ledgerSum, liveCount);
}

/** Prisma-backed stores. All conflict paths are P2002-tolerant. */
export const liveAbuseStores: AbuseStores = {  findSignalOwners: async (signals) => {
    if (signals.length === 0) return [];
    const rows = await prisma.abuseSignal.findMany({
      where: {
        OR: signals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
      },
      select: { identityId: true, identity: { select: { firstSeenAt: true } } },
    });
    return rows.map((row) => ({
      identityId: row.identityId,
      firstSeenAt: row.identity.firstSeenAt,
    }));
  },
  createIdentity: async () => {
    const row = await prisma.abuseIdentity.create({
      data: {},
      select: { id: true, firstSeenAt: true },
    });
    return row;
  },
  linkUser: async (identityId, userId) =>
    linkUserWithClient(prisma, identityId, userId),
  findIdentityIdByUser: async (userId) => {
    const row = await prisma.abuseIdentityLink.findUnique({
      where: { userId },
      select: { identityId: true },
    });
    return row?.identityId ?? null;
  },
  findUserIdsByIdentity: async (identityId) => {
    const rows = await prisma.abuseIdentityLink.findMany({
      where: { identityId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  },
  attachSignals: async (identityId, signals) => {
    if (signals.length === 0) return;
    try {
      await prisma.abuseSignal.createMany({
        data: signals.map((s) => ({
          identityId,
          kind: s.kind,
          valueHash: s.valueHash,
          pepperVersion: 1,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      // P2003 (identity merged away mid-flight) is an expected race the
      // caller recovers from by re-resolving — don't log it as an error.
      if (prismaCode(error) !== "P2003") {
        reportError("abuse", "signal attach failed", error, { identityId });
      }
      throw error;
    }
  },
  removeSignals: async (signals) => {
    if (signals.length === 0) return;
    await prisma.abuseSignal.deleteMany({
      where: {
        OR: signals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
      },
    });
  },
  mergeIdentities: async (winnerId, loserIds) => {
    const pruned = loserIds.filter((id) => id !== winnerId);
    if (pruned.length === 0) return;
    // Single transaction per attempt; exactly one retry for residual
    // microsecond races (e.g. a concurrent attach landing the same signal
    // on the winner between our read and re-point aborts the tx). The body
    // is idempotent, so retry is safe and never doubles usage.
    const run = () =>
      prisma.$transaction((tx) =>
        mergeIdentitiesWithClient(tx, winnerId, pruned)
      );
    try {
      await run();
    } catch {
      await run();
    }
  },
  getIdentity: async (identityId) => {
    const row = await prisma.abuseIdentity.findUnique({
      where: { id: identityId },
      select: {
        id: true,
        riskLevel: true,
        riskReason: true,
        lastLinkedAt: true,
        firstSeenAt: true,
      },
    });
    return row;
  },
  setRisk: async (identityId, level, reason) => {
    await prisma.abuseIdentity.update({
      where: { id: identityId },
      data: { riskLevel: level, riskReason: reason },
    });
  },
  escalateRisk: async (identityId, level, reason) => {
    // updateMany (not update): missing rows are a no-op, never P2025 —
    // safe to call on identities racing deletion, in or out of tx.
    // Predicates are escalate-only, so concurrent writers commute to max.
    await prisma.abuseIdentity.updateMany({
      where: {
        id: identityId,
        ...(level === "ABUSE"
          ? { riskLevel: { not: "ABUSE" } }
          : level === "HIGH"
            ? { riskLevel: { in: ["LOW", "MEDIUM"] } }
            : { riskLevel: "LOW" }),
      },
      data: { riskLevel: level, riskReason: reason },
    });
  },
  touchLinked: async (identityId, now) => {
    await prisma.abuseIdentity.updateMany({
      where: { id: identityId },
      data: { lastSeenAt: now, lastLinkedAt: now },
    });
  },
  touchSeen: async (identityId, now) => {
    await prisma.abuseIdentity.updateMany({
      where: { id: identityId },
      data: { lastSeenAt: now },
    });
  },
  findTombstones: async (signals) => {
    if (signals.length === 0) return [];
    const rows = await prisma.abuseTombstone.findMany({
      where: {
        OR: signals.map((s) => ({ kind: s.kind, valueHash: s.valueHash })),
      },
      select: { kind: true, valueHash: true, identityId: true, deletedAt: true },
    });
    return rows;
  },
  writeTombstones: async (rows) => {
    if (rows.length === 0) return;
    await prisma.abuseTombstone.createMany({
      data: rows.map((row) => ({
        kind: row.kind,
        valueHash: row.valueHash,
        identityId: row.identityId ?? null,
      })),
      skipDuplicates: true,
    });
  },
  sweepTombstones: async (olderThan) => {
    const deleted = await prisma.abuseTombstone.deleteMany({
      where: { deletedAt: { lt: olderThan } },
    });
    return deleted.count;
  },
  getFreeUsage: async (identityId, period) => {
    const row = await prisma.abuseFreeUsage.findUnique({
      where: { identityId_period: { identityId, period } },
      select: { count: true },
    });
    return row?.count ?? null;
  },
  initFreeUsage: async (identityId, period, count) =>
    initFreeUsageWithClient(prisma, identityId, period, count),
  incrementFreeIfBelow: async (identityId, period, limit) => {
    const updated = await prisma.abuseFreeUsage.updateMany({
      where: { identityId, period, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    return updated.count > 0;
  },
  raiseFreeFloor: async (identityId, period, floor) => {
    await prisma.abuseFreeUsage.updateMany({
      where: { identityId, period, count: { lt: floor } },
      data: { count: floor },
    });
  },
  sumPostUsage: async (userIds, period, monthStart) => {
    return sumPostUsageWithClient(prisma, userIds, period, monthStart);
  },
  rateTake: async (scope, keyHash, max, windowMs, nowMs) =>
    rateTakeWithClient(prisma, scope, keyHash, max, windowMs, nowMs),
};

/**
 * Best-effort gate for OAuth connect initiation: per-IP persistent bucket.
 * Failure policy matches gateNewSocialLink: misconfiguration fails closed
 * (deny), transient failures fail open (log + allow) so abuse bookkeeping
 * can never break login. Post creation stays authoritative.
 */
export async function gateOAuthInit(
  request: Request,
  scope = "oauth-init",
  max = 30,
  windowMs = 10 * 60_000,
  disabled?: boolean
): Promise<boolean> {
  try {
    if (disabled ?? isAbuseDisabled()) {
      return true;
    }
    const ip = getClientIp(request);
    if (!ip) return true;
    const pepper = getAbusePepper();
    return await checkAbuseRate({
      scope,
      keyHash: hashRateKey([scope, ip, dayKey()], pepper),
      max,
      windowMs,
      stores: liveAbuseStores,
    });
  } catch (error) {
    if (isFailClosedAbuseError(error)) {
      reportError("abuse", "oauth init gate misconfigured, denying", error);
      return false;
    }
    reportError("abuse", "oauth rate gate failed", error);
    return true;
  }
}

/**
 * OAuth callback flood protection: dual buckets — per-IP (pre-auth
 * attackers rotating accounts) and per-user (authenticated flood after
 * initiation). Callbacks exchange codes server-side and create account
 * rows, so initiation-only protection leaves a bypass. Limits are sized
 * for the real flow (a handful of redirects per connect, retries on
 * provider errors): 60/10m per IP, 30/10m per user. Fail-open on transient
 * errors (the social-link gate + unique constraint still enforce
 * ownership); fail-closed on misconfiguration.
 */
export const OAUTH_CALLBACK_IP_MAX = 60;
export const OAUTH_CALLBACK_USER_MAX = 30;
export const OAUTH_CALLBACK_WINDOW_MS = 10 * 60_000;

export async function gateOAuthCallback(input: {
  request: Request;
  userId: string;
  scopePrefix?: string;
  stores?: AbuseStores;
  pepper?: string;
  nowMs?: number;
  disabled?: boolean;
}): Promise<boolean> {
  try {
    if (input.disabled ?? isAbuseDisabled()) return true;
    const stores = input.stores ?? liveAbuseStores;
    const pepper = input.pepper ?? getAbusePepper();
    const nowMs = input.nowMs ?? Date.now();
    const prefix = input.scopePrefix ?? "oauth-callback";
    const ip = getClientIp(input.request);
    if (ip) {
      const ipAllowed = await checkAbuseRate({
        scope: `${prefix}-ip`,
        keyHash: hashRateKey([`${prefix}-ip`, ip, dayKey(nowMs)], pepper),
        max: OAUTH_CALLBACK_IP_MAX,
        windowMs: OAUTH_CALLBACK_WINDOW_MS,
        stores,
        nowMs,
      });
      if (!ipAllowed) return false;
    }
    return await checkAbuseRate({
      scope: `${prefix}-user`,
      keyHash: hashRateKey([`${prefix}-user`, input.userId], pepper),
      max: OAUTH_CALLBACK_USER_MAX,
      windowMs: OAUTH_CALLBACK_WINDOW_MS,
      stores,
      nowMs,
    });
  } catch (error) {
    if (isFailClosedAbuseError(error)) {
      reportError("abuse", "oauth callback gate misconfigured, denying", error, {
        userId: input.userId,
      });
      return false;
    }
    reportError("abuse", "oauth callback gate failed", error, {
      userId: input.userId,
    });
    return true;
  }
}

/**
 * Conservative per-user flood buckets for authenticated write paths.
 * Monthly quotas already bound total volume; these buckets bound *rate*
 * (compute/DB/provider burn from scripting). Limits sit far above any
 * legitimate flow (bulk = 10 items/batch, humans click slowly) and only
 * trigger on floods. Same failure policy as the OAuth gates: disabled
 * mode allows, misconfiguration denies, transient errors allow with a
 * log line. Quota/entitlement semantics are untouched.
 */
export const WRITE_PATH_WINDOW_MS = 60 * 60_000;
export const WRITE_LIMIT_POSTS_CREATE = 100;
export const WRITE_LIMIT_MEDIA_PREPARE = 200;
export const WRITE_LIMIT_CHECKOUT = 10;
export const WRITE_LIMIT_PORTAL = 10;
export const WRITE_LIMIT_ONBOARDING = 20;
export const WRITE_LIMIT_SETTINGS = 30;
export const WRITE_LIMIT_PUBLISH = 60;
export const WRITE_LIMIT_RETRY = 60;
/** PATCH/DELETE post edits (authenticated writes without a gate). */
export const WRITE_LIMIT_POSTS_WRITE = 100;
/** Blob signed-token mint (per-user; upstream of the 5-min TTL). */
export const WRITE_LIMIT_MEDIA_UPLOAD = 200;
/** Media status poll (composer polls ~500ms x 20s per upload). */
export const WRITE_LIMIT_MEDIA_STATUS = 600;
/** Destructive account wipe (session + confirmation already required). */
export const WRITE_LIMIT_ACCOUNT_DELETE = 10;
/** Per-account provider fan-out (TikTok creator-info per request). */
export const WRITE_LIMIT_CREATOR_INFO = 120;
/** Shared IP bucket is an order of magnitude roomier (NAT safety). */
export const WRITE_PATH_IP_MULTIPLIER = 10;

/**
 * Authenticated write-path flood gate: dual persistent buckets (per-IP
 * then per-user, same shape as gateOAuthCallback). Returns true when the
 * request may proceed.
 */
export async function gateWriteRequest(input: {
  request: Request;
  userId: string;
  scope: string;
  userMax: number;
  windowMs?: number;
  stores?: AbuseStores;
  pepper?: string;
  nowMs?: number;
  disabled?: boolean;
}): Promise<boolean> {
  try {
    if (input.disabled ?? isAbuseDisabled()) return true;
    const stores = input.stores ?? liveAbuseStores;
    const pepper = input.pepper ?? getAbusePepper();
    const nowMs = input.nowMs ?? Date.now();
    const windowMs = input.windowMs ?? WRITE_PATH_WINDOW_MS;
    const ip = getClientIp(input.request);
    if (ip) {
      const ipAllowed = await checkAbuseRate({
        scope: `${input.scope}-ip`,
        keyHash: hashRateKey([`${input.scope}-ip`, ip, dayKey(nowMs)], pepper),
        max: input.userMax * WRITE_PATH_IP_MULTIPLIER,
        windowMs,
        stores,
        nowMs,
      });
      if (!ipAllowed) return false;
    }
    return await checkAbuseRate({
      scope: `${input.scope}-user`,
      keyHash: hashRateKey([`${input.scope}-user`, input.userId], pepper),
      max: input.userMax,
      windowMs,
      stores,
      nowMs,
    });
  } catch (error) {
    if (isFailClosedAbuseError(error)) {
      reportError("abuse", "write gate misconfigured, denying", error, {
        userId: input.userId,
      });
      return false;
    }
    reportError("abuse", "write rate gate failed", error, {
      userId: input.userId,
    });
    return true;
  }
}

/**
 * Sets the first-party device cookie when absent. Supplementary signal
 * only: it strengthens matching but never decides alone.
 */
export function applyDeviceCookie(  response: NextResponse,
  request: Request,
  existing: string | null
): NextResponse {
  if (parseDeviceCookie(existing)) return response;
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set(DEVICE_COOKIE_NAME, newDeviceId(), {
    path: "/",
    maxAge: 31_536_000,
    httpOnly: true,
    sameSite: "lax",
    ...(secure ? { secure: true } : {}),
  });
  return response;
}

/**
 * True for "table does not exist" (Prisma P2021): the anti-abuse migration
 * has not been applied. Callers fail closed on this (loud 500) so a
 * missing migration can never silently disable enforcement, while
 * transient database errors fall back to the PostUsage-only path.
 */
export function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2021"
  );
}

export type FreeGateResult =
  | { ok: true; identityId: string | null; fallback?: false }
  | { ok: true; identityId: null; fallback: true }
  | { ok: false; code: "RESTRICTED" | "LIMIT"; observed?: number };

/**
 * Identity-level Free gate for post creation. Resolves the caller's
 * identity and claims one shared unit. Denials map onto the standard
 * 403 denial contract by the caller.
 *
 * Failure policy (explicit split):
 * - fail closed (throw loud): missing pepper / missing abuse tables
 *   (P2021) — misconfiguration must never silently disable enforcement.
 * - fail open (PostUsage-only fallback): transient store failures. The
 *   per-user PostUsage ledger still gates, so legitimate users are not
 *   blocked by an abuse-store blip.
 *
 * NOTE: the atomic post kernel (src/lib/free-post-kernel.ts) is the
 * preferred Free path — it claims identity + per-user quota + insert in
 * one transaction with no phantom consumption. This gate remains for
 * pre-checks and non-transactional callers.
 */
export async function enforceFreeIdentityGate(input: {
  userId: string;
  email: string | null;
  limit: number;
  enforce: boolean;
  pepper: string;
  period: string;
  monthStart: Date;
  stores: AbuseStores;
  nowMs?: number;
  disabled?: boolean;
}): Promise<FreeGateResult> {
  if (input.disabled ?? isAbuseDisabled()) {
    return { ok: true, identityId: null };
  }
  // Misconfigured pepper must fail closed before any store access: an
  // empty pepper would otherwise hash every signal identically.
  if (!input.pepper || !input.pepper.trim()) {
    const error = new Error("ABUSE_HASH_PEPPER is required in production");
    reportError("abuse", "identity gate misconfigured", error, {
      userId: input.userId,
    });
    throw error;
  }
  try {
    const resolution = await resolveAbuseIdentity({
      userId: input.userId,
      signals:
        input.email != null ? [emailSignal(input.email, input.pepper)] : [],
      stores: input.stores,
      nowMs: input.nowMs,
    });
    if (input.enforce && resolution.risk === "ABUSE") {
      void recordAbuseEvent({
        identityId: resolution.identityId,
        kind: "POST_DENY",
      });
      return { ok: false, code: "RESTRICTED" };
    }
    const linked = await input.stores.findUserIdsByIdentity(
      resolution.identityId
    );
    const claim = await claimIdentityFree({
      identityId: resolution.identityId,
      userIds: linked,
      period: input.period,
      monthStart: input.monthStart,
      limit: input.limit,
      stores: input.stores,
    });
    if (!claim.ok) {
      if (!input.enforce) {
        logDiagnostic("abuse", "would-deny post create", {
          userId: input.userId,
          identityId: resolution.identityId,
        });
        return { ok: true, identityId: resolution.identityId };
      }
      void recordAbuseEvent({
        identityId: resolution.identityId,
        kind: "POST_DENY",
      });
      return { ok: false, code: "LIMIT", observed: claim.observed };
    }
    return { ok: true, identityId: resolution.identityId };
  } catch (error) {
    if (isFailClosedAbuseError(error)) throw error;
    reportError(
      "abuse",
      "identity gate failed, PostUsage-only fallback",
      error,
      { userId: input.userId }
    );
    return { ok: true, identityId: null, fallback: true };
  }
}

/**
 * Records a social disconnect: writes a tombstone (with the identity, so a
 * later re-link inherits consumed value) and frees the live signal row so
 * the pair can be linked again. Best-effort: failures are logged and the
 * disconnect itself always proceeds.
 */
export async function recordDisconnect(input: {
  userId: string;
  platform: string;
  externalId: string;
  stores?: AbuseStores;
  pepper?: string;
}): Promise<void> {
  try {
    const stores = input.stores ?? liveAbuseStores;
    const pepper = input.pepper ?? getAbusePepper();
    const signal = socialSignal(input.platform, input.externalId, pepper);
    const identityId = await stores
      .findIdentityIdByUser(input.userId)
      .catch(() => null);
    await stores.writeTombstones([{ ...signal, identityId }]);
    await stores.removeSignals([signal]);
  } catch (error) {
    reportError("abuse", "disconnect tombstone failed", error, {
      userId: input.userId,
    });
  }
}

/**
 * Records an email change: the OLD address keeps its anti-abuse history
 * explicitly. The old live signal is released (removed) so a future,
 * unrelated owner of the recycled address does not silently merge into
 * this live identity; a tombstone with the identity id remains as risk
 * evidence, so re-registration with the old address still inherits
 * consumed Free value (flagged MEDIUM) instead of minting fresh quota.
 * Only hashes are stored — never the raw address. Best-effort.
 */
export async function recordEmailChange(input: {
  userId: string;
  oldEmail: string;
  newEmail: string;
  stores?: AbuseStores;
  pepper?: string;
}): Promise<void> {
  try {
    const stores = input.stores ?? liveAbuseStores;
    const pepper = input.pepper ?? getAbusePepper();
    if (
      canonicalizeEmail(input.oldEmail) === canonicalizeEmail(input.newEmail)
    ) {
      return;
    }
    const oldSignal = emailSignal(input.oldEmail, pepper);
    const identityId = await stores
      .findIdentityIdByUser(input.userId)
      .catch(() => null);
    await stores.writeTombstones([{ ...oldSignal, identityId }]);
    await stores.removeSignals([oldSignal]);
    await resolveAbuseIdentity({
      userId: input.userId,
      signals: [emailSignal(input.newEmail, pepper)],
      stores,
    }).catch(() => null);
  } catch (error) {
    reportError("abuse", "email change tombstone failed", error, {
      userId: input.userId,
    });
  }
}
