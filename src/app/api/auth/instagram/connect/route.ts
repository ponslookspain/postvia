import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiUser } from "@/lib/auth";
import { generateState } from "@/lib/social/pkce";
import {
  getInstagramAuthorizeUrl,
  isInstagramConfigured,
} from "@/lib/social/instagram";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!isInstagramConfigured()) {
      return NextResponse.json(
        { error: "Instagram is not configured on this deployment" },
        { status: 500 }
      );
    }

    const state = generateState();
    const cookieStore = await cookies();
    cookieStore.set("instagram_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return NextResponse.json({ url: getInstagramAuthorizeUrl(state) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
