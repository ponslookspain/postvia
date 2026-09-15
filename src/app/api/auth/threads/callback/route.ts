import { NextRequest } from "next/server";
import { oauthRedirect } from "@/lib/oauth-redirect";
import { ThreadsProvider } from "@/lib/social/threads";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { getEffectivePlan } from "@/lib/entitlements";
import { createSocialAccountRaceSafe } from "@/lib/social-accounts";
import {
  gateNewSocialLink,
  gateOAuthCallback,
  isPaidActivePlan,
} from "@/lib/abuse";
import { reportError } from "@/lib/diagnostics";

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
  const error = searchParams.get("error");

  if (error) {
    return oauthRedirect(request,
      `/accounts?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return oauthRedirect(request,
      "/accounts?error=missing_parameters"
    );
  }

  const cookieStore = await request.cookies;
  const storedState = cookieStore.get("threads_oauth_state")?.value;

  if (!storedState) {
    return oauthRedirect(request,
      "/accounts?error=invalid_session"
    );
  }

  if (state.length !== storedState.length) {
    return oauthRedirect(request,
      "/accounts?error=invalid_state"
    );
  }
  let stateDiff = 0;
  for (let i = 0; i < state.length; i++) {
    stateDiff |= state.charCodeAt(i) ^ storedState.charCodeAt(i);
  }
  if (stateDiff !== 0) {
    return oauthRedirect(request,
      "/accounts?error=invalid_state"
    );
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return oauthRedirect(request,"/login");
    }

    // Callback flood protection (initiation-only limits leave this path
    // open): per-IP + per-user buckets. Denied attempts redirect, never 500.
    if (!(await gateOAuthCallback({ request, userId: user.id }))) {
      return oauthRedirect(request,
        "/accounts?error=too_many_requests"
      );
    }

    const threadsProvider = new ThreadsProvider();
    const tokens = await threadsProvider.exchangeCode(code);
    const threadsUser = await threadsProvider.getCurrentUser(
      tokens.accessToken
    );

    const existingAccount = await prisma.socialAccount.findFirst({
      where: {
        userId: user.id,
        platform: "THREADS",
        externalId: threadsUser.externalId,
      },
      select: { id: true },
    });
    const accountData = {
      externalId: threadsUser.externalId,
      username: threadsUser.username,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    if (existingAccount) {
      await prisma.socialAccount.update({
        where: { id: existingAccount.id },
        data: accountData,
      });
    } else {
      // Abuse gate for fresh links (reconnects above skip it): one external
      // account cannot serve two live users, and re-linked value is inherited.
      const cookieStoreForAbuse = await request.cookies;
      const effectiveForAbuse = await getEffectivePlan({
        userId: user.id,
        userEmail: user.email,
      });
      const abuseGate = await gateNewSocialLink({
        userId: user.id,
        userEmail: user.email,
        platform: "THREADS",
        externalId: threadsUser.externalId,
        deviceCookieHeader:
          cookieStoreForAbuse.get("pv_did")?.value ?? null,
        isPaid:
          effectiveForAbuse.bypass ||
          isPaidActivePlan(effectiveForAbuse.plan, effectiveForAbuse.status),
      });
      if (!abuseGate.ok) {
        return oauthRedirect(request,
          `/accounts?error=${abuseGate.errorParam}`
        );
      }
      // New connections consume plan quota (race-safe: concurrent
      // callbacks for one externalId converge, and only one winner keeps
      // the last free slot); reconnects (above) never do.
      const linked = await createSocialAccountRaceSafe({
        userId: user.id,
        platform: "THREADS",
        externalId: threadsUser.externalId,
        data: accountData,
        effective: effectiveForAbuse,
      });
      if (!linked.ok) {
        if (linked.code === "account_in_use") {
          return oauthRedirect(request,
            "/accounts?error=account_in_use"
          );
        }
        return oauthRedirect(request,
          `/accounts?error=account_limit_reached${linked.upgradeTo ? `&upgradeTo=${linked.upgradeTo}` : ""}`
        );
      }
    }

    const response = oauthRedirect(request,"/accounts?connected=true");
    response.cookies.delete("threads_oauth_state");
    return response;
  } catch (err) {
    // Presence flags only: the code/state values themselves are secrets.
    reportError("oauth", "threads callback failed", err, {
      provider: "THREADS",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    const message =
      err instanceof Error ? err.message : "callback_failed";
    return oauthRedirect(request,
      `/accounts?error=${encodeURIComponent(message)}`
    );
  }
}
