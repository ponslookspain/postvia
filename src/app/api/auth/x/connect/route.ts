import { NextRequest, NextResponse } from "next/server";
import { XProvider } from "@/lib/social/x";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "@/lib/social/pkce";
import { cookies } from "next/headers";
import { getApiUser } from "@/lib/auth";
import { applyDeviceCookie, gateOAuthInit } from "@/lib/abuse";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!(await gateOAuthInit(request))) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    const xProvider = new XProvider();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const cookieStore = await cookies();
    cookieStore.set("x_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    cookieStore.set("x_oauth_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const authorizeUrl = xProvider.getAuthorizeUrl(state, codeChallenge);

    return applyDeviceCookie(
      NextResponse.json({ url: authorizeUrl }),
      request,
      request.cookies.get("pv_did")?.value ?? null
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
