import { NextRequest, type NextResponse } from "next/server";
import { oauthRedirect } from "@/lib/oauth-redirect";
import { getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePlan } from "@/lib/entitlements";
import { createSocialAccountRaceSafe } from "@/lib/social-accounts";
import {
  gateNewSocialLink,
  gateOAuthCallback,
  isPaidActivePlan,
} from "@/lib/abuse";
import { reportError } from "@/lib/diagnostics";
import {
  exchangeInstagramCode,
  fetchInstagramProfile,
  isInstagramConfigured,
} from "@/lib/social/instagram";

// All redirects below go through oauthRedirect(): Next.js builds
// request.url from the server's listen address (localhost:3000 in dev),
// so absolute redirects derived from it would bounce ngrok users to
// https://localhost:3000. The helper rebuilds the origin from validated
// proxy headers instead — correct on ngrok / localhost / postvia.online /
// Preview. (NextResponse.redirect() rejects relative URLs, so a
// root-relative Location is not an option.)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return oauthRedirect(request,
      `/accounts?error=${encodeURIComponent(errorParam)}`
    );
  }
  if (!code || !state) {
    return oauthRedirect(request,
      "/accounts?error=missing_parameters"
    );
  }

  const storedState = request.cookies.get("instagram_oauth_state")?.value;
  if (!storedState) {
    return oauthRedirect(request,"/accounts?error=invalid_session");
  }
  // Timing-safe state comparison.
  if (state.length !== storedState.length) {
    return clearState(
      oauthRedirect(request,"/accounts?error=invalid_state")
    );
  }
  let diff = 0;
  for (let i = 0; i < state.length; i++) {
    diff |= state.charCodeAt(i) ^ storedState.charCodeAt(i);
  }
  if (diff !== 0) {
    return clearState(
      oauthRedirect(request,"/accounts?error=invalid_state")
    );
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return clearState(
        oauthRedirect(request,"/accounts?error=invalid_session")
      );
    }
    // Callback flood protection (initiation-only limits leave this path
    // open): per-IP + per-user buckets.
    if (!(await gateOAuthCallback({ request, userId: user.id }))) {
      return clearState(
        oauthRedirect(request,"/accounts?error=too_many_requests")
      );
    }
    if (!isInstagramConfigured()) {
      return clearState(
        oauthRedirect(request,"/accounts?error=instagram_not_configured")
      );
    }

    const tokens = await exchangeInstagramCode(code);
    const profile = await fetchInstagramProfile(tokens.accessToken);
    if (!profile.id) {
      return clearState(
        oauthRedirect(request,"/accounts?error=instagram_profile_failed")
      );
    }
    // Content Publishing requires a Professional (Business/Creator) account.
    if (profile.accountType && profile.accountType === "PERSONAL") {
      return clearState(
        oauthRedirect(request,"/accounts?error=instagram_personal_account")
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
      // Abuse gate for fresh links (reconnects above skip it).
      const effectiveForAbuse = await getEffectivePlan({
        userId: user.id,
        userEmail: user.email,
      });
      const abuseGate = await gateNewSocialLink({
        userId: user.id,
        userEmail: user.email,
        platform: "INSTAGRAM",
        externalId: profile.id,
        deviceCookieHeader:
          request.cookies.get("pv_did")?.value ?? null,
        isPaid:
          effectiveForAbuse.bypass ||
          isPaidActivePlan(effectiveForAbuse.plan, effectiveForAbuse.status),
      });
      if (!abuseGate.ok) {
        return clearState(
          oauthRedirect(request,
            `/accounts?error=${abuseGate.errorParam}`
          )
        );
      }
      const linked = await createSocialAccountRaceSafe({
        userId: user.id,
        platform: "INSTAGRAM",
        externalId: profile.id,
        data: { externalId: profile.id, ...accountData },
        effective: effectiveForAbuse,
      });
      if (!linked.ok) {
        if (linked.code === "account_in_use") {
          return clearState(
            oauthRedirect(request,"/accounts?error=account_in_use")
          );
        }
        return clearState(
          oauthRedirect(request,
            `/accounts?error=account_limit_reached${linked.upgradeTo ? `&upgradeTo=${linked.upgradeTo}` : ""}`
          )
        );
      }
    }

    return clearState(
      oauthRedirect(request,"/accounts?connected=instagram")
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
      oauthRedirect(request,"/accounts?error=instagram_callback_failed")
    );
  }
}

function clearState(response: NextResponse): NextResponse {
  response.cookies.delete("instagram_oauth_state");
  return response;
}
