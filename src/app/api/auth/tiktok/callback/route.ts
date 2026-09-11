import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import {
  exchangeTiktokCode,
  fetchTiktokUserInfo,
} from "@/lib/social/tiktok";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(error)}`, request.url)
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/accounts?error=missing_parameters", request.url)
    );
  }

  const cookieStore = await request.cookies;
  const storedState = cookieStore.get("tiktok_oauth_state")?.value;
  const response = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!storedState) {
    return response("/accounts?error=invalid_session");
  }
  if (!timingSafeEqual(state, storedState)) {
    return response("/accounts?error=invalid_state");
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return response("/accounts?error=invalid_session");
    }

    // Code exchange happens strictly server-side; the client secret never
    // reaches the browser and tokens are only persisted to the database.
    const tokens = await exchangeTiktokCode(code);
    let displayName = "";
    try {
      const profile = await fetchTiktokUserInfo(tokens.access_token);
      displayName = profile.displayName;
    } catch {
      // user.info is best-effort here; creator info later refines the handle
    }

    const accountData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      username: displayName || "TikTok user",
    };
    const existing = await prisma.socialAccount.findFirst({
      where: {
        userId: user.id,
        platform: "TIKTOK",
        externalId: tokens.open_id,
      },
      select: { id: true },
    });
    if (existing) {
      // Reconnect: rotate tokens in place, never duplicate the account.
      await prisma.socialAccount.update({
        where: { id: existing.id },
        data: accountData,
      });
    } else {
      await prisma.socialAccount.create({
        data: {
          userId: user.id,
          platform: "TIKTOK",
          externalId: tokens.open_id,
          ...accountData,
        },
      });
    }

    const redirect = response("/accounts?connected=true");
    redirect.cookies.delete("tiktok_oauth_state");
    return redirect;
  } catch {
    // Never surface raw TikTok/token errors to the query string.
    return response("/accounts?error=tiktok_callback_failed");
  }
}
