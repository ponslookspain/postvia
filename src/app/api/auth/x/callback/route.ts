import { NextRequest } from "next/server";
import { oauthRedirect, safeProviderError } from "@/lib/oauth-redirect";
import { XProvider } from "@/lib/social/x";
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

  // Every exit clears the single-use state/verifier cookies so a stale
  // state never survives a failed attempt (same hygiene as TikTok/Instagram).
  const redirectWith = (path: string) => {
    const redirect = oauthRedirect(request, path);
    redirect.cookies.delete("x_oauth_state");
    redirect.cookies.delete("x_oauth_verifier");
    return redirect;
  };

  if (error) {
    // Provider error params are browser-controlled: whitelist only.
    return redirectWith(
      `/accounts?error=${encodeURIComponent(safeProviderError(error, "x_callback_failed"))}`
    );
  }

  if (!code || !state) {
    return redirectWith(
      "/accounts?error=missing_parameters"
    );
  }

  const cookieStore = await request.cookies;
  const storedState = cookieStore.get("x_oauth_state")?.value;
  const codeVerifier = cookieStore.get("x_oauth_verifier")?.value;

  if (!storedState || !codeVerifier) {
    return redirectWith(
      "/accounts?error=invalid_session"
    );
  }

  if (state.length !== storedState.length) {
    return redirectWith(
      "/accounts?error=invalid_state"
    );
  }
  let stateDiff = 0;
  for (let i = 0; i < state.length; i++) {
    stateDiff |= state.charCodeAt(i) ^ storedState.charCodeAt(i);
  }
  if (stateDiff !== 0) {
    return redirectWith(
      "/accounts?error=invalid_state"
    );
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return redirectWith("/login");
    }

    // Callback flood protection (initiation-only limits leave this path
    // open): per-IP + per-user buckets. Denied attempts redirect, never 500.
    if (!(await gateOAuthCallback({ request, userId: user.id }))) {
      return redirectWith(
        "/accounts?error=too_many_requests"
      );
    }

    const xProvider = new XProvider();
    const tokens = await xProvider.exchangeCode(code, codeVerifier);
    const xUser = await xProvider.getCurrentUser(tokens.accessToken);

    const existingAccount = await prisma.socialAccount.findFirst({
      where: {
        userId: user.id,
        platform: "X",
        externalId: xUser.externalId,
      },
      select: { id: true },
    });
    const accountData = {
      externalId: xUser.externalId,
      username: xUser.username,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    if (existingAccount) {
      // Reconnect: rotate tokens in place. updateMany scopes the write to
      // this user's row atomically (a plain update by id alone is
      // check-then-act); a concurrently deleted row simply updates nothing.
      await prisma.socialAccount.updateMany({
        where: { id: existingAccount.id, userId: user.id },
        data: accountData,
      });
    } else {
      // Abuse gate for fresh links (reconnects above skip it).
      const cookieStoreForAbuse = await request.cookies;
      const effectiveForAbuse = await getEffectivePlan({
        userId: user.id,
        userEmail: user.email,
      });
      const abuseGate = await gateNewSocialLink({
        userId: user.id,
        userEmail: user.email,
        platform: "X",
        externalId: xUser.externalId,
        deviceCookieHeader:
          cookieStoreForAbuse.get("pv_did")?.value ?? null,
        isPaid:
          effectiveForAbuse.bypass ||
          isPaidActivePlan(effectiveForAbuse.plan, effectiveForAbuse.status),
      });
      if (!abuseGate.ok) {
        return redirectWith(
          `/accounts?error=${abuseGate.errorParam}`
        );
      }
      const linked = await createSocialAccountRaceSafe({
        userId: user.id,
        platform: "X",
        externalId: xUser.externalId,
        data: accountData,
        effective: effectiveForAbuse,
      });
      if (!linked.ok) {
        if (linked.code === "account_in_use") {
          return redirectWith(
            "/accounts?error=account_in_use"
          );
        }
        return redirectWith(
          `/accounts?error=account_limit_reached${linked.upgradeTo ? `&upgradeTo=${linked.upgradeTo}` : ""}`
        );
      }
    }

    return redirectWith("/accounts?connected=true");
  } catch (err) {
    // Presence flags only: the code/state values themselves are secrets.
    // Raw error text never reaches the redirect (whitelist only).
    reportError("oauth", "x callback failed", err, {
      provider: "X",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    const message =
      err instanceof Error ? safeProviderError(err.message, "x_callback_failed") : "x_callback_failed";
    return redirectWith(
      `/accounts?error=${encodeURIComponent(message)}`
    );
  }
}
