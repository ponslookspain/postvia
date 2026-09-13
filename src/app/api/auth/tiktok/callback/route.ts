import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
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

/**
 * TikTok error codes are browser-controlled input: only whitelisted
 * values may reach the redirect query string. Everything else collapses
 * to tiktok_callback_failed so raw provider messages never leak.
 */
const KNOWN_OAUTH_ERRORS = new Set([
  "access_denied",
  "invalid_state",
  "invalid_session",
  "missing_parameters",
  "tiktok_callback_failed",
  "account_limit_reached",
  "account_in_use",
  "connection_restricted",
  "connection_cooldown",
]);

function safeOAuthError(value: string | null): string {
  if (value && KNOWN_OAUTH_ERRORS.has(value)) return value;
  return "tiktok_callback_failed";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");

  const redirectWith = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    redirect.cookies.delete("tiktok_oauth_state");
    return redirect;
  };

  if (providerError) {
    // User denial or provider-side failure: never echo error_description
    // (may contain secrets); map to a whitelisted code only.
    return redirectWith(`/accounts?error=${encodeURIComponent(safeOAuthError(providerError))}`);
  }
  if (!code || !state) {
    return redirectWith("/accounts?error=missing_parameters");
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("tiktok_oauth_state")?.value;
  // Every exit clears the single-use state cookie (same hygiene as the
  // Instagram callback): a stale state must never survive a failed attempt.
  const response = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    redirect.cookies.delete("tiktok_oauth_state");
    return redirect;
  };

  if (!storedState) {
    return redirectWith("/accounts?error=invalid_session");
  }
  if (!timingSafeEqual(state, storedState)) {
    return redirectWith("/accounts?error=invalid_state");
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return response("/accounts?error=invalid_session");
    }

    // Callback flood protection (initiation-only limits leave this path
    // open): per-IP + per-user buckets.
    if (!(await gateOAuthCallback({ request, userId: user.id }))) {
      return response("/accounts?error=too_many_requests");
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
      // Abuse gate for fresh links (reconnects above skip it).
      const abuseCookies = await cookies();
      const effectiveForAbuse = await getEffectivePlan({
        userId: user.id,
        userEmail: user.email,
      });
      const abuseGate = await gateNewSocialLink({
        userId: user.id,
        userEmail: user.email,
        platform: "TIKTOK",
        externalId: tokens.open_id,
        deviceCookieHeader: abuseCookies.get("pv_did")?.value ?? null,
        isPaid:
          effectiveForAbuse.bypass ||
          isPaidActivePlan(effectiveForAbuse.plan, effectiveForAbuse.status),
      });
      if (!abuseGate.ok) {
        return response(`/accounts?error=${abuseGate.errorParam}`);
      }
      const linked = await createSocialAccountRaceSafe({
        userId: user.id,
        platform: "TIKTOK",
        externalId: tokens.open_id,
        data: { externalId: tokens.open_id, ...accountData },
        effective: effectiveForAbuse,
      });
      if (!linked.ok) {
        if (linked.code === "account_in_use") {
          return response("/accounts?error=account_in_use");
        }
        return response(
          `/accounts?error=account_limit_reached${linked.upgradeTo ? `&upgradeTo=${linked.upgradeTo}` : ""}`
        );
      }
    }

    return response("/accounts?connected=true");
  } catch (error) {
    // Presence flags only: the code/state values themselves are secrets.
    // Raw TikTok/token errors never reach the query string.
    reportError("oauth", "tiktok callback failed", error, {
      provider: "TIKTOK",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    return response("/accounts?error=tiktok_callback_failed");
  }
}
