import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/entitlements";
import {
  ensureFreshTiktokToken,
  publishTiktokDirectVideo,
  queryTiktokCreatorInfo,
  sniffQuickTimeBrand,
  tiktokErrorMessage,
} from "@/lib/social/tiktok";

/**
 * TEMPORARY empirical probe for P2-2 (TikTok .mov acceptance). Deleted
 * after the check — do not build on it.
 *
 * Admin-only POST multipart { file (.mov), accountId }. Bypasses ONLY the
 * app-wide MIME whitelist to answer one question: does TikTok Direct Post
 * FILE_UPLOAD accept a real QuickTime container? Everything else runs the
 * existing publish flow (token refresh, creator-info, init, chunk PUTs,
 * status monitor). No post/media rows are written; nothing from the normal
 * Composer/API validation is weakened. The probe PUBLISHES A REAL VIDEO to
 * the admin's own TikTok account (private when the account allows it) —
 * run only with explicit consent and delete the video afterwards.
 * Responses carry terminal classifications only — never tokens or secrets.
 */
export const maxDuration = 300;

const MAX_PROBE_BYTES = 100 * 1024 * 1024;

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export type ProbeAccount = {
  id: string;
  platform: string;
  username: string;
};

/**
 * Exact id match against the caller's own accounts — the same source
 * /api/accounts reads (findMany by userId). No normalization beyond the
 * trim/quote strip at the boundary: a near-miss must NOT match.
 */
export function findOwnedTikTokAccount(
  accounts: readonly ProbeAccount[],
  accountId: string
): ProbeAccount | null {
  const found = accounts.find((entry) => entry.id === accountId);
  if (!found || found.platform !== "TIKTOK") return null;
  return found;
}

/**
 * First differing index of two strings, -1 when equal. Pinpoints typos
 * that head/tail/length echoes cannot see.
 */
export function firstDiffIndex(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    if (a[index] !== b[index]) return index;
  }
  return a.length === b.length ? -1 : shared;
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user || !isAdminEmail(user.email)) return forbidden();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }
  const file = form.get("file");
  const rawAccountId = form.get("accountId");
  if (!(file instanceof Blob) || typeof rawAccountId !== "string") {
    return NextResponse.json(
      { error: "Expected multipart fields: file (.mov) and accountId" },
      { status: 400 }
    );
  }
  const accountId = rawAccountId.trim().replace(/^["']+|["']+$/g, "");
  if (!accountId) {
    return NextResponse.json(
      { error: "Expected multipart fields: file (.mov) and accountId" },
      { status: 400 }
    );
  }
  const filename = typeof (file as { name?: unknown }).name === "string"
    ? ((file as { name?: string }).name as string)
    : "probe.mov";
  if (!filename.toLowerCase().endsWith(".mov")) {
    return NextResponse.json(
      { ok: false, stage: "format", error: "Probe file must have a .mov extension" },
      { status: 400 }
    );
  }
  if (file.size <= 0 || file.size > MAX_PROBE_BYTES) {
    return NextResponse.json(
      { ok: false, stage: "format", error: "Probe file must be 1 byte to 100 MB" },
      { status: 400 }
    );
  }

  // Lookup exactly the way /api/accounts does: one findMany by userId,
  // then an exact in-JS match. No separate PK query that could disagree.
  const own = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    select: { id: true, platform: true, username: true },
  });
  const yourAccounts: ProbeAccount[] = own.map((entry) => ({
    id: entry.id,
    platform: entry.platform,
    username: entry.username,
  }));
  const match = findOwnedTikTokAccount(yourAccounts, accountId);
  if (!match) {
    const rank = (diffAt: number) =>
      diffAt === -1 ? Number.MAX_SAFE_INTEGER : diffAt;
    const closest = yourAccounts
      .map((entry) => ({
        id: entry.id,
        platform: entry.platform,
        diffAt: firstDiffIndex(accountId, entry.id),
      }))
      .sort((a, b) => rank(b.diffAt) - rank(a.diffAt))[0];
    return NextResponse.json(
      {
        ok: false,
        stage: "account",
        error:
          "TikTok account not found. Use the exact account id from yourAccounts.",
        received: accountId,
        closest: closest ?? null,
        yourAccounts,
      },
      { status: 404 }
    );
  }
  const account = await prisma.socialAccount.findFirst({
    where: { id: match.id, userId: user.id },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  });
  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        stage: "account",
        error: "TikTok account not found. Use an account id from yourAccounts.",
        received: accountId,
        yourAccounts,
      },
      { status: 404 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const container = sniffQuickTimeBrand(new Uint8Array(bytes));
  if (!container) {
    return NextResponse.json(
      { ok: false, stage: "format", error: "Not a QuickTime container (missing ftyp box)" },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await ensureFreshTiktokToken({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, stage: "token", error: tiktokErrorMessage(error) },
      { status: 502 }
    );
  }

  let privacyLevel: string;
  try {
    const creatorInfo = await queryTiktokCreatorInfo(accessToken);
    privacyLevel = creatorInfo.privacyLevelOptions.includes("SELF_ONLY")
      ? "SELF_ONLY"
      : creatorInfo.privacyLevelOptions[0] ?? "";
    if (!privacyLevel) {
      return NextResponse.json(
        {
          ok: false,
          stage: "creator-info",
          error: "TikTok did not return privacy options for this account",
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, stage: "creator-info", error: tiktokErrorMessage(error) },
      { status: 502 }
    );
  }

  const outcome = await publishTiktokDirectVideo(
    accessToken,
    {
      title: "Postvia MOV format probe — delete me",
      settings: { privacyLevel },
      videoSize: bytes.length,
      videoContentType: "video/quicktime",
    },
    {
      readChunk: async (range) => {
        const end = Math.min(range.end, bytes.length - 1);
        const chunk = Buffer.from(
          new Uint8Array(bytes).subarray(range.start, end + 1)
        );
        return chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength
        );
      },
      onPublishId: async () => {},
      pollIntervalMs: 3000,
      pollBudgetMs: 240_000,
    }
  ).catch((error: unknown) => ({
    state: "failed" as const,
    error: tiktokErrorMessage(error),
  }));

  if (outcome.state === "published") {
    return NextResponse.json({
      ok: true,
      accepted: true,
      terminal: "published",
      privacy: privacyLevel,
      container: container.brand,
    });
  }
  if (outcome.state === "processing") {
    return NextResponse.json({
      ok: true,
      accepted: false,
      terminal: "processing",
      note: "TikTok is still processing the video; format verdict undecided within the probe budget.",
    });
  }
  return NextResponse.json({
    ok: true,
    accepted: false,
    terminal: outcome.state,
    error: outcome.error,
  });
}
