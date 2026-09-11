import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  body?: { code?: string; message?: string };
}

export function passwordErrorMessage(
  error: unknown,
  mode: "set" | "change"
): string | null {
  const e = error as ApiErrorLike;
  const errorStatus = e.statusCode ?? e.status;
  if (typeof errorStatus !== "number") return null;
  if (errorStatus < 400 || errorStatus >= 500) return null;
  const code = e.body?.code ?? e.code;
  const message = e.body?.message ?? e.message;
  if (mode === "set") {
    if (code === "PASSWORD_ALREADY_SET")
      return "A password is already set for this account.";
    if (code === "PASSWORD_TOO_SHORT")
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (code === "PASSWORD_TOO_LONG")
      return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
    return message || "Unable to set password";
  }
  if (code === "INVALID_PASSWORD") return "Current password is incorrect";
  if (code === "PASSWORD_TOO_SHORT")
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (code === "PASSWORD_TOO_LONG")
    return `New password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
  return message || "Unable to change password";
}

export function validatePassword(newPassword: string): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH)
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (newPassword.length > MAX_PASSWORD_LENGTH)
    return `New password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
  return null;
}

export async function POST(request: NextRequest) {
  let mode: "set" | "change" = "change";
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!newPassword) {
      return NextResponse.json({ error: "All password fields are required" }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "New passwords do not match" }, { status: 400 });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true, password: true },
    });

    const hasPassword = Boolean(account?.password);

    if (hasPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
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
    }

    mode = "set";
    await auth.api.setPassword({
      body: { newPassword },
      headers: await headers(),
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = passwordErrorMessage(error, mode);
    if (message) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }
}