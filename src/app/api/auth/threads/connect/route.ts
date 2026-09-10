import { NextResponse } from "next/server";
import { ThreadsProvider } from "@/lib/social/threads";
import { generateState } from "@/lib/social/pkce";
import { cookies } from "next/headers";
import { getApiUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const threadsProvider = new ThreadsProvider();
    const state = generateState();

    const cookieStore = await cookies();
    cookieStore.set("threads_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const authorizeUrl = threadsProvider.getAuthorizeUrl(state);

    return NextResponse.json({ url: authorizeUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}