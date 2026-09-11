import { NextRequest, NextResponse } from "next/server";
import { ThreadsProvider } from "@/lib/social/threads";
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
  const storedState = cookieStore.get("threads_oauth_state")?.value;

  if (!storedState) {
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
      await prisma.socialAccount.create({
        data: { userId: user.id, platform: "THREADS", ...accountData },
      });
    }

    const response = NextResponse.redirect(
      new URL("/accounts?connected=true", request.url)
    );
    response.cookies.delete("threads_oauth_state");
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
