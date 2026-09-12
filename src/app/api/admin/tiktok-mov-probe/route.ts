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

  // Two-step lookup: distinguish "id does not exist", "foreign row" and
  // "own row of another platform" instead of one opaque miss. Ownership
  // stays strict — foreign rows get the same generic 404 as missing ones.
  const row = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, platform: true },
  });
  // Same data /api/accounts already shows this admin; echoing it (plus a
  // fragment of their own input) pinpoints typos, wrong entries and
  // cross-login mismatches without leaking anything beyond their accounts.
  const own = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    select: { id: true, platform: true, username: true },
  });
  const yourAccounts = own.map((entry) => ({
    id: entry.id,
    platform: entry.platform,
    username: entry.username,
  }));
  const received = {
    length: accountId.length,
    head: accountId.slice(0, 4),
    tail: accountId.slice(-4),
  };
  if (!row || row.userId !== user.id) {
    return NextResponse.json(
      {
        ok: false,
        stage: "account",
        error:
          "TikTok account not found. Use an account id from yourAccounts " +
          "(same login you used for /api/accounts).",
        received,
        yourAccounts,
      },
      { status: 404 }
    );
  }
  if (row.platform !== "TIKTOK") {
    return NextResponse.json(
      {
        ok: false,
        stage: "account",
        error: `Account ${accountId} is ${row.platform}, not TIKTOK. Use a TikTok account id from yourAccounts.`,
        received,
        yourAccounts,
      },
      { status: 404 }
    );
  }
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: user.id },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  });
  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        stage: "account",
        error: "TikTok account not found. Use an account id from yourAccounts.",
        received,
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
