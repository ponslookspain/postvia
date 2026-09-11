import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiUser } from "@/lib/auth";
import { generateState } from "@/lib/social/pkce";
import {
  getTiktokAuthorizeUrl,
  isTiktokConfigured,
} from "@/lib/social/tiktok";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!isTiktokConfigured()) {
      return NextResponse.json(
        { error: "TikTok is not configured on this deployment" },
        { status: 500 }
      );
    }

    const state = generateState();
    const cookieStore = await cookies();
    cookieStore.set("tiktok_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return NextResponse.json({ url: getTiktokAuthorizeUrl(state) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
