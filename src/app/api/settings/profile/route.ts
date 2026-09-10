import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, getApiUser } from "@/lib/auth";

const MAX_NAME_LENGTH = 50;

function applyAuthHeaders(res: NextResponse, authHeaders?: Headers): NextResponse {
  if (!authHeaders) return res;
  authHeaders.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") res.headers.append(key, value);
    else res.headers.set(key, value);
  });
  return res;
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const rawName = typeof body?.name === "string" ? body.name : "";
    const name = rawName.trim();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const result = await auth.api.updateUser({
      body: { name },
      headers: await headers(),
      returnHeaders: true,
      returnStatus: true,
    });

    const res = NextResponse.json({ ok: true, user: result.response });
    return applyAuthHeaders(res, result.headers);
  } catch {
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}