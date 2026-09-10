import { NextResponse } from "next/server";
import { XProvider } from "@/lib/social/x";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "@/lib/social/pkce";
import { cookies } from "next/headers";
import { getApiUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

    return NextResponse.json({ url: authorizeUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
