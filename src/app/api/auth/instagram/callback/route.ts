import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCanConnectAccount } from "@/lib/entitlements";
import { reportError } from "@/lib/diagnostics";
import {
  exchangeInstagramCode,
  fetchInstagramProfile,
  isInstagramConfigured,
} from "@/lib/social/instagram";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(errorParam)}`, request.url)
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/accounts?error=missing_parameters", request.url)
    );
  }

  const storedState = request.cookies.get("instagram_oauth_state")?.value;
  if (!storedState) {
    return NextResponse.redirect(new URL("/accounts?error=invalid_session", request.url));
  }
  // Timing-safe state comparison.
  if (state.length !== storedState.length) {
    return clearState(
      NextResponse.redirect(new URL("/accounts?error=invalid_state", request.url))
    );
  }
  let diff = 0;
  for (let i = 0; i < state.length; i++) {
    diff |= state.charCodeAt(i) ^ storedState.charCodeAt(i);
  }
  if (diff !== 0) {
    return clearState(
      NextResponse.redirect(new URL("/accounts?error=invalid_state", request.url))
    );
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return clearState(
        NextResponse.redirect(new URL("/accounts?error=invalid_session", request.url))
      );
    }
    if (!isInstagramConfigured()) {
      return clearState(
        NextResponse.redirect(new URL("/accounts?error=instagram_not_configured", request.url))
      );
    }

    const tokens = await exchangeInstagramCode(code);
    const profile = await fetchInstagramProfile(tokens.accessToken);
    if (!profile.id) {
      return clearState(
        NextResponse.redirect(new URL("/accounts?error=instagram_profile_failed", request.url))
      );
    }
    // Content Publishing requires a Professional (Business/Creator) account.
    if (profile.accountType && profile.accountType === "PERSONAL") {
      return clearState(
        NextResponse.redirect(new URL("/accounts?error=instagram_personal_account", request.url))
      );
    }

    const existing = await prisma.socialAccount.findFirst({
      where: { userId: user.id, platform: "INSTAGRAM", externalId: profile.id },
    });
    const accountData = {
      username: profile.username,
      accessToken: tokens.accessToken,
      // Instagram long-lived tokens have no separate refresh token.
      refreshToken: null,
      expiresAt: tokens.expiresAt,
    };
    if (existing) {
      await prisma.socialAccount.update({
        where: { id: existing.id },
        data: accountData,
      });
    } else {
      const gate = await assertCanConnectAccount({
        userId: user.id,
        userEmail: user.email,
        platform: "INSTAGRAM",
      });
      if (!gate.ok) {
        return clearState(
          NextResponse.redirect(
            new URL(
              `/accounts?error=account_limit_reached${gate.upgradeTo ? `&upgradeTo=${gate.upgradeTo}` : ""}`,
              request.url
            )
          )
        );
      }
      await prisma.socialAccount.create({
        data: {
          userId: user.id,
          platform: "INSTAGRAM",
          externalId: profile.id,
          ...accountData,
        },
      });
    }

    return clearState(
      NextResponse.redirect(new URL("/accounts?connected=instagram", request.url))
    );
  } catch (error) {
    // Presence flags only: the code/state values themselves are secrets.
    // Generic failure: never surface raw token/API internals to the URL.
    reportError("oauth", "instagram callback failed", error, {
      provider: "INSTAGRAM",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    return clearState(
      NextResponse.redirect(new URL("/accounts?error=instagram_callback_failed", request.url))
    );
  }
}

function clearState(response: NextResponse): NextResponse {
  response.cookies.delete("instagram_oauth_state");
  return response;
}
