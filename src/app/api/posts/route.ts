import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { validateScheduledAt } from "@/lib/schedule";
import {
  canCreatePost,
  checkBulkBatch,
  createWithMonthlyQuota,
  getEffectivePlan,
  getMonthStart,
  getPeriodKey,
  getUpgradeTarget,
  getUsage,
  liveQuotaStore,
} from "@/lib/entitlements";
import {
  getAbusePepper,
  isAbuseEnforcementEnabled,
} from "@/lib/abuse";
import { createFreePostAtomic } from "@/lib/free-post-kernel";
import {
  validateCreatePostContent,
  validateTargetAccountSelection,
  validateTargetOverrides,
} from "@/lib/platforms/overrides";
import {
  IDEMPOTENCY_KEY_HEADER,
  isIdempotencyConflict,
  isValidBulkOperationId,
  normalizeOperationId,
} from "@/lib/idempotency";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const status = request.nextUrl.searchParams.get("status");

    const VALID_STATUSES = [
      "DRAFT",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "PARTIALLY_PUBLISHED",
      "FAILED",
    ];
    if (status !== null && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const posts = await prisma.post.findMany({
      where: {
        userId: user.id,
        ...(status ? { status: status as "DRAFT" } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { targets: true },
    });
    return NextResponse.json(posts);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Plan gate: monthly post quota is enforced server-side, per created
    // post — bulk included, since every bulk item comes through here.
    const effective = await getEffectivePlan({ userId: user.id, userEmail: user.email });
    const usage = await getUsage(user.id);
    const allowed = canCreatePost(effective, usage);
    if (!allowed.ok) {
      return NextResponse.json(
        { code: allowed.code, reason: allowed.reason, upgradeTo: allowed.upgradeTo },
        { status: 403 }
      );
    }

    const {
      text,
      scheduledAt,
      accountIds,
      targets: requestedTargets,
      // Legacy client flag, superseded by mediaCount below; still accepted
      // so older composers keep working (unknown fields are ignored).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      hasMedia = false,
      mediaCount: rawMediaCount,
      bulkBatchSize: rawBulkBatchSize,
      clientOperationId: rawOperationId,
    } = await request.json();

    // Idempotency key: one user action = one key. Header wins over the
    // body field; both accept plain UUIDs (single composer) and
    // "<uuid>:<slot>" bulk item keys. Invalid values are ignored
    // (legacy non-idempotent create) — never trusted, never stored.
    const headerKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
    const operationId =
      normalizeOperationId(headerKey) ??
      normalizeOperationId(rawOperationId) ??
      (isValidBulkOperationId(headerKey) || isValidBulkOperationId(rawOperationId)
        ? String(isValidBulkOperationId(headerKey) ? headerKey : rawOperationId)
        : null);

    // Replay fast-path: this action already created its post (retry after
    // a network timeout, double-submit that arrived sequentially). Return
    // the existing row WITHOUT consuming quota again.
    if (operationId) {
      const existing = await prisma.post.findFirst({
        where: { userId: user.id, clientOperationId: operationId },
        include: { targets: true },
      });
      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
    }

    // Server-side bulk gate: an attested batch must fit the plan. Free has
    // no bulk; paid plans cap videos per batch. Undeclared sequential
    // creates stay bounded by the monthly quota backstop.
    const bulkGate = checkBulkBatch(effective, rawBulkBatchSize);
    if (!bulkGate.ok) {
      if ("invalid" in bulkGate) {
        return NextResponse.json(
          { error: "Invalid bulk batch size" },
          { status: 400 }
        );
      }
      const denial = bulkGate.denial;
      return NextResponse.json(
        { code: denial.code, reason: denial.reason, upgradeTo: denial.upgradeTo },
        { status: 403 }
      );
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const requestedAccountIds = Array.isArray(accountIds)
      ? [...new Set(accountIds.filter((id: unknown): id is string => typeof id === "string"))]
      : [];
    const requestedTargetRows = Array.isArray(requestedTargets)
      ? requestedTargets
      : [];

    const selectedIds = requestedAccountIds.length
      ? requestedAccountIds
      : requestedTargetRows
          .filter((target: unknown): target is { accountId: string } =>
            Boolean(target) && typeof target === "object" && typeof (target as { accountId?: unknown }).accountId === "string"
          )
          .map((target) => target.accountId);

    // Every PostTarget must bind a concrete socialAccountId. The legacy
    // platform-string fallback ("post to my THREADS/X account") cannot
    // choose between several accounts on one platform, so it fails closed.
    if (selectedIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one connected social account" },
        { status: 400 }
      );
    }
    const accounts = await prisma.socialAccount.findMany({
      where: { id: { in: selectedIds }, userId: user.id },
    });

    if (selectedIds.length !== accounts.length) {
      return NextResponse.json(
        { error: "One or more selected social accounts are unavailable" },
        { status: 400 }
      );
    }

    const selected = validateTargetAccountSelection(accounts, selectedIds, user.id);
    if (!selected.ok) {
      return NextResponse.json({ error: selected.error }, { status: 400 });
    }
    const selectedAccounts = selected.accounts;

    // Defense-in-depth: re-check global text length and declared media
    // count server-side instead of trusting client validation alone.
    const mediaCount =
      typeof rawMediaCount === "number" ? rawMediaCount : null;
    const content = validateCreatePostContent({
      text: text.trim(),
      mediaCount,
      platforms: selectedAccounts.map((account) => account.platform),
    });
    if (!content.ok) {
      return NextResponse.json({ error: content.error }, { status: 400 });
    }

    if (selectedAccounts.some((account) => account.platform === "X") && scheduledAt) {
      return NextResponse.json(
        {
          error:
            "Scheduling for X is not available yet. Use Threads to schedule a post.",
        },
        { status: 400 }
      );
    }

    const isScheduled = Boolean(scheduledAt);

    let scheduledAtDate: Date | null = null;
    if (isScheduled) {
      const validation = validateScheduledAt(scheduledAt);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }
      scheduledAtDate = validation.date;
    }

    const overridesByAccount = new Map<string, unknown>();
    for (const target of requestedTargetRows) {
      if (!target || typeof target !== "object") continue;
      const accountId = (target as { accountId?: unknown }).accountId;
      if (typeof accountId === "string") {
        overridesByAccount.set(accountId, (target as { overrides?: unknown }).overrides ?? null);
      }
    }
    const targets: {
      socialAccountId: string;
      platform: typeof accounts[number]["platform"];
      status: "PENDING";
      overrides: Prisma.InputJsonValue;
    }[] = [];
    for (const account of selectedAccounts) {
      const rawOverrides = overridesByAccount.get(account.id) ?? null;
      const validation = validateTargetOverrides(account.platform, rawOverrides);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      targets.push({
        socialAccountId: account.id,
        platform: account.platform,
        status: "PENDING" as const,
        overrides: validation.overrides as Prisma.InputJsonValue,
      });
    }

    // Atomic Free creation kernel (authoritative for Free): the monthly
    // allowance belongs to the abuse identity shared by every linked user,
    // so new accounts cannot mint fresh Free quota. Identity claim +
    // per-user claim + insert run in ONE transaction — a failed insert
    // rolls every ledger mutation back (no phantom consumption, no
    // double-spend on retry) and concurrent last-slot attempts grant
    // exactly one winner. Paid plans and the admin bypass skip this
    // entirely — each paid subscription keeps its own per-user limits.
    // Transient identity-store failures degrade to the PostUsage-only path
    // (still gated); a missing migration/misconfiguration fails closed.
    const monthStart = getMonthStart();
    const enforceAbuse = isAbuseEnforcementEnabled();
    const isFreePlan = effective.plan === "free" && !effective.bypass;
    const freeLimit =
      isFreePlan && effective.entitlements.monthlyPosts !== null
        ? (effective.entitlements.monthlyPosts as number)
        : null;
    // Simultaneous double-delivery with the same key: the loser hits the
    // unique index. Resolve it to the winner's row instead of a 500.
    const resolveConflict = async () => {
      if (!operationId) return null;
      return prisma.post.findFirst({
        where: { userId: user.id, clientOperationId: operationId },
        include: { targets: true },
      });
    };

    let created: Awaited<ReturnType<typeof createWithMonthlyQuota>> | null =
      null;
    if (freeLimit !== null) {
      let kernel: Awaited<ReturnType<typeof createFreePostAtomic>> | null = null;
      try {
        kernel = await createFreePostAtomic({
          userId: user.id,
          email: user.email,
          limit: freeLimit,
          enforce: enforceAbuse,
          pepper: getAbusePepper(),
          period: getPeriodKey(),
          monthStart,
          buildInsert: (tx) =>
            tx.post.create({
              data: {
                userId: user.id,
                text: text.trim(),
                status: isScheduled ? "SCHEDULED" : "DRAFT",
                scheduledAt: scheduledAtDate,
                publishedAt: null,
                clientOperationId: operationId,
                targets: { create: targets },
              },
              include: { targets: true },
            }),
          liveCountForBackfill: () =>
            prisma.post.count({
              where: { userId: user.id, createdAt: { gte: monthStart } },
            }),
          legacyInsert: () =>
            prisma.post.create({
              data: {
                userId: user.id,
                text: text.trim(),
                status: isScheduled ? "SCHEDULED" : "DRAFT",
                scheduledAt: scheduledAtDate,
                publishedAt: null,
                clientOperationId: operationId,
                targets: { create: targets },
              },
              include: { targets: true },
            }),
        });
      } catch (error) {
        // Inside the kernel transaction the insert rolls every ledger
        // mutation back, so the loser consumed nothing — safe to replay.
        if (operationId && isIdempotencyConflict(error)) {
          const replay = await resolveConflict();
          if (replay) return NextResponse.json(replay, { status: 200 });
        }
        throw error;
      }
      if (!kernel || !kernel.ok) {
        const observed = kernel && !kernel.ok ? kernel.observed : undefined;
        return NextResponse.json(
          {
            code: "UPGRADE_REQUIRED",
            reason:
              kernel && !kernel.ok && kernel.code === "RESTRICTED"
                ? "This account is restricted. Contact support."
                : `Monthly post limit reached (${observed ?? freeLimit}/${freeLimit}).`,
            upgradeTo: getUpgradeTarget(effective.plan),
          },
          { status: 403 }
        );
      }
      return NextResponse.json(kernel.value, { status: 201 });
    }
    try {
      created = await createWithMonthlyQuota({
        userId: user.id,
        limit: effective.entitlements.monthlyPosts,
        bypass: effective.bypass,
        liveCount: () =>
          prisma.post.count({
            where: { userId: user.id, createdAt: { gte: monthStart } },
          }),
        quota: liveQuotaStore,
        insert: () =>
          prisma.post.create({
            data: {
              userId: user.id,
              text: text.trim(),
              status: isScheduled ? "SCHEDULED" : "DRAFT",
              scheduledAt: scheduledAtDate,
              publishedAt: null,
              clientOperationId: operationId,
              targets: { create: targets },
            },
            include: { targets: true },
          }),
      });
    } catch (error) {
      // Fail-closed quota note: the claim was already granted before the
      // insert, so a true-simultaneous duplicate burns one unit — the
      // sequential-retry path (lookup above) never reaches here.
      if (operationId && isIdempotencyConflict(error)) {
        const replay = await resolveConflict();
        if (replay) return NextResponse.json(replay, { status: 200 });
      }
      throw error;
    }
    if (!created.ok) {
      const denial = canCreatePost(effective, {
        ...usage,
        postsThisMonth: created.observed,
      });
      if (!denial.ok) {
        return NextResponse.json(
          { code: denial.code, reason: denial.reason, upgradeTo: denial.upgradeTo },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          code: "UPGRADE_REQUIRED",
          reason: "Monthly post limit reached.",
          upgradeTo: getUpgradeTarget(effective.plan),
        },
        { status: 403 }
      );
    }
    const post = created.value;

    return NextResponse.json(post, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
