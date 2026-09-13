import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDiagnostic, reportError } from "@/lib/diagnostics";
import type { AbuseRisk, AbuseSignalKind } from "@prisma/client";

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
 * or identity. Trusts Vercel's forwarded headers (known proxy boundary).
 */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

export function dayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Storage surface for identity resolution; faked in tests. */
export type AbuseStores = {
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
  /** Sum of per-user creation counts — the only safe floor (never MAX). */
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
 * signals. Race-safe: concurrent resolves with a shared signal collapse
 * into one identity via the (kind, valueHash) unique key. Tombstoned
 * identities (deleted users) are candidates too, so re-registration
 * inherits consumed Free value instead of minting a fresh allowance.
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
  const owners = await input.stores.findSignalOwners(input.signals);
  const tombs = await input.stores.findTombstones(input.signals);
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
  const preLink = await input.stores.findIdentityIdByUser(input.userId);

  /**
   * Up to two passes: the second converges identities created concurrently
   * with ours (their signal attach wins the unique key after our read) and
   * recovers from linking into an identity merged away mid-flight.
   */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (distinct.length === 0 && attempt === 0) {
      const fresh = await input.stores.createIdentity();
      identityId = fresh.id;
      created = true;
      await input.stores.attachSignals(identityId, input.signals);
    } else {
      if (distinct.length === 0) {
        const owners = await input.stores.findSignalOwners(input.signals);
        for (const owner of owners) {
          if (!distinct.some((o) => o.identityId === owner.identityId)) {
            distinct.push(owner);
          }
        }
      }
      // Deterministic winner: lowest id is a total order every
      // concurrent resolver agrees on for the same set (timestamps tie
      // under load, insertion order differs per observer).
      distinct.sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
      const winner = distinct[0];
      if (!winner) throw new Error("Signal owners vanished");
      identityId = winner.identityId;
      if (distinct.length > 1) {
        await input.stores.mergeIdentities(
          identityId,
          distinct.slice(1).map((o) => o.identityId)
        );
        merged = true;
      }
      await input.stores.attachSignals(identityId, input.signals);
    }

    // Converge: another resolver may own our signals now (their attach
    // won the unique key after our read). A foreign live owner always wins
    // over our fresh creation, so every concurrent resolver folds into the
    // same identity in one round; remaining multi-owner sets use lowest id.
    const recheck = await input.stores.findSignalOwners(input.signals);
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
      const finalWinner = pool[0] ?? { id: identityId };
      await input.stores.mergeIdentities(
        finalWinner.id,
        pool
          .slice(1)
          .map((meta) => meta.id)
          .filter((id) => id !== finalWinner.id)
      );
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
        await input.stores.mergeIdentities(first, [second]);
        merged = true;
        identityId = first;
      } else if (!existingLink) {
        await input.stores.linkUser(identityId, input.userId);
      }
      break;
    } catch {
      // Linked into an identity merged away mid-flight (or a lost link
      // race): refresh the owner set and converge once more.
      const retryOwners = await input.stores.findSignalOwners(input.signals);
      distinct.length = 0;
      for (const owner of retryOwners) distinct.push(owner);
      if (attempt === 1) {
        const current = await input.stores.findIdentityIdByUser(input.userId);
        if (!current) throw new Error("Identity link vanished after conflict");
        identityId = current;
      }
    }
  }

  if (!identityId) throw new Error("Identity resolution produced no identity");
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
    await input.stores.touchSeen(identityId, now).catch(() => null);
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
    const [first, second] =
      identityId < foreignOwner.identityId
        ? [identityId, foreignOwner.identityId]
        : [foreignOwner.identityId, identityId];
    await input.stores.mergeIdentities(first, [second]);
    identityId = first;
  } else {
    // No live owner: the pair may still carry consumed value on a
    // tombstoned identity (disconnect removes the signal row, the ledger
    // stays). Absorb identities with no live users so the value is
    // inherited; a tombstone whose users are alive is a handoff — the new
    // link starts fresh and the fact is logged.
  // Tombstones for this pair, including our own history (re-linking a
  // pair this identity owned before is exempt from the MEDIUM cooldown —
  // linking consumes no value by itself, posting does).
  const tombs = await input.stores.findTombstones([social]);
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
  for (const tombId of tombIds) {
    const users = await input.stores.findUserIdsByIdentity(tombId);
    if (users.length === 0) {
      orphans.push(tombId);
    } else {
      logDiagnostic("abuse", "social handoff without inheritance", {
        userId: input.userId,
        identityId,
      });
    }
  }
  if (orphans.length > 0) {
    await input.stores.mergeIdentities(identityId, orphans);
    logDiagnostic("abuse", "inherited tombstoned usage", {
      userId: input.userId,
      identityId,
    });
  }
  }

  if (input.isPaid) {
    await input.stores.attachSignals(identityId, [social]).catch(() => null);
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
  } catch {
    const recheck = await input.stores.findSignalOwners([social]);
    if (recheck.some((o) => o.identityId !== identityId)) {
      return {
        ok: false,
        code: "ACCOUNT_IN_USE",
        reason: "This social account is already connected to another Postvia user.",
      };
    }
  }
  await input.stores.touchLinked(identityId, new Date(nowMs)).catch(() => null);
  return { ok: true, identityId };
}

