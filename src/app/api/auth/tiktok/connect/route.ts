import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiUser } from "@/lib/auth";
import { generateState } from "@/lib/social/pkce";
import {
  getTiktokAuthorizeUrl,
  isTiktokConfigured,
} from "@/lib/social/tiktok";
import { applyDeviceCookie, gateOAuthInit } from "@/lib/abuse";

export async function GET(request: NextRequest) {
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

    if (!(await gateOAuthInit(request))) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
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

    return applyDeviceCookie(
      NextResponse.json({ url: getTiktokAuthorizeUrl(state) }),
      request,
      request.cookies.get("pv_did")?.value ?? null
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
