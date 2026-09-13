import { NextRequest, NextResponse } from "next/server";
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
  const storedState = cookieStore.get("x_oauth_state")?.value;
  const codeVerifier = cookieStore.get("x_oauth_verifier")?.value;

  if (!storedState || !codeVerifier) {
    return NextResponse.redirect(
      new URL("/accounts?error=invalid_session", request.url)
    );
  }

  if (state.length !== storedState.length) {
    return NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
  }
  let stateDiff = 0;
  for (let i = 0; i < state.length; i++) {
    stateDiff |= state.charCodeAt(i) ^ storedState.charCodeAt(i);
  }
  if (stateDiff !== 0) {
    return NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Callback flood protection (initiation-only limits leave this path
    // open): per-IP + per-user buckets. Denied attempts redirect, never 500.
    if (!(await gateOAuthCallback({ request, userId: user.id }))) {
      return NextResponse.redirect(
        new URL("/accounts?error=too_many_requests", request.url)
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
      await prisma.socialAccount.update({
        where: { id: existingAccount.id },
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
        return NextResponse.redirect(
          new URL(`/accounts?error=${abuseGate.errorParam}`, request.url)
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
          return NextResponse.redirect(
            new URL("/accounts?error=account_in_use", request.url)
          );
        }
        return NextResponse.redirect(
          new URL(
            `/accounts?error=account_limit_reached${linked.upgradeTo ? `&upgradeTo=${linked.upgradeTo}` : ""}`,
            request.url
          )
        );
      }
    }

    const response = NextResponse.redirect(
      new URL("/accounts?connected=true", request.url)
    );
    response.cookies.delete("x_oauth_state");
    response.cookies.delete("x_oauth_verifier");
    return response;
  } catch (err) {
    // Presence flags only: the code/state values themselves are secrets.
    reportError("oauth", "x callback failed", err, {
      provider: "X",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    const message =
      err instanceof Error ? err.message : "callback_failed";
    return NextResponse.redirect(
      new URL(
        `/accounts?error=${encodeURIComponent(message)}`,
        request.url
      )
    );
  }
}
