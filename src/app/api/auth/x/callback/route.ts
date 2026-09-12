import { NextRequest, NextResponse } from "next/server";
import { XProvider } from "@/lib/social/x";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { assertCanConnectAccount } from "@/lib/entitlements";
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

  if (state !== storedState) {
    return NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
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
      const gate = await assertCanConnectAccount({
        userId: user.id,
        userEmail: user.email,
        platform: "X",
      });
      if (!gate.ok) {
        return NextResponse.redirect(
          new URL(
            `/accounts?error=account_limit_reached${gate.upgradeTo ? `&upgradeTo=${gate.upgradeTo}` : ""}`,
            request.url
          )
        );
      }
      await prisma.socialAccount.create({
        data: { userId: user.id, platform: "X", ...accountData },
      });
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