export type SocialLinkGate =
  | { ok: true }
  | { ok: false; errorParam: "account_in_use" | "connection_restricted" | "connection_cooldown" };

/**
 * Thin composition for OAuth callbacks: resolves the caller's paid status,
 * runs checkSocialLink, and maps decisions onto whitelisted redirect codes.
 * Fail-open by design (logs and allows): a broken abuse store must never
 * strand a legitimate OAuth flow — post creation stays authoritative.
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

export function hashRateKey(parts: string[], pepper: string): string {
  return createHash("sha256")
    .update(`1:${pepper}:rate:${parts.join("|")}`, "utf8")
    .digest("hex");
}

/** Prisma-backed stores. All conflict paths are P2002-tolerant. */
export const liveAbuseStores: AbuseStores = {
  findSignalOwners: async (signals) => {
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
  linkUser: async (identityId, userId) => {
    try {
      await prisma.abuseIdentityLink.create({
        data: { identityId, userId },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return;
      }
      throw error;
    }
  },
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
      reportError("abuse", "signal attach failed", error, { identityId });
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
    if (loserIds.length === 0) return;
    const [links, signals, loserUsage] = await Promise.all([
      prisma.abuseIdentityLink.findMany({
        where: { identityId: { in: loserIds } },
        select: { userId: true },
      }),
      prisma.abuseSignal.findMany({
        where: { identityId: { in: loserIds } },
        select: { kind: true, valueHash: true },
      }),
      prisma.abuseFreeUsage.findMany({
        where: { identityId: { in: loserIds } },
        select: { period: true, count: true },
      }),
    ]);
    for (const link of links) {
      try {
        await prisma.abuseIdentityLink.create({
          data: { identityId: winnerId, userId: link.userId },
        });
      } catch {
        // Already linked to the winner (or elsewhere): keep going.
      }
    }
    if (signals.length > 0) {
      await prisma.abuseSignal.createMany({
        data: signals.map((s) => ({
          identityId: winnerId,
          kind: s.kind,
          valueHash: s.valueHash,
          pepperVersion: 1,
        })),
        skipDuplicates: true,
      });
    }
    await prisma.abuseSignal.deleteMany({
      where: { identityId: { in: loserIds } },
    });
    await prisma.abuseIdentityLink.deleteMany({
      where: { identityId: { in: loserIds } },
    });
    // Carry consumed Free value over as a SUM: winner and losers counted
    // disjoint user sets, so adding preserves the true total while MAX
    // would undercount (3 + 12 must carry 15, not 12).
    for (const usage of loserUsage) {
      const current = await prisma.abuseFreeUsage.findUnique({
        where: {
          identityId_period: { identityId: winnerId, period: usage.period },
        },
        select: { count: true },
      });
      const carried = (current?.count ?? 0) + usage.count;
      if (current === null) {
        await prisma.abuseFreeUsage.create({
          data: {
            identityId: winnerId,
            period: usage.period,
            count: carried,
          },
        });
      } else if (current.count < carried) {
        await prisma.abuseFreeUsage.updateMany({
          where: {
            identityId: winnerId,
            period: usage.period,
            count: { lt: carried },
          },
          data: { count: carried },
        });
      }
    }
    await prisma.abuseFreeUsage.deleteMany({
      where: { identityId: { in: loserIds } },
    });
    await prisma.abuseIdentity.deleteMany({
      where: { id: { in: loserIds } },
    });
    // Risk is re-evaluated by the caller from the merged user count —
    // merges of one human's own signals (email + google + device) stay LOW.
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
  touchLinked: async (identityId, now) => {
    await prisma.abuseIdentity.update({
      where: { id: identityId },
      data: { lastSeenAt: now, lastLinkedAt: now },
    });
  },
  touchSeen: async (identityId, now) => {
    await prisma.abuseIdentity.update({
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
  initFreeUsage: async (identityId, period, count) => {
    try {
      const row = await prisma.abuseFreeUsage.create({
        data: { identityId, period, count },
        select: { count: true },
      });
      return row.count;
    } catch {
      const row = await prisma.abuseFreeUsage.findUnique({
        where: { identityId_period: { identityId, period } },
        select: { count: true },
      });
      if (!row) throw new Error("FreeUsage row vanished after conflict");
      return row.count;
    }
  },
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
  sumPostUsage: async (userIds, _period, monthStart) => {
    if (userIds.length === 0) return 0;
    const groups = await prisma.post.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        createdAt: { gte: monthStart },
      },
      _count: { _all: true },
    });
    return groups.reduce(
      (sum, group) => sum + group._count._all,
      0
    );
  },
  rateTake: async (scope, keyHash, max, windowMs, nowMs) => {
    try {
      await prisma.abuseRateBucket.create({
        data: { scope, keyHash, count: 1, resetAt: new Date(nowMs + windowMs) },
      });
      return true;
    } catch {
      const bucket = await prisma.abuseRateBucket.findUnique({
        where: { scope_keyHash: { scope, keyHash } },
        select: { id: true, count: true, resetAt: true },
      });
      if (!bucket) return true;
      if (bucket.resetAt.getTime() <= nowMs) {
        await prisma.abuseRateBucket.update({
          where: { id: bucket.id },
          data: { count: 1, resetAt: new Date(nowMs + windowMs) },
        });
        return true;
      }
      const updated = await prisma.abuseRateBucket.updateMany({
        where: { id: bucket.id, count: { lt: max } },
        data: { count: { increment: 1 } },
      });
      return updated.count > 0;
    }
  },
};

/**
 * Best-effort gate for OAuth connect initiation: per-IP persistent bucket.
 * Fail-open (logs and allows) so abuse bookkeeping can never break login.
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
    reportError("abuse", "oauth rate gate failed", error);
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
 * 403 denial contract by the caller. Transient store failures degrade to
 * the PostUsage-only path (which still gates per user) — only a missing
 * migration or misconfiguration fails closed and loud.
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
  try {
    const resolution = await resolveAbuseIdentity({
      userId: input.userId,
      signals:
        input.email != null ? [emailSignal(input.email, input.pepper)] : [],
      stores: input.stores,
      nowMs: input.nowMs,
    });
    if (input.enforce && resolution.risk === "ABUSE") {
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
      return { ok: false, code: "LIMIT", observed: claim.observed };
    }
    return { ok: true, identityId: resolution.identityId };
  } catch (error) {
    if (isMissingTableError(error)) throw error;
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
