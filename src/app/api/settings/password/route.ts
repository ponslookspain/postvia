import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, getApiUser } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function applyAuthHeaders(res: NextResponse, authHeaders?: Headers): NextResponse {
  if (!authHeaders) return res;
  authHeaders.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") res.headers.append(key, value);
    else res.headers.set(key, value);
  });
  return res;
}

interface ApiErrorLike {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
}

function passwordErrorMessage(error: unknown): string | null {
  const e = error as ApiErrorLike;
  const errorStatus = e.statusCode ?? e.status;
  if (typeof errorStatus !== "number") return null;
  if (errorStatus < 400 || errorStatus >= 500) return null;
  if (e.code === "INVALID_PASSWORD") return "Current password is incorrect";
  if (e.code === "PASSWORD_TOO_SHORT")
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (e.code === "PASSWORD_TOO_LONG")
    return `New password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
  return e.message || "Unable to change password";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "All password fields are required" },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New passwords do not match" },
        { status: 400 }
      );
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `New password must be ${MAX_PASSWORD_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const result = await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
      returnHeaders: true,
      returnStatus: true,
    });

    const res = NextResponse.json({ ok: true });
    return applyAuthHeaders(res, result.headers);
  } catch (error) {
    const message = passwordErrorMessage(error);
    if (message) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}