import { NextRequest, NextResponse } from "next/server";
import { XProvider } from "@/lib/social/x";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";

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

    await prisma.socialAccount.upsert({
      where: {
        userId_platform: {
          userId: user.id,
          platform: "X",
        },
      },
      update: {
        externalId: xUser.externalId,
        username: xUser.username,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      create: {
        userId: user.id,
        platform: "X",
        externalId: xUser.externalId,
        username: xUser.username,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });

    const response = NextResponse.redirect(
      new URL("/accounts?connected=true", request.url)
    );
    response.cookies.delete("x_oauth_state");
    response.cookies.delete("x_oauth_verifier");
    return response;
  } catch (err) {
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
