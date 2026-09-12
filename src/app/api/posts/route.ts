import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { validateScheduledAt } from "@/lib/schedule";
import {
  canCreatePost,
  getEffectivePlan,
  getUsage,
} from "@/lib/entitlements";
import {
  validateCreatePostContent,
  validateTargetAccountSelection,
  validateTargetOverrides,
} from "@/lib/platforms/overrides";

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
      platform: rawPlatform,
      scheduledAt,
      accountIds,
      targets: requestedTargets,
      hasMedia = false,
      mediaCount: rawMediaCount,
    } = await request.json();

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

    const legacyPlatform = rawPlatform === "THREADS" ? "THREADS" : "X";
    const accounts = selectedIds.length
      ? await prisma.socialAccount.findMany({
          where: { id: { in: selectedIds }, userId: user.id },
        })
      : await prisma.socialAccount.findMany({
          where: { userId: user.id, platform: legacyPlatform },
        });

    if (selectedIds.length !== accounts.length && selectedIds.length > 0) {
      return NextResponse.json(
        { error: "One or more selected social accounts are unavailable" },
        { status: 400 }
      );
    }

    const selected = validateTargetAccountSelection(
      accounts,
      selectedIds.length ? selectedIds : accounts.map((account) => account.id),
      user.id,
      Boolean(hasMedia)
    );
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

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        text: text.trim(),
        status: isScheduled ? "SCHEDULED" : "DRAFT",
        scheduledAt: scheduledAtDate,
        publishedAt: null,
        targets: { create: targets },
      },
      include: { targets: true },
    });

    return NextResponse.json(post, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
